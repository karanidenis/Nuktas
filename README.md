# Nuktas — Clinic Queue + Agentic Triage (Node.js)

AI-powered clinic queue management for East Africa.
Voice intake via Twilio → AI triage via OpenAI → real-time dashboard via Socket.IO.

## Stack

- **Backend** — Node.js, Express, Socket.IO, PostgreSQL (`pg`)
- **Frontend** — React 18, Chakra UI v2, TypeScript, Vite, `socket.io-client`
- **Voice** — Twilio Programmable Voice + TwiML (optional)
- **AI** — OpenAI-compatible (Ollama/LocalAI) or OpenAI
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
│   ├── voice/callSession.js    In-memory call state (replaces GenServer)
│   └── services/
│       ├── openai.js           GPT-4o-mini intake agent
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
- **Agent LLM** — any open-weights model behind an OpenAI-compatible API: the bundled Ollama (`qwen2.5:7b-instruct`) by default, or your own self-hosted server (e.g. vLLM serving `qwen3.8-27b`) via `AGENT_MODEL_BASE_URL`/`AGENT_MODEL_NAME`/`AGENT_MODEL_API_KEY`.

Quick start:
1. `docker compose up --build` (starts postgres, server, client, asr, tts, ollama, agent).
2. Apply schema: `cd server && psql $DATABASE_URL -f db/schema.sql` if running outside docker.
3. Seed: `cd server && node db/seed.js`.
4. Access http://localhost:80 (client) / http://localhost:4000 (server).

Run MCP tests: `cd mcp-server && node --test test/` (28/28 pass).
Agent unit tests: `cd agent && PYTHONPATH=src .venv/bin/python -m pytest tests/ -v`.

License: Apache 2.0. See `LICENSE`.
