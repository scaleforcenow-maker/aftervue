#!/usr/bin/env bash
# Lints .github/workflows/*.yml with actionlint (pinned release, checksum
# verified, cached) and falls back to a YAML parse if actionlint cannot be
# fetched for this platform.
set -euo pipefail

ACTIONLINT_VERSION="1.7.7"
# From https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_checksums.txt
declare -A ACTIONLINT_SHA256=(
  [linux_amd64]="023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757"
  [linux_arm64]="401942f9c24ed71e4fe71b76c7d638f66d8633575c4016efd2977ce7c28317d0"
  [darwin_amd64]="28e5de5a05fc558474f638323d736d822fff183d2d492f0aecb2b73cc44584f5"
  [darwin_arm64]="2693315b9093aeacb4ebd91a993fea54fc215057bf0da2659056b4bc033873db"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '[lint_workflows] %s\n' "$*" >&2; }

shopt -s nullglob
files=(.github/workflows/*.yml .github/workflows/*.yaml)
if [ ${#files[@]} -eq 0 ]; then log "no workflows to lint"; exit 0; fi

yaml_parse() {
  python3 - "$@" <<'PY'
import sys
try:
    import yaml
except ImportError:
    print("[lint_workflows] PyYAML not installed; skipping YAML parse", file=sys.stderr)
    sys.exit(0)
bad = 0
for path in sys.argv[1:]:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        on_key = "on" if "on" in doc else True  # PyYAML parses bare `on:` as boolean True
        assert isinstance(doc, dict) and on_key in doc and "jobs" in doc, "missing on:/jobs:"
        print(f"[lint_workflows] yaml ok: {path} ({len(doc['jobs'])} jobs)", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"[lint_workflows] yaml error in {path}: {e}", file=sys.stderr); bad = 1
sys.exit(bad)
PY
}

resolve_actionlint() {
  if [ -n "${ACTIONLINT_BIN:-}" ] && [ -x "$ACTIONLINT_BIN" ]; then printf '%s' "$ACTIONLINT_BIN"; return 0; fi
  if command -v actionlint >/dev/null 2>&1; then command -v actionlint; return 0; fi
  local os arch key cache bin tarball url tmp expected actual
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"; arch="$(uname -m)"
  case "$arch" in x86_64|amd64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; *) return 1 ;; esac
  key="${os}_${arch}"; expected="${ACTIONLINT_SHA256[$key]:-}"
  [ -n "$expected" ] || return 1
  cache="${ACTIONLINT_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/aftervue-actionlint}"
  bin="$cache/actionlint-$ACTIONLINT_VERSION-$key"
  if [ -x "$bin" ]; then printf '%s' "$bin"; return 0; fi
  mkdir -p "$cache"
  tarball="actionlint_${ACTIONLINT_VERSION}_${key}.tar.gz"
  url="https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${tarball}"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/actionlint-dl.XXXXXX")"
  log "downloading actionlint v$ACTIONLINT_VERSION for $key"
  curl -fsSL --retry 3 --retry-delay 2 -o "$tmp/$tarball" "$url" || { rm -rf "$tmp"; return 1; }
  if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$tmp/$tarball" | awk '{print $1}')"
  else actual="$(shasum -a 256 "$tmp/$tarball" | awk '{print $1}')"; fi
  if [ "$actual" != "$expected" ]; then log "checksum mismatch for $tarball"; rm -rf "$tmp"; return 1; fi
  tar -xzf "$tmp/$tarball" -C "$tmp" actionlint
  mv "$tmp/actionlint" "$bin"; chmod +x "$bin"; rm -rf "$tmp"
  printf '%s' "$bin"
}

yaml_parse "${files[@]}"

if bin="$(resolve_actionlint)"; then
  log "running $bin"
  # -shellcheck= and -pyflakes= disable the optional external linters so the
  # result is the same on every machine.
  "$bin" -color -shellcheck= -pyflakes= "${files[@]}"
  log "actionlint ok"
else
  log "actionlint unavailable for this platform; YAML parse only"
fi
