#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".venv/bin/activate" ]]; then
  source ".venv/bin/activate"
fi

python mission_livestream_watcher.py
