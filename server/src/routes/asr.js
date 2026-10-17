const express = require('express');

const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ASR_BASE_URL = (process.env.ASR_BASE_URL || 'http://localhost:8001').replace(/\/$/, '');

router.post('/asr/transcribe', asyncHandler(async (req, res) => {
  if (!req.is('application/octet-stream')) {
    return res.status(400).json({ error: 'Expected application/octet-stream audio' });
  }

  const response = await fetch(`${ASR_BASE_URL}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: req.body,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return res.status(502).json({ error: 'ASR service error', detail: data.detail ?? data });
  }

  res.json({ text: data.text ?? '', model_id: data.model_id ?? null, language: data.language ?? null });
}));

router.get('/asr/health', asyncHandler(async (_req, res) => {
  const response = await fetch(`${ASR_BASE_URL}/health`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return res.status(502).json({ error: 'ASR service error', detail: data.detail ?? data });
  }

  res.json(data);
}));

module.exports = router;
