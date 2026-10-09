# syntax=docker/dockerfile:1
# STRATA engine (FastAPI). Build context = repo root:
#   docker build -f services/engine/Dockerfile -t strata-engine .
# The image mirrors the repo layout under /app, so strata_engine.config.ROOT (= parents[3] of config.py) is /app
# and contracts/, config/, data/ resolve exactly as they do locally.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/services/engine \
    STRATA_STORE_DIR=/app/data/store \
    STRATA_STATE_DB=/app/data/store/state.db

WORKDIR /app

# Python deps first (best layer cache). pytest/ruff are dev-only and skipped in the image.
COPY services/engine/requirements.txt /tmp/requirements.txt
RUN grep -viE '^(pytest|ruff)([<>=!~ ;]|$)' /tmp/requirements.txt > /tmp/requirements.runtime.txt \
 && pip install -r /tmp/requirements.runtime.txt \
 && rm -f /tmp/requirements*.txt

# Non-root runtime user (fixed uid so volume ownership is stable across rebuilds).
RUN groupadd --system --gid 10001 strata \
 && useradd --system --uid 10001 --gid strata --create-home --home-dir /home/strata --shell /usr/sbin/nologin strata

# First-boot entrypoint: generate the synthetic data once (seed A + hold-out, then the eval report), then run the
# command. Written with printf (not a separate .sh file) so Windows CRLF checkouts cannot break the shebang.
# Paths are fixed to /app/data/store because scripts/seed.py and scripts/eval.py always write to <repo>/data/store.
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'STORE=/app/data/store' \
    'if [ ! -f "$STORE/seed_dev/orders.pkl" ] || [ ! -f "$STORE/seed_holdout/manifest.json" ]; then' \
    '  echo "[strata] first boot: generating synthetic data (seed A + hold-out). Takes about 1-2 minutes..."' \
    '  python /app/scripts/seed.py' \
    '  python /app/scripts/eval.py || echo "[strata] eval failed (non-fatal); /eval/latest will be empty until npm run eval"' \
    '  echo "[strata] seed done"' \
    'else' \
    '  echo "[strata] using existing data in $STORE"' \
    'fi' \
    'exec "$@"' \
    > /usr/local/bin/strata-entrypoint \
 && chmod 0755 /usr/local/bin/strata-entrypoint

# Static inputs (change rarely) before engine code (changes often).
COPY contracts/ /app/contracts/
COPY config/ /app/config/
COPY data/generator.py /app/data/generator.py
COPY data/memory_seed/ /app/data/memory_seed/
COPY data/snapshots/ /app/data/snapshots/
# docs/ is small; copied so any engine module that cites or reads docs (e.g. the assistant) finds them.
COPY docs/ /app/docs/
COPY scripts/ /app/scripts/
COPY services/engine/ /app/services/engine/

# data/store must exist and be owned by the app user BEFORE the named volume is mounted: Docker seeds a new,
# empty named volume with this directory's ownership, so the non-root user can write pickles + state.db.
RUN mkdir -p /app/data/store && chown -R strata:strata /app/data/store

USER strata
VOLUME ["/app/data/store"]
EXPOSE 8000

# python:slim has no curl; use the stdlib. Start period covers the first-boot seed.
HEALTHCHECK --interval=10s --timeout=5s --start-period=600s --retries=6 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

ENTRYPOINT ["/usr/local/bin/strata-entrypoint"]
# Single worker on purpose: the engine keeps in-memory state (detections, lab injections) per process.
CMD ["uvicorn", "strata_engine.app:app", "--app-dir", "/app/services/engine", "--host", "0.0.0.0", "--port", "8000"]
