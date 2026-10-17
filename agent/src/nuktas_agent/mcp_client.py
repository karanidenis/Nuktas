"""A minimal standalone MCP client.

Used for the orchestrator's governance guardrail: if the language model ever
finishes without asking a clinician to review its recommendation, the runner
still has to raise that recommendation to the nurse. This client gives the
runner its own short-lived, governed path to the same MCP tools, independent of
the model's toolset lifecycle.

It speaks the official MCP stdio protocol directly, so it is also handy for the
eval harness and for health checks.
"""

from __future__ import annotations

import json
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .config import settings

__all__ = ["call_tool", "list_tool_names"]


def _params() -> StdioServerParameters:
    return StdioServerParameters(
        command=settings.mcp_command,
        args=list(settings.mcp_args),
        env=settings.mcp_env,
        cwd=settings.mcp_cwd,
    )


def _parse(result: Any) -> dict[str, Any]:
    """Flatten a CallToolResult into the JSON object the tool returned."""
    content = getattr(result, "content", None) or []
    text_parts: list[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if text:
            text_parts.append(text)
    text = "\n".join(text_parts)
    if not text:
        return {}
    try:
        return json.loads(text)
    except ValueError:
        return {"raw": text}


async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Call one MCP tool over a fresh stdio session and return its JSON payload."""
    async with stdio_client(_params()) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments)
            return _parse(result)


async def list_tool_names() -> list[str]:
    async with stdio_client(_params()) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            return [t.name for t in tools.tools]
