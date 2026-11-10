FROM node:24-slim AS node-runtime

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Node.js runs both MCP servers. The official filesystem server 2.x requires
# Node 24, so copy that runtime into the Python worker image.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

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

# Read-only-at-the-orchestrator policy artifacts loaded through the borrowed
# Model Context Protocol filesystem server during every triage run.
COPY protocols /app/protocols

EXPOSE 8100

CMD ["uvicorn", "nuktas_agent.main:app", "--host", "0.0.0.0", "--port", "8100"]
