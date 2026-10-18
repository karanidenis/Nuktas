# Nuktas — Clinic Queue + Agentic Triage (Node.js)

AI-powered clinic queue management for East Africa.
Voice intake via Twilio → AI triage via OpenAI → real-time dashboard via Socket.IO.

## Stack

- **Backend** — Node.js, Express, Socket.IO, PostgreSQL (`pg`)
- **Frontend** — React 18, Chakra UI v2, TypeScript, Vite, `socket.io-client`
- **Voice** — Twilio Programmable Voice + TwiML (optional)
- **AI** — any OpenAI-compatible endpoint via `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_CHAT_MODEL` (bundled Ollama by default; vLLM, LocalAI, or OpenAI also work)
- **SMS** — Twilio Messaging

## Setup

### 1. Environment

```sh
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, AI config, TWILIO_* (optional)
```

### 2. Database

```sh
# Create the database
createdb nuktas_dev

# Run schema
cd server
npm run db:schema

# Seed demo data
npm run db:seed
```

### 3. Install dependencies

```sh
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 4. Run

In two terminals:

```sh
# Terminal 1 — backend (port 4000)
cd server && npm run dev

# Terminal 2 — frontend (port 5173, proxied to 4000)
cd client && npm run dev
```

Open http://localhost:5173

### Optional: ASR microservice (no Twilio)

```sh
cd asr
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
ASR_MODEL_ID=Finiflowlabs/sauti-asr-v1 \
uvicorn app:app --host 0.0.0.0 --port 8001
```

ASR endpoints:

- `GET http://localhost:8001/health`
- `POST http://localhost:8001/transcribe` (multipart file or raw bytes)
- `POST http://localhost:4000/api/v1/asr/transcribe` (proxy from Node)
- `POST http://localhost:4000/api/v1/asr/intake` (creates queue entry from audio)

ASR intake UI:

- `http://localhost:5173/asr-intake/:clinic_id`

### Demo credentials

| Email | Password | Role |
|-------|----------|------|
| admin@nairobi.clinic | password123 | admin |
| staff@nairobi.clinic | password123 | staff |
| doctor@nairobi.clinic | password123 | doctor |

## Architecture

```
client/                 React + Chakra UI (TypeScript)
├── src/
│   ├── hooks/
│   │   ├── useAuth.ts           JWT auth state
│   │   └── useClinicSocket.ts   Socket.IO real-time hook
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   └── DashboardPage.tsx
│   └── components/
│       ├── QueueCard.tsx
│       ├── StatsBar.tsx
│       ├── CriticalAlertBanner.tsx
│       └── UrgencyBadge.tsx

server/                 Node.js + Express + Socket.IO
├── src/
│   ├── index.js               Entry point
│   ├── db.js                  PostgreSQL pool
│   ├── middleware/auth.js      JWT verification
│   ├── models/
│   │   ├── queue.js            Queue DB operations
│   │   ├── clinics.js          Clinic & department lookups
│   │   └── patients.js         Patient CRUD
│   ├── routes/
│   │   ├── auth.js             POST /api/auth/login, GET /api/auth/me
│   │   ├── clinics.js          GET/POST /api/v1/clinics/:id/...
│   │   └── patients.js         GET /api/v1/patients/:id/history
│   ├── sockets/clinic.js       Socket.IO event handlers
│   ├── webhooks/voice.js       Twilio TwiML webhook handlers
│   ├── voice/callSession.js    In-memory call state (15-min TTL)
│   └── services/
│       ├── openai.js           OpenAI-compatible intake LLM (LLM_*)
│       ├── twilio.js           TwiML string builders
│       └── sms.js              Twilio SMS notifications
└── db/
    ├── schema.sql              PostgreSQL DDL
    └── seed.js                 Demo data seeder

## Socket.IO Events

| Event (server → client) | Payload |
|--------------------------|---------|
| `queue_state` | `{ queue, stats, critical_alerts }` — full snapshot on join |
| `patient_joined` | `{ queue_entry }` — new patient from voice intake |
| `status_update` | `{ entry_id, status, queue_entry }` |
| `critical_alert` | `{ queue_entry }` |
| `alert_acknowledged` | `{ entry_id, acknowledged_by, acknowledged_at }` |

| Event (client → server) | Payload |
|--------------------------|---------|
| `join:clinic` | `{ clinicId }` |
| `check_in` | `{ entry_id }` |
| `update_status` | `{ entry_id, status }` |
| `acknowledge_alert` | `{ entry_id }` |
```

---

## Nuktas (Agentic Triage)

This submission ("Nuktas") is a governed, SATS-grounded agentic triage assistant for the African Agentic AI Design Challenge (Healthcare: The Triage Desk).

Key components:
- **mcp-server/** (Node + MCP): 8 clinic-scoped tools; deterministic SATS (EMSSA 2012). Only `apply_approved_queue_update` writes to queue and requires a named clinician approval (`approvals`).
- **server/** (Express + Socket.IO): REST endpoints for triage governance (recommend/approve/reject/apply), service-token agent-run callbacks, LISTEN/NOTIFY→Socket.IO bridge, MCP client spawning the triage server.
- **agent/** (Python + FastAPI + Pydantic AI): worker logs every tool call; uses Ollama (open-weights). Scripted model for evals.
- **client/**: triage review board, audit log, agent runs, bilingual-aware UI.

Governance guarantees:
- Never diagnoses, prescribes, or moves the queue without approval.
- Priority is sourced from SATS (code decides). LLM proposes clinical signs only.
- Audit trail on every tool call; gate on every irreversible action.

Open-weights models (all run locally — patient data never leaves the country):
- **ASR** — `Finiflowlabs/sauti-asr-v1` (Whisper-medium, Swahili, Apache-2.0).
- **TTS** — Resemble AI Chatterbox Multilingual (MIT, Swahili); `TTS_ENGINE=mms` switches to the lighter CC-BY-NC `facebook/mms-tts-swh` fallback.
- **Agent LLM** — any open-weights model behind an OpenAI-compatible API: the bundled Ollama (`qwen2.5:7b-instruct`) by default, or your own self-hosted server (e.g. vLLM serving `qwen3.8-27b`) via `LLM_BASE_URL` / `LLM_CHAT_MODEL` / `LLM_API_KEY` — the same setting the server's voice intake uses, so phone intake and the triage agent share one model. `AGENT_MODEL_*` still works as an agent-only override. If the model is a thinking model (e.g. Qwen3), set `LLM_DISABLE_THINKING=true` so short phone replies are not swallowed by the reasoning budget.

Quick start (one command):
1. `docker compose up --build` — starts postgres (schema applied automatically), server (demo data seeded automatically), client, asr, tts, ollama (open-weights model pulled by the one-shot `ollama-init`), and the agent. No `.env` is required: Docker ships safe defaults (schema/seed/secrets/model config are all wired in the compose file). Copy `.env.example` to `.env` only to override them — e.g. to point the stack at your own OpenAI-compatible endpoint (set `LLM_BASE_URL`/`LLM_CHAT_MODEL`/`LLM_API_KEY`; when set, the bundled Ollama model pull is skipped automatically).
2. Access http://localhost (client) / http://localhost:4000 (server) and log in with `admin@nairobi.clinic` / `password123`.

Deployment notes:
- **First run** builds five images and downloads ~10 GB of open-weights models (Ollama `qwen2.5:7b-instruct` ~4.7 GB, Swahili ASR + TTS weights from Hugging Face). Plan 20–30 minutes on a fast connection.
- **Resources**: 8 GB+ RAM recommended (the TTS container peaks near 5 GB on CPU). 4+ CPU cores.
- **TTS engine**: the default `chatterbox` (MIT) is autoregressive and needs a GPU to be near real-time; on a CPU-only host set `TTS_ENGINE=mms` (one env var, `docker compose up --build tts`) for the fast VITS engine.
- **Ports**: 80 (UI), 4000 (API), 8100 (agent), 8010 (ASR), 8011 (TTS), 11434 (Ollama). Postgres is loopback-only by default; move it with `POSTGRES_PORT`.

Run MCP tests: `cd mcp-server && node --test test/` (28/28 pass).
Agent unit tests: `cd agent && PYTHONPATH=src .venv/bin/python -m pytest tests/ -v`.

License: Apache 2.0. See `LICENSE`.
