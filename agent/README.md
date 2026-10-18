# nuktas-agent

Pydantic AI worker that runs the triage conversation, calls the clinic MCP tools,
and posts recommendations back to the Nuktas server for **nurse approval**.

The agent never diagnoses, never prescribes, and never writes the queue itself —
every queue-changing action goes through the MCP approval gate
(`request_clinician_approval` / `record_clinician_decision`).

## Run

See the root [README](../README.md) for the one-command Docker run.

```bash
cd agent
pip install -e ".[dev]"
PYTHONPATH=src python -m pytest tests/ -q     # governance/eval tests
PYTHONPATH=src uvicorn nuktas_agent.main:app --port 8100
```

## Model

Any OpenAI-compatible open-weights endpoint, resolved in this order:

`AGENT_MODEL_*` → `LLM_*` → `OLLAMA_*` → bundled Ollama defaults.

The repo's `.env` (auto-loaded) can point it at a self-hosted server.
