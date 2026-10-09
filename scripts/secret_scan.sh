#!/usr/bin/env bash
# Secret scan for the AfterVue repository (public repo, HIPAA-adjacent).
#
# Runs gitleaks with .gitleaks.toml across the FULL git history and exits
# non-zero if anything is found. Uses an installed `gitleaks` if present;
# otherwise downloads the pinned release into a cache directory, verifies the
# SHA-256 against the published checksum, and runs that.
#
# Usage:
#   scripts/secret_scan.sh                 # full history (default)
#   scripts/secret_scan.sh --working-tree  # uncommitted files only (no git)
#   scripts/secret_scan.sh --staged        # staged changes (pre-commit use)
#   scripts/secret_scan.sh --report out.json
#   scripts/secret_scan.sh --print-bin     # resolve/download gitleaks, print its path, exit
#
# Environment:
#   GITLEAKS_CACHE_DIR  where to keep the downloaded binary
#                       (default: $XDG_CACHE_HOME/aftervue-gitleaks or ~/.cache/aftervue-gitleaks)
#   GITLEAKS_BIN        path to a gitleaks binary to use instead of PATH/download
#
# Exit codes: 0 clean, 1 findings, anything else = tool or download error.
set -euo pipefail

GITLEAKS_VERSION="8.21.2"
# sha256 of the release tarballs, from
# https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_checksums.txt
declare -A GITLEAKS_SHA256=(
  [linux_x64]="5bc41815076e6ed6ef8fbecc9d9b75bcae31f39029ceb55da08086315316e3ba"
  [linux_arm64]="654c935542c89f565aabe7bf7c6c500830f116c114f0aeb509d2460c1ac2e6da"
  [darwin_x64]="5b42c6e4b1fd693eaeb2b5b7faa5f17a1434299d4deb2de63d4b2efd7c753128"
  [darwin_arm64]="cad3de5dc9a4d5447d967a70a4d49499c557f04db028274cc324f9ff983f6502"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/.gitleaks.toml"

MODE="git"
REPORT=""
PRINT_BIN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --working-tree|--no-git) MODE="dir" ;;
    --staged|--pre-commit)   MODE="staged" ;;
    --report)                REPORT="${2:?--report needs a path}"; shift ;;
    --print-bin)             PRINT_BIN=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "secret_scan: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '[secret_scan] %s\n' "$*" >&2; }

platform_key() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    linux|darwin) ;;
    *) log "unsupported OS: $os"; return 1 ;;
  esac
  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) log "unsupported architecture: $arch"; return 1 ;;
  esac
  printf '%s_%s' "$os" "$arch"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    log "need sha256sum or shasum to verify the download"; return 1
  fi
}

download_gitleaks() {
  local key cache_dir bin tarball url expected actual tmp
  key="$(platform_key)" || return 1
  expected="${GITLEAKS_SHA256[$key]:-}"
  if [ -z "$expected" ]; then
    log "no pinned checksum for platform $key"; return 1
  fi
  cache_dir="${GITLEAKS_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/aftervue-gitleaks}"
  bin="$cache_dir/gitleaks-$GITLEAKS_VERSION-$key"
  if [ -x "$bin" ]; then
    printf '%s' "$bin"; return 0
  fi
  mkdir -p "$cache_dir"
  tarball="gitleaks_${GITLEAKS_VERSION}_${key}.tar.gz"
  url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${tarball}"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/gitleaks-dl.XXXXXX")"
  log "downloading gitleaks v$GITLEAKS_VERSION for $key"
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$tmp/$tarball" "$url"; then
    log "download failed: $url"; rm -rf "$tmp"; return 1
  fi
  actual="$(sha256_of "$tmp/$tarball")"
  if [ "$actual" != "$expected" ]; then
    log "checksum mismatch for $tarball"
    log "  expected $expected"
    log "  actual   $actual"
    rm -rf "$tmp"; return 1
  fi
  tar -xzf "$tmp/$tarball" -C "$tmp" gitleaks
  mv "$tmp/gitleaks" "$bin"
  chmod +x "$bin"
  rm -rf "$tmp"
  printf '%s' "$bin"
}

resolve_gitleaks() {
  if [ -n "${GITLEAKS_BIN:-}" ]; then
    [ -x "$GITLEAKS_BIN" ] || { log "GITLEAKS_BIN is not executable: $GITLEAKS_BIN"; return 1; }
    printf '%s' "$GITLEAKS_BIN"; return 0
  fi
  if command -v gitleaks >/dev/null 2>&1; then
    command -v gitleaks; return 0
  fi
  download_gitleaks
}

[ -f "$CONFIG" ] || { log "missing config: $CONFIG"; exit 2; }

GITLEAKS="$(resolve_gitleaks)" || exit 2
if [ "$PRINT_BIN" -eq 1 ]; then printf '%s\n' "$GITLEAKS"; exit 0; fi
log "using $GITLEAKS ($("$GITLEAKS" version 2>/dev/null || echo 'version unknown'))"

args=(--config "$CONFIG" --redact --no-banner --exit-code 1)
[ -n "$REPORT" ] && args+=(--report-format json --report-path "$REPORT")

cd "$REPO_ROOT"
case "$MODE" in
  git)
    # Full history. In CI this needs `fetch-depth: 0` on actions/checkout.
    if git rev-parse --is-shallow-repository 2>/dev/null | grep -q true; then
      log "warning: shallow clone, history scan is incomplete (use fetch-depth: 0)"
    fi
    log "scanning full git history"
    set +e; "$GITLEAKS" git "${args[@]}" -v .; rc=$? ;;
  staged)
    log "scanning staged changes"
    set +e; "$GITLEAKS" git "${args[@]}" --pre-commit --staged -v .; rc=$? ;;
  dir)
    log "scanning working tree (no git)"
    set +e; "$GITLEAKS" dir "${args[@]}" -v .; rc=$? ;;
esac
set -e

case "$rc" in
  0) log "clean" ;;
  1) log "FINDINGS: secrets detected. Rotate the credential, remove it, and never force-push a fix to a shared branch without telling the team." ;;
  *) log "gitleaks error (exit $rc)" ;;
esac
exit "$rc"
