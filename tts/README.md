# Nuktas TTS Service

Python microservice for Kiswahili text-to-speech. Two interchangeable engines,
selected with `TTS_ENGINE`:

| Engine | Model | Licence | Footprint |
|--------|-------|---------|-----------|
| `chatterbox` (default) | Resemble AI **Chatterbox Multilingual** (Swahili built in) | **MIT** | heavy — torch 2.6, ~0.5B params, works on CPU |
| `mms` | **facebook/mms-tts-swh** (VITS) | **CC-BY-NC-4.0** (non-commercial) | light — torch 2.2 |

The default is the permissively licensed engine so the critical path is
commercially safe. MMS remains available as a lightweight fallback; its
checkpoint is non-commercial, so only use it where that is acceptable.

The two engines need different `torch`/`transformers` versions, so they ship as
separate requirements files and must not be installed into the same venv.

## Setup (default: Chatterbox)

```sh
cd tts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-chatterbox.txt
```

## Setup (lightweight fallback: MMS)

```sh
cd tts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-mms.txt
TTS_ENGINE=mms
```

## Run

```sh
# Chatterbox (default)
uvicorn app:app --host 0.0.0.0 --port 8002

# MMS fallback
TTS_ENGINE=mms TTS_MODEL_ID=facebook/mms-tts-swh \
uvicorn app:app --host 0.0.0.0 --port 8002
```

## Test

```sh
curl -s -X POST http://localhost:8002/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Habari. Ni tatizo gani la afya linakuleta leo?"}'
curl -s http://localhost:8002/health
```

## Environment

- `TTS_ENGINE` — `chatterbox` (default) or `mms`
- `TTS_LANGUAGE` — Chatterbox language id (default `sw`)
- `TTS_MODEL_ID` — MMS checkpoint (default `facebook/mms-tts-swh`)
- Port defaults to `8002` (the Docker image listens on `8011`)
