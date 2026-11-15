#!/usr/bin/env bash
set -euo pipefail

if (( EUID == 0 )); then
  echo 'Build as the non-root deploy operator.' >&2
  exit 1
fi
if [[ $# != 1 ]]; then
  echo 'Usage: bash deploy/build-release.sh <commit-or-ref>' >&2
  exit 2
fi

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse --verify --end-of-options "$1^{commit}")
releases=${PRESDES_RELEASES_DIR:-/opt/presdes/releases}
destination="$releases/$revision"

if [[ $releases != /* || ! -d $releases || ! -w $releases ]]; then
  echo 'The release directory must be absolute and writable by the deploy operator.' >&2
  exit 1
fi
exec 9>"$releases/.build.lock"
flock 9
if [[ -f $destination/.ready ]]; then
  printf 'Release ready: %s\n' "$revision"
  exit 0
fi

if [[ $(node --version) != v22.* ]]; then
  echo 'The production frontend build requires Node.js 22.' >&2
  exit 1
fi
umask 022
mkdir -p -- "$destination"
git -C "$repo" archive "$revision" | tar -xf - -C "$destination"
python3.12 -m venv "$destination/.venv"
python="$destination/.venv/bin/python"
"$python" -m pip install --only-binary=:all: -r "$destination/backend/requirements.txt"
(
  cd "$destination/frontend"
  npm ci --include=dev
  npm run build
)
test -s "$destination/frontend/dist/index.html"
(
  cd "$destination/backend"
  "$python" - <<'PY'
from io import BytesIO

from PIL import Image

from app.main import app
from app.services.images import prepare_image

assert app.openapi()["info"]["title"] == "PresDes API"
heic = BytesIO()
Image.new("RGB", (24, 32), "white").save(heic, format="HEIF")
with Image.open(BytesIO(prepare_image(heic.getvalue(), "image/heic"))) as jpeg:
    assert jpeg.format == "JPEG" and jpeg.size == (24, 32)
PY
)
touch "$destination/.ready"
printf 'Release ready: %s\n' "$revision"
