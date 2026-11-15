#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo 'Activate a release with sudo.' >&2
  exit 1
fi
if [[ $# != 1 || ! $1 =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Usage: sudo bash deploy/activate-release.sh <full-commit-sha>' >&2
  exit 2
fi

root=/opt/presdes
release="$root/releases/$1"
if [[ ! -f $release/.ready || ! -x $release/.venv/bin/python || ! -s $release/frontend/dist/index.html ]]; then
  echo 'Build this release before activating it.' >&2
  exit 1
fi

exec 9>"$root/.activate.lock"
flock 9
if [[ -e $root/current && ! -L $root/current ]]; then
  echo 'The current release path must be a symlink.' >&2
  exit 1
fi
previous=$(readlink "$root/current" || true)
if [[ -n $previous && ! $previous =~ ^/opt/presdes/releases/[a-f0-9]{40}$ ]]; then
  echo 'The current release symlink points outside the expected layout.' >&2
  exit 1
fi
temporary=$(mktemp -d "$root/.activate.XXXXXXXX")
trap 'rm -f -- "$temporary/link"; rmdir -- "$temporary"' EXIT

point_to() {
  ln -s -- "$2" "$temporary/link"
  mv -Tf -- "$temporary/link" "$root/$1"
}

wait_until_ready() {
  local attempt
  for (( attempt = 0; attempt < 20; attempt++ )); do
    if systemctl is-active --quiet presdes.service \
      && curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:8000/api/health >/dev/null \
      && curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:8000/ >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

point_to current "$release"
if systemctl restart presdes.service && wait_until_ready; then
  if [[ -n $previous && $previous != "$release" ]]; then
    point_to previous "$previous"
  fi
  printf 'Active release: %s\n' "$1"
  exit 0
fi

echo 'The release failed its loopback checks. See journalctl -u presdes.service.' >&2
if [[ -n $previous && $previous != "$release" ]]; then
  point_to current "$previous"
  if systemctl restart presdes.service && wait_until_ready; then
    printf 'Restored release: %s\n' "${previous##*/}" >&2
  else
    echo 'The previous release also failed its loopback checks.' >&2
  fi
elif [[ -z $previous ]]; then
  systemctl stop presdes.service
  rm -- "$root/current"
fi
exit 1
