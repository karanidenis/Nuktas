# Nuktas ASR Service

Python microservice for Kiswahili speech-to-text, using an open-weights Whisper
fine-tune (Apache-2.0). Default model: `Finiflowlabs/sauti-asr-v1`
(Whisper-medium fine-tuned on ~89 h of Swahili speech, 13.52% WER on its
held-out test set vs 27% zero-shot Whisper-medium).

## Setup

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```sh
ASR_MODEL_ID=Finiflowlabs/sauti-asr-v1 \
ASR_LANGUAGE=sw \
uvicorn app:app --host 0.0.0.0 --port 8001
```

`ASR_LANGUAGE` forces the source language for Whisper models. Set it to an
empty value to let the model auto-detect (required if you swap in a
non-multilingual model).

## Test

```sh
curl -s http://localhost:8001/health
curl -s -X POST -F "file=@/path/to/audio.wav" http://localhost:8001/transcribe
curl -s -X POST --data-binary "@/path/to/audio.wav" http://localhost:8001/transcribe
```

## Alternatives

Any `transformers` speech-seq2seq checkpoint works:

- `openai/whisper-large-v3` — stronger, larger, multilingual (auto-detects Swahili).
- `PaschalK/whisper-swahili-small` — smaller, Common Voice 11 fine-tune.
- `facebook/mms-1b-all` — Wav2Vec2, set `ASR_LANGUAGE=""` (uses its own adapter setup).
