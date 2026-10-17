FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY src ./src
COPY sats_signs.json ./src/nuktas_agent/sats_signs.json 2>/dev/null || true
COPY ../mcp-server /app/mcp-server

# Node.js for MCP server
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8100

CMD ["uvicorn", "nuktas_agent.main:app", "--host", "0.0.0.0", "--port", "8100"]
