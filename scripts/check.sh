#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[check] Missing .venv. Run 'npm run bootstrap' first." >&2
  exit 1
fi

source .venv/bin/activate

echo "[check] TypeScript typecheck..."
npm run typecheck

echo "[check] ESLint..."
npm run lint

echo "[check] Python tests..."
python -m pytest tests/ -v --tb=short
