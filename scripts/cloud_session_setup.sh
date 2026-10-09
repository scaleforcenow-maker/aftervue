#!/bin/bash
# Installs project dependencies at the start of a Claude Code CLOUD session.
# Runs from .claude/settings.json (SessionStart hook). Exits immediately on a
# local machine so it never touches a developer's checkout.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Node projects (site, patient app, Vercel functions, aftervue-leads).
while IFS= read -r pkg; do
  dir="$(dirname "$pkg")"
  case "$dir" in */node_modules/*) continue ;; esac
  if [ ! -d "$dir/node_modules" ]; then
    echo "[setup] npm install in $dir"
    if [ -f "$dir/package-lock.json" ]; then
      (cd "$dir" && npm ci --no-audit --no-fund) || (cd "$dir" && npm install --no-audit --no-fund)
    else
      (cd "$dir" && npm install --no-audit --no-fund)
    fi
  fi
done < <(find . -name package.json -not -path '*/node_modules/*' -maxdepth 3)

# Python tooling (tools/seo, tools/leads, tools/appstore, tools/social ...).
if [ -f requirements.txt ]; then
  echo "[setup] pip install -r requirements.txt"
  python3 -m pip install -q -r requirements.txt
fi
for req in $(find tools -name requirements.txt -maxdepth 3 2>/dev/null); do
  echo "[setup] pip install -r $req"
  python3 -m pip install -q -r "$req"
done

echo "[setup] done"
