#!/usr/bin/env bash
# Reproduce the Oct 10, 2026 integration of every open pull request branch into
# one branch, with the cross-branch conflicts resolved the same way each time.
#
# Why this exists: each PR branch merges cleanly on its own against the default
# branch, but ten of them collide with each other in four shared files
# (.gitignore, README.md, _seo/drafts/README.md, scripts/check_seo_front_matter.py).
# Merging them one at a time on GitHub means resolving those by hand ten times.
# This script does it once, deterministically, and then applies the three small
# content fixes that only show up when the brand checker, the build kit and the
# articles are in the same tree.
#
# Usage, from a clone that has the origin remote:
#   git fetch origin
#   bash scripts/integrate_open_prs.sh [target-branch]      # default: integration/open-prs
#   # review, run the checks below, then: git push -u origin <target-branch>
#
# Resolution rules (the only places this script makes a choice):
#   .gitignore                       keep the repo-hygiene version, append any line
#                                    another branch adds that is not already present
#   README.md                        keep both sides (every branch appends a bullet)
#   _seo/drafts/README.md            keep the Cluster A version (the fullest one,
#                                    it documents the front-matter checker)
#   scripts/check_seo_front_matter.py keep the version that strips HTML comments
#                                    (a superset of the other)
# Anything else that conflicts stops the script so a person can look.
#
# PR 28 (docs/ios-paywall-diagnosis-2026-10-10.md) is deliberately NOT merged
# here. Its branch history quotes an activation PIN and the App Review code; the
# founder should rotate both and merge that PR separately after reading it.

set -euo pipefail

TARGET="${1:-integration/open-prs}"
BASE="${BASE:-origin/claude/task-review-credit-usage-5s4irr}"
GIT=(git -c merge.conflictStyle=merge)

ORDER=(
  repo-hygiene-ci            # PR 6:  CI, secret scan, brand checker. First so later merges get CI.
  seo-build-kit              # PR 22: article build kit
  seo-cluster-a              # PR 1
  seo-cluster-d              # PR 2
  seo-cluster-g              # PR 3
  seo-cluster-j              # PR 4
  seo-cluster-f-measure      # PR 7
  seo-cluster-i-consent      # PR 8
  seo-cluster-c-accuracy     # PR 9
  seo-cluster-e-compare      # PR 11
  seo-cluster-i-hipaa-basics # PR 24
  seo-cluster-g-staff-training        # PR 25
  seo-cluster-c-undereye-jawline      # PR 26
  linkedin-article-pack      # PR 23: after the articles it links to
  stripe-catalog             # PR 10
  lead-emails                # PR 12
  vertex-resilience          # PR 14
  infra-cloud-run            # PR 13
  research-capacity          # PR 15
  appstore-localized-metadata # PR 5
)

log() { printf '[integrate] %s\n' "$*"; }

resolve_conflicts() {
  local branch="$1" f
  for f in $(git diff --name-only --diff-filter=U); do
    case "$f" in
      _seo/drafts/README.md|scripts/check_seo_front_matter.py)
        git checkout --ours -- "$f"; git add "$f"
        log "  kept ours: $f" ;;
      README.md)
        python3 - "$f" <<'EOF'
import re, sys
p = sys.argv[1]; t = open(p).read()
t = re.sub(r'^<<<<<<< [^\n]*\n', '', t, flags=re.M)
t = re.sub(r'^=======\n', '', t, flags=re.M)
t = re.sub(r'^>>>>>>> [^\n]*\n', '', t, flags=re.M)
open(p, 'w').write(t)
EOF
        git add "$f"; log "  kept both sides: $f" ;;
      .gitignore)
        git show :2:.gitignore > .gitignore
        printf '\n# --- from %s ---\n' "$branch" >> .gitignore
        git show :3:.gitignore | grep -v '^#' | grep -v '^$' | while IFS= read -r line; do
          grep -qxF -- "$line" .gitignore || printf '%s\n' "$line" >> .gitignore
        done
        git add .gitignore; log "  union: .gitignore" ;;
      *)
        log "  UNRESOLVED conflict in $f (branch $branch). Resolve by hand, commit, and re-run."
        return 1 ;;
    esac
  done
}

git rev-parse --verify -q "$BASE" >/dev/null || { log "base $BASE not found; run git fetch origin"; exit 1; }
if git rev-parse --verify -q "$TARGET" >/dev/null; then
  log "branch $TARGET already exists; delete it or pass another name"; exit 1
fi

git checkout -q -b "$TARGET" "$BASE"
for b in "${ORDER[@]}"; do
  ref="origin/claude/$b"
  git rev-parse --verify -q "$ref" >/dev/null || { log "skip $b: $ref not found (merged or deleted?)"; continue; }
  if "${GIT[@]}" merge -q --no-edit "$ref" >/dev/null 2>&1; then
    log "ok   $b"
  else
    log "conf $b"
    resolve_conflicts "$b"
    git commit -q --no-edit
    log "  resolved and committed"
  fi
done

# Content fixes that only surface once everything is in one tree.
python3 - <<'EOF'
import pathlib
def sub(path, old, new):
    p = pathlib.Path(path); t = p.read_text()
    if t.count(old) != 1:
        raise SystemExit(f"{path}: expected exactly one occurrence of {old[:60]!r}")
    p.write_text(t.replace(old, new))

# Brand rule: no brand-name drug in a public draft (scripts/brand_check.py).
sub('_seo/drafts/is-a-wrinkle-relaxer-simulator-accurate.md',
    'Searches like "is botox simulator accurate", ',
    'Searches like "is a wrinkle relaxer simulator accurate", ')

# Build kit rule: every front-matter source must be linked from the body.
sub('_seo/drafts/what-to-measure-medspa-website.md',
    "Plausible's docs give two routes.",
    "[Plausible's docs](https://docs.plausible.io/custom-event-goals) give two routes.")
sub('_seo/drafts/what-to-measure-medspa-website.md',
    "Google publishes recommended event names, and lead generation",
    "Google publishes [recommended event names](https://support.google.com/analytics/answer/9267735), and lead generation")
sub('_seo/drafts/what-to-measure-medspa-website.md',
    "The HHS Office for Civil Rights bulletin on online tracking technologies gives",
    "The [HHS Office for Civil Rights bulletin on online tracking technologies](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html) gives")
sub('_seo/drafts/what-to-measure-medspa-website.md',
    "In June 2024 a federal court in Texas vacated the part covering unauthenticated public pages, and the agency later withdrew its appeal",
    "In June 2024 a federal court in Texas [vacated the part covering unauthenticated public pages](https://nixonpeabody.com/insights/alerts/2024/07/03/portions-of-ocrs-bulletin-on-online-tracking-technologies-deemed-unlawful), and the agency later withdrew its appeal")
sub('_seo/drafts/consent-script-ai-previews-consult-room.md',
    "covers scans of face geometry and excludes photographs",
    "covers [scans of face geometry](https://www.ilga.gov/documents/legislation/ilcs/documents/074000140k10.htm) and excludes photographs")
EOF
git add _seo/drafts
git commit -q -m "Fix brand-rule and source-citation findings surfaced by merging all branches

- Cluster C accuracy draft: the quoted search phrase named a brand-name drug,
  which scripts/brand_check.py forbids under _seo/drafts/. Use the generic term.
- Cluster F measurement and Cluster I consent drafts: link every front-matter
  source from the sentence that relies on it, as tools/seo/publish requires."
log "content fixes committed"

cat <<EOF

[integrate] done: $(git rev-list --count "$BASE"..HEAD) commits on $TARGET

Checks to run before pushing (all passed on Oct 10 in the cloud session):
  python3 -m unittest discover -s scripts/tests
  python3 scripts/brand_check.py
  python3 -m pip install -r tools/seo/publish/requirements.txt && python3 -m pytest -q --ignore=scripts/tests
  python3 tools/seo/publish/check_drafts.py
  for d in packages/vertex-resilience packages/lead-emails tools/stripe infra/preview-api; do (cd \$d && npm ci && npm test); done
  bash scripts/secret_scan.sh
  bash scripts/lint_workflows.sh
Then: git push -u origin $TARGET  and open a draft PR against the default branch.
EOF
