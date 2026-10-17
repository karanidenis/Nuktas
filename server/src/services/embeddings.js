const OpenAI = require('openai');
const db = require('../db');

// Embeddings may use a different endpoint than the chat LLM (vLLM serving a
// chat model usually has no embedding model). EMBED_* is primary; LOCALAI_*
// is the legacy alias. When unset, semantic transcript search is unavailable.
const EMBED_MODEL =
  process.env.EMBED_MODEL || process.env.LOCALAI_EMBED_MODEL || 'text-embedding-3-small';

const client = new OpenAI({
  apiKey: process.env.EMBED_API_KEY || process.env.LOCALAI_API_KEY || 'localai',
  baseURL: process.env.EMBED_BASE_URL || process.env.LOCALAI_BASE_URL,
});

/**
 * Generate an embedding vector for the given text.
 * Uses text-embedding-3-small (1536 dims).
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000), // stay within token limits
  });
  return response.data[0].embedding;
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
  const queryEmbedding = await generateEmbedding(queryText);

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

  if (rows.length === 0) return [];

  // Score and sort in JS
  const scored = rows.map((row) => {
    const vec = typeof row.embedding === 'string'
      ? JSON.parse(row.embedding)
      : row.embedding;
    return { ...row, score: cosineSimilarity(queryEmbedding, vec) };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((r) => ({
    call_id:              r.call_id,
    patient_name:         r.patient_name ?? 'Unknown',
    patient_phone:        r.patient_phone ?? null,
    chief_complaint:      r.chief_complaint ?? r.text_chunk.split('\n')[0].replace('Chief complaint: ', ''),
    recommended_dept:     r.recommended_department ?? null,
    urgency_tier:         r.urgency_tier ?? null,
    text_excerpt:         r.text_chunk.slice(0, 200),
    similarity_score:     Math.round(r.score * 1000) / 1000,
    date:                 r.inserted_at,
  }));
}

module.exports = { generateEmbedding, cosineSimilarity, generateAndStore, searchTranscripts };
