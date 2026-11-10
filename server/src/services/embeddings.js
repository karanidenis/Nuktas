const OpenAI = require('openai');
const db = require('../db');

// Embeddings may use a different endpoint than the chat LLM (vLLM serving a
// chat model usually has no embedding model). Never silently fall back to
// api.openai.com: transcript text is health data and must stay in-country.
const EMBED_BASE_URL = process.env.EMBED_BASE_URL || process.env.LOCALAI_BASE_URL || '';
const EMBED_MODEL = process.env.EMBED_MODEL || process.env.LOCALAI_EMBED_MODEL || '';
const EMBED_API_KEY = process.env.EMBED_API_KEY || process.env.LOCALAI_API_KEY || '';

const semanticSearchConfigured = Boolean(EMBED_BASE_URL && EMBED_MODEL);
const client = semanticSearchConfigured
  ? new OpenAI({ apiKey: EMBED_API_KEY || 'local', baseURL: EMBED_BASE_URL })
  : null;

/**
 * Generate an embedding vector for the given text.
 * Uses text-embedding-3-small (1536 dims).
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  if (!client) {
    throw new Error('Local embedding endpoint is not configured');
  }
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000), // stay within token limits
  });
  return response.data[0].embedding;
}

function mapSearchResult(r, score = null) {
  return {
    call_id: r.call_id,
    patient_name: r.patient_name ?? 'Unknown',
    patient_phone: r.patient_phone ?? null,
    chief_complaint: r.chief_complaint ?? 'No complaint recorded',
    recommended_dept: r.recommended_department ?? null,
    urgency_tier: r.urgency_tier ?? null,
    text_excerpt: (r.text_chunk ?? r.agent_summary ?? r.call_transcript ?? r.chief_complaint ?? '').slice(0, 240),
    similarity_score: score,
    date: r.inserted_at,
  };
}

/**
 * Private, in-database fallback used when a local embedding service is absent
 * or temporarily unavailable. This keeps search useful and prevents protected
 * transcript text from being sent to an accidental public provider.
 */
async function lexicalSearchTranscripts(clinicId, queryText, topK = 8) {
  const pattern = `%${queryText}%`;
  const { rows } = await db.query(
    `SELECT
       c.id AS call_id, c.inserted_at, c.chief_complaint,
       c.recommended_department, c.urgency_tier, c.agent_summary,
       c.call_transcript, p.name AS patient_name,
       p.phone_number AS patient_phone,
       concat_ws(E'\\n',
         CASE WHEN c.chief_complaint IS NOT NULL THEN 'Chief complaint: ' || c.chief_complaint END,
         CASE WHEN cardinality(c.symptoms) > 0 THEN 'Symptoms: ' || array_to_string(c.symptoms, ', ') END,
         CASE WHEN c.red_flag_details IS NOT NULL THEN 'Red flags: ' || c.red_flag_details END,
         CASE WHEN c.agent_summary IS NOT NULL THEN 'Summary: ' || c.agent_summary END,
         CASE WHEN c.call_transcript IS NOT NULL THEN 'Transcript: ' || c.call_transcript END
       ) AS text_chunk
     FROM calls c
     JOIN patients p ON p.id = c.patient_id
     WHERE c.clinic_id = $1
       AND (
         p.name ILIKE $2 OR p.phone_number ILIKE $2 OR
         c.chief_complaint ILIKE $2 OR c.call_transcript ILIKE $2 OR
         c.agent_summary ILIKE $2 OR c.red_flag_details ILIKE $2 OR
         array_to_string(c.symptoms, ' ') ILIKE $2
       )
     ORDER BY
       CASE
         WHEN lower(p.name) = lower($3) THEN 0
         WHEN p.name ILIKE $2 THEN 1
         WHEN c.chief_complaint ILIKE $2 THEN 2
         WHEN array_to_string(c.symptoms, ' ') ILIKE $2 THEN 3
         ELSE 4
       END,
       c.inserted_at DESC
     LIMIT $4`,
    [clinicId, pattern, queryText, Math.max(topK * 5, 40)]
  );

  // Older development databases may contain repeated seed calls. Present one
  // clinical record per patient/complaint while preserving the newest match.
  const seen = new Set();
  return rows
    .filter((row) => {
      const key = `${row.patient_phone ?? row.patient_name}\u0000${row.chief_complaint}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, topK)
    .map((row) => mapSearchResult(row));
}

/**
 * Cosine similarity between two equal-length float arrays.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} value in [-1, 1]
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate an embedding for a completed call and persist it.
 * Builds a rich text chunk from call data for better retrieval.
 * Fire-and-forget safe — swallows errors to avoid breaking the call flow.
 */
async function generateAndStore(callId, patientId, clinicId, callData) {
  if (!semanticSearchConfigured) return;
  try {
    const parts = [
      callData.chief_complaint    ? `Chief complaint: ${callData.chief_complaint}` : null,
      callData.symptoms?.length   ? `Symptoms: ${callData.symptoms.join(', ')}` : null,
      callData.red_flag_details   ? `Red flags: ${callData.red_flag_details}` : null,
      callData.agent_summary      ? `Summary: ${callData.agent_summary}` : null,
      callData.transcript         ? `Transcript:\n${callData.transcript}` : null,
    ].filter(Boolean);

    if (parts.length === 0) return;

    const textChunk = parts.join('\n');
    const embedding = await generateEmbedding(textChunk);

    await db.query(
      `INSERT INTO call_embeddings (call_id, patient_id, clinic_id, text_chunk, embedding)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [callId, patientId, clinicId, textChunk, JSON.stringify(embedding)]
    );
  } catch (err) {
    console.error('embeddings.generateAndStore error (non-fatal):', err.message);
  }
}

/**
 * Search call transcripts for a clinic using semantic similarity.
 * @param {string} clinicId
 * @param {string} queryText
 * @param {number} topK
 * @returns {Promise<Array>}
 */
async function searchTranscripts(clinicId, queryText, topK = 8) {
  if (!semanticSearchConfigured) {
    return { mode: 'private-keyword', results: await lexicalSearchTranscripts(clinicId, queryText, topK) };
  }

  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(queryText);
  } catch (err) {
    console.warn('semantic transcript search unavailable; using private keyword search:', err.message);
    return { mode: 'private-keyword', results: await lexicalSearchTranscripts(clinicId, queryText, topK) };
  }

  // Pull all embeddings for this clinic (JSONB → JS array)
  const { rows } = await db.query(
    `SELECT
       ce.id, ce.call_id, ce.text_chunk, ce.inserted_at,
       ce.embedding,
       p.name AS patient_name, p.phone_number AS patient_phone,
       c.urgency_tier, c.chief_complaint, c.recommended_department
     FROM call_embeddings ce
     LEFT JOIN calls    c ON c.id = ce.call_id
     LEFT JOIN patients p ON p.id = ce.patient_id
     WHERE ce.clinic_id = $1
     ORDER BY ce.inserted_at DESC
     LIMIT 500`,
    [clinicId]
  );

  if (rows.length === 0) {
    return { mode: 'private-keyword', results: await lexicalSearchTranscripts(clinicId, queryText, topK) };
  }

  // Score and sort in JS
  const scored = rows.map((row) => {
    const vec = typeof row.embedding === 'string'
      ? JSON.parse(row.embedding)
      : row.embedding;
    return { ...row, score: cosineSimilarity(queryEmbedding, vec) };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    mode: 'local-semantic',
    results: scored.slice(0, topK).map((r) => mapSearchResult(r, Math.round(r.score * 1000) / 1000)),
  };
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  generateAndStore,
  lexicalSearchTranscripts,
  searchTranscripts,
  semanticSearchConfigured,
};
