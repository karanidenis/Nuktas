'use strict';

/**
 * Thin client for the Nuktas agent worker (Python, Pydantic AI).
 *
 * The API never runs the reasoning loop itself. It records an agent run, then
 * asks the worker to carry it out. The worker reports progress back to the API
 * with a service token, and does all clinical reads/writes through the MCP
 * server — so this module only needs to know how to *start* a run.
 */

function baseUrl() {
  return (process.env.AGENT_BASE_URL || '').replace(/\/+$/, '');
}

function isConfigured() {
  return Boolean(baseUrl());
}

/**
 * Ask the worker to execute a run. Returns the worker's JSON acknowledgement.
 * Throws when the worker is unreachable or returns a non-2xx status, so callers
 * can mark the run failed instead of leaving it dangling.
 *
 * @param {{ run_id: string, clinic_id: string, patient_id?: string,
 *           queue_entry_id?: string, chief_complaint?: string,
 *           language?: string, trigger?: string }} payload
 */
async function startRun(payload) {
  const base = baseUrl();
  if (!base) throw new Error('AGENT_BASE_URL is not configured');

  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.AGENT_SERVICE_TOKEN || '',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Agent service responded ${res.status}: ${detail.slice(0, 200)}`);
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Agent service timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function health() {
  const base = baseUrl();
  if (!base) return { configured: false, reachable: false };
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { configured: true, reachable: res.ok, status: res.status };
  } catch (err) {
    return { configured: true, reachable: false, error: err.message };
  }
}

module.exports = { startRun, health, isConfigured, baseUrl };
