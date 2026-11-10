FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# torch/torchaudio come from the CPU-only index (see requirements.txt) — the
# PyPI wheels bundle ~2.5 GB of CUDA libraries the CPU path never uses.
# --timeout/--retries: PyPI downloads of the torch wheel can stall on slow links.
RUN pip install --no-cache-dir --timeout 120 --retries 10 torch==2.2.2 torchaudio==2.2.2 \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --timeout 120 --retries 10 -r requirements.txt

COPY app.py .

EXPOSE 8010

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]
