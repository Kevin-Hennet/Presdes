#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
python -m pip install --only-binary=:all: -r backend/requirements.txt
(
  cd frontend
  npm ci --include=dev
  npm run build
)
test -s frontend/dist/index.html
