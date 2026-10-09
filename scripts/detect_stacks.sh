#!/usr/bin/env bash
# Detects which stacks exist in the checkout and prints key=value lines for
# GitHub Actions `$GITHUB_OUTPUT` (or for a human when run locally).
#
#   node_dirs     JSON array of directories holding a package.json
#                 (node_modules, .git, build output and vendored dirs excluded)
#   has_node      true/false
#   has_python    true if any .py exists under tools/
#   has_pytest    true if any pytest-style test file exists anywhere
#   has_markdown  true if any .md exists under docs/ or _seo/
#   has_nvmrc     true if .nvmrc exists at the repo root
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PRUNE=( -path '*/node_modules' -o -path '*/.git' -o -path '*/.venv' -o -path '*/venv' \
        -o -path '*/dist' -o -path '*/build' -o -path '*/.next' -o -path '*/DerivedData' \
        -o -path '*/Pods' -o -path '*/coverage' -o -path '*/.cache' )

node_dirs="$(find . \( "${PRUNE[@]}" \) -prune -o -name package.json -type f -print \
  | sed 's|^\./||; s|/package.json$||; s|^package.json$|.|' | sort \
  | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')"

has_node=false; [ "$node_dirs" != "[]" ] && has_node=true

has_python=false
if [ -d tools ] && find tools \( "${PRUNE[@]}" \) -prune -o -name '*.py' -type f -print -quit | grep -q .; then
  has_python=true
fi

# scripts/tests/ holds the brand-check unittests, which CI runs separately.
# -quit stops at the first hit; piping find into grep -v | grep -q raced with
# SIGPIPE under pipefail and reported false on large trees.
has_pytest=false
if find . \( "${PRUNE[@]}" -o -path './scripts/tests' \) -prune -o \
     -type f \( -name 'test_*.py' -o -name '*_test.py' -o -name conftest.py \) -print -quit | grep -q .; then
  has_pytest=true
fi

has_markdown=false
for d in docs _seo; do
  if [ -d "$d" ] && find "$d" -name '*.md' -type f -print -quit | grep -q .; then has_markdown=true; fi
done

has_nvmrc=false; [ -f .nvmrc ] && has_nvmrc=true

printf 'node_dirs=%s\n' "$node_dirs"
printf 'has_node=%s\nhas_python=%s\nhas_pytest=%s\nhas_markdown=%s\nhas_nvmrc=%s\n' \
  "$has_node" "$has_python" "$has_pytest" "$has_markdown" "$has_nvmrc"
