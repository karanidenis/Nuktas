import io
import os

import torch
import torchaudio
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline


MODEL_ID = os.getenv("ASR_MODEL_ID", "Finiflowlabs/sauti-asr-v1")
# Whisper fine-tunes accept a forced source language; set ASR_LANGUAGE="" to auto-detect.
LANGUAGE = os.getenv("ASR_LANGUAGE", "sw").strip() or None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

app = FastAPI(title="Nuktas ASR", version="0.1.0")

_pipe = None


def get_pipe():
    global _pipe
    if _pipe is not None:
        return _pipe

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_ID,
        torch_dtype=DTYPE,
        low_cpu_mem_usage=True,
    ).to(DEVICE)
    processor = AutoProcessor.from_pretrained(MODEL_ID)

    _pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        device=0 if DEVICE == "cuda" else -1,
    )
    return _pipe


def decode_audio(file_bytes: bytes):
    try:
        waveform, sample_rate = torchaudio.load(io.BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read audio: {exc}")

    if waveform.numel() == 0:
        raise HTTPException(status_code=400, detail="Empty audio")

    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != 16000:
        waveform = torchaudio.functional.resample(waveform, sample_rate, 16000)
        sample_rate = 16000

    return waveform.squeeze(0), sample_rate


@app.get("/health")
def health():
    return {
        "ok": True,
        "model_id": MODEL_ID,
        "language": LANGUAGE,
        "device": DEVICE,
    }


@app.post("/transcribe")
async def transcribe(request: Request, file: UploadFile = File(None)):
    audio_bytes = b""

    if file is not None:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Missing file")
        audio_bytes = await file.read()
    else:
        audio_bytes = await request.body()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Missing audio bytes")
    waveform, sample_rate = decode_audio(audio_bytes)

    pipe = get_pipe()
    generate_kwargs = {"language": LANGUAGE, "task": "transcribe"} if LANGUAGE else None
    try:
        result = pipe(
            {"array": waveform.numpy(), "sampling_rate": sample_rate},
            generate_kwargs=generate_kwargs,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ASR failed: {exc}")

    text = result.get("text", "").strip()

    return {
        "text": text,
        "model_id": MODEL_ID,
        "language": LANGUAGE,
    }
