#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${MASTERBUILD_PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="python3.12"
  else
    PYTHON_BIN="python3"
  fi
fi

echo "[bootstrap] Installing frontend dependencies..."
npm ci

echo "[bootstrap] Creating Python virtualenv with $PYTHON_BIN..."
"$PYTHON_BIN" -m venv .venv

echo "[bootstrap] Installing Python dependencies..."
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt

echo "[bootstrap] Installing Playwright browsers..."
npx playwright install

echo "[bootstrap] Complete."
