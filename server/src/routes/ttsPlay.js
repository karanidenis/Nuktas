const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();

const TTS_BASE_URL = (process.env.TTS_BASE_URL || 'http://localhost:8002').replace(/\/$/, '');

router.get('/play', async (req, res) => {
  const { text, lang } = req.query;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const ttsRes = await fetch(`${TTS_BASE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang || 'swh' }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      return res.status(502).json({ error: `TTS error: ${err}` });
    }

    const data = await ttsRes.json();

    if (!data.audio_base64) {
      return res.status(502).json({ error: 'No audio returned from TTS' });
    }

    const binary = Buffer.from(data.audio_base64, 'base64');

    res.set('Content-Type', 'audio/wav');
    res.set('Content-Disposition', 'inline');
    res.send(binary);
  } catch (err) {
    console.error('TTS playback error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;