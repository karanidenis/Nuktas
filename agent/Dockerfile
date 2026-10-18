FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Node.js runs the governed MCP triage server that the worker spawns over stdio.
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python worker (src layout: src/ must exist before `pip install -e .`).
COPY agent/pyproject.toml ./
COPY agent/README.md ./
COPY agent/src ./src

RUN pip install --no-cache-dir -e .

# The governed MCP server and its Node dependencies, baked in so a fresh clone
# works with no host-side npm install. The build context is the repo root.
COPY mcp-server /app/mcp-server
RUN cd /app/mcp-server && npm install --omit=dev

EXPOSE 8100

CMD ["uvicorn", "nuktas_agent.main:app", "--host", "0.0.0.0", "--port", "8100"]
