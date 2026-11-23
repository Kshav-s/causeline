#!/usr/bin/env bash
# Start the Member 2 NLP service on Linux/macOS. Run from the package root.
set -euo pipefail
[ -f src/api.py ] || { echo "Run this from the package root (containing src/)." >&2; exit 1; }
[ -f .venv/bin/activate ] && . .venv/bin/activate
exec uvicorn src.api:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}"
