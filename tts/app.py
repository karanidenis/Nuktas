import base64
import io
import os

import numpy as np
import torch
from fastapi import FastAPI, HTTPException

# Two interchangeable Swahili TTS engines:
#   chatterbox (default) — Resemble AI Chatterbox Multilingual, MIT-licensed, `sw` built in.
#   mms                  — Facebook MMS-TTS (`facebook/mms-tts-swh`), VITS, CC-BY-NC-4.0.
# The heavy dependencies differ (chatterbox pins torch 2.6 / transformers 5.x, MMS pins
# torch 2.2 / transformers 4.x), so each engine has its own requirements file and the
# Docker image installs only the one selected by the TTS_ENGINE build arg.
ENGINE = os.getenv("TTS_ENGINE", "chatterbox").strip().lower()
MMS_MODEL_ID = os.getenv("TTS_MODEL_ID", "facebook/mms-tts-swh")
LANGUAGE = os.getenv("TTS_LANGUAGE", "sw").strip() or "sw"

app = FastAPI(title="Nuktas TTS", version="0.2.0")

_state = {}


def _load_chatterbox():
    if "chatterbox" not in _state:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _state["chatterbox"] = ChatterboxMultilingualTTS.from_pretrained(device=device)
    return _state["chatterbox"]


def _load_mms():
    if "mms" not in _state:
        from transformers import AutoTokenizer, VitsModel

        _state["mms"] = (
            VitsModel.from_pretrained(MMS_MODEL_ID),
            AutoTokenizer.from_pretrained(MMS_MODEL_ID),
        )
    return _state["mms"]


def _synthesize(text):
    """Return (float waveform, sample rate) for the configured engine."""
    if ENGINE == "mms":
        model, tokenizer = _load_mms()
        inputs = tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            waveform = model(**inputs).waveform
        return waveform.squeeze().cpu().numpy(), model.config.sampling_rate

    model = _load_chatterbox()
    with torch.no_grad():
        wav = model.generate(text, language_id=LANGUAGE)
    return wav.squeeze().cpu().numpy(), model.sr


def _wav_bytes(waveform, sample_rate):
    """Encode a float waveform as 16-bit PCM WAV (broadest player support)."""
    from scipy.io import wavfile

    pcm = (np.clip(waveform, -1.0, 1.0) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    wavfile.write(buf, rate=sample_rate, data=pcm)
    return buf.getvalue()


def _engine_info():
    info = {"engine": ENGINE, "language": LANGUAGE}
    if ENGINE == "mms":
        info["model_id"] = MMS_MODEL_ID
    else:
        info["model_id"] = "ResembleAI/chatterbox (multilingual)"
    return info


@app.get("/health")
def health():
    return {"ok": True, **_engine_info()}


@app.post("/tts")
async def tts(request: dict):
    text = (request.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    waveform, sample_rate = _synthesize(text)
    audio_b64 = base64.b64encode(_wav_bytes(waveform, sample_rate)).decode("utf-8")

    return {
        "audio_base64": audio_b64,
        "sample_rate": sample_rate,
        **_engine_info(),
    }
