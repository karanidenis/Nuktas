FROM python:3.11-slim

# TTS_ENGINE selects which Swahili voice stack to install:
#   chatterbox (default) — MIT, heavy (torch 2.6)
#   mms                  — CC-BY-NC-4.0, light (torch 2.2)
ARG TTS_ENGINE=chatterbox
ENV TTS_ENGINE=${TTS_ENGINE}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    build-essential \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-chatterbox.txt requirements-mms.txt ./
# MMS: install torch from the CPU-only index first (the PyPI wheel bundles ~2.5 GB
# of CUDA libraries that a CPU-only demo host never uses).
RUN if [ "$TTS_ENGINE" = "mms" ]; then \
        pip install --no-cache-dir --timeout 120 --retries 10 torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu && \
        pip install --no-cache-dir --timeout 120 --retries 10 -r requirements-mms.txt; \
    else \
        pip install --no-cache-dir --timeout 120 --retries 10 -r requirements-chatterbox.txt; \
    fi

COPY app.py .

EXPOSE 8011

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8011"]
