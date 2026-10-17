"""Configuration for the Nuktas agent worker.

Everything is read from the environment so the same image runs in Docker, in CI,
and on a developer laptop. Two blocks matter:

  • how to reach the Node API and the shared service token it trusts
  • how to launch the Nuktas Triage MCP server (the governed tool boundary)

The MCP server is spawned exactly like the API spawns it, so both processes
agree on one source of truth for every clinical write.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]  # .../Nuktas


@dataclass(frozen=True)
class Settings:
    # ── API callback ──────────────────────────────────────────────────────
    api_base_url: str
    agent_service_token: str
    callback_timeout_s: float

    # ── Model ─────────────────────────────────────────────────────────────
    # `model_name` is served by any OpenAI-compatible endpoint: the bundled
    # Ollama container (e.g. "qwen2.5:7b-instruct"), a self-hosted vLLM server
    # (e.g. "qwen3.8-27b"), or the sentinel "scripted", which swaps in a
    # deterministic test model so governance evals run without a GPU or network.
    model_name: str
    model_base_url: str
    model_api_key: str
    max_agent_retries: int

    # ── MCP boundary ──────────────────────────────────────────────────────
    mcp_command: str
    mcp_args: tuple[str, ...]
    mcp_cwd: str
    mcp_env: dict[str, str] = field(default_factory=dict)

    @property
    def scripted(self) -> bool:
        return self.model_name in {"scripted", "test", "none"}


def _repo_root() -> Path:
    env = os.environ.get("NUKTAS_REPO_ROOT")
    return Path(env) if env else DEFAULT_REPO_ROOT


def load_settings() -> Settings:
    root = _repo_root()
    # Populate the process environment from the repo .env (if present) so a
    # local `uvicorn` run picks up the same configuration the Node server and
    # docker compose use. Real environment variables always take precedence.
    load_dotenv(root / ".env", override=False)
    mcp_entry = os.environ.get("MCP_SERVER_ENTRY") or str(root / "mcp-server" / "src" / "index.js")
    mcp_cwd = os.environ.get("MCP_SERVER_CWD") or str(Path(mcp_entry).resolve().parent.parent)
    mcp_command = os.environ.get("MCP_SERVER_CMD") or "node"

    database_url = os.environ.get("MCP_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""

    mcp_env = dict(os.environ)
    if database_url:
        mcp_env["MCP_DATABASE_URL"] = database_url
        mcp_env["DATABASE_URL"] = database_url

    return Settings(
        api_base_url=os.environ.get("AGENT_API_BASE_URL", "http://localhost:4000").rstrip("/"),
        agent_service_token=os.environ.get("AGENT_SERVICE_TOKEN", ""),
        callback_timeout_s=float(os.environ.get("AGENT_CALLBACK_TIMEOUT_S", "10")),
        model_name=(os.environ.get("AGENT_MODEL_NAME") or os.environ.get("LLM_CHAT_MODEL")
                    or os.environ.get("OLLAMA_MODEL", "qwen2.5:7b-instruct")),
        model_base_url=((os.environ.get("AGENT_MODEL_BASE_URL") or os.environ.get("LLM_BASE_URL")
                         or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")).rstrip("/")),
        model_api_key=(os.environ.get("AGENT_MODEL_API_KEY") or os.environ.get("LLM_API_KEY")
                       or os.environ.get("OLLAMA_API_KEY", "ollama")),
        max_agent_retries=int(os.environ.get("AGENT_MAX_RETRIES", "2")),
        mcp_command=mcp_command,
        mcp_args=(mcp_entry,),
        mcp_cwd=mcp_cwd,
        mcp_env=mcp_env,
    )


settings = load_settings()
