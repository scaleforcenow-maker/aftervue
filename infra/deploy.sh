#!/usr/bin/env bash
# Manual build + deploy for AfterVue Cloud Run services via Cloud Build.
#
# Usage:
#   PROJECT_ID=... ./infra/deploy.sh [--only preview|leads|both] [--no-deploy] [--tag TAG] [--yes] [--dry-run]
#
# Required env:  PROJECT_ID
# Optional env:  REGION (default us-east4), AR_REPO (default aftervue),
#                CLOUDBUILD_SA (default aftervue-cloudbuild-sa@$PROJECT_ID.iam.gserviceaccount.com),
#                CLOUDSDK_AUTH_ACCESS_TOKEN (one-hour token from `gcloud auth print-access-token`;
#                gcloud picks it up on its own and this script never prints it).
#
# The script prints a plan of exactly what it will submit, then asks for
# confirmation unless --yes is given. Terraform owns the service configuration;
# this only rolls new images (gcloud run deploy --image).

set -euo pipefail

usage() { sed -n '2,16p' "$0"; exit "${1:-0}"; }

ONLY="both"
DEPLOY="true"
TAG=""
ASSUME_YES="false"
DRY_RUN="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    --no-deploy) DEPLOY="false"; shift ;;
    --tag) TAG="${2:-}"; shift 2 ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown argument: $1" >&2; usage 2 ;;
  esac
done

if [ -z "${PROJECT_ID:-}" ]; then
  echo "ERROR: PROJECT_ID is not set. Refusing to run." >&2
  echo "       export PROJECT_ID=<your project id>   # never commit it" >&2
  exit 2
fi

case "$ONLY" in preview|leads|both) ;; *) echo "ERROR: --only must be preview, leads or both" >&2; exit 2 ;; esac

REGION="${REGION:-us-east4}"
AR_REPO="${AR_REPO:-aftervue}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-aftervue-cloudbuild-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
PREVIEW_CONTEXT="${PREVIEW_CONTEXT:-infra/preview-api}"
LEADS_CONTEXT="${LEADS_CONTEXT:-aftervue-leads}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "$TAG" ]; then
  TAG="$(git rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then TAG="${TAG}-dirty"; fi
fi

BUILD_PREVIEW="false"; BUILD_LEADS="false"
[ "$ONLY" = "preview" ] || [ "$ONLY" = "both" ] && BUILD_PREVIEW="true"
[ "$ONLY" = "leads" ] || [ "$ONLY" = "both" ] && BUILD_LEADS="true"

if [ "$BUILD_LEADS" = "true" ] && [ ! -f "$LEADS_CONTEXT/Dockerfile" ]; then
  if [ "$ONLY" = "both" ]; then
    echo "note: $LEADS_CONTEXT/Dockerfile not found; building preview-api only (pass --only leads to force)." >&2
    BUILD_LEADS="false"
  else
    echo "ERROR: $LEADS_CONTEXT/Dockerfile not found." >&2; exit 2
  fi
fi
if [ "$BUILD_PREVIEW" = "true" ] && [ ! -f "$PREVIEW_CONTEXT/Dockerfile" ]; then
  echo "ERROR: $PREVIEW_CONTEXT/Dockerfile not found." >&2; exit 2
fi

command -v gcloud >/dev/null || { echo "ERROR: gcloud not on PATH" >&2; exit 2; }

AUTH_MODE="application default / gcloud account"
if [ -n "${CLOUDSDK_AUTH_ACCESS_TOKEN:-}" ]; then AUTH_MODE="CLOUDSDK_AUTH_ACCESS_TOKEN (one-hour token, value not shown)"; fi

SUBS="_REGION=${REGION},_AR_REPO=${AR_REPO},_TAG=${TAG},_PREVIEW_CONTEXT=${PREVIEW_CONTEXT},_LEADS_CONTEXT=${LEADS_CONTEXT},_BUILD_PREVIEW=${BUILD_PREVIEW},_BUILD_LEADS=${BUILD_LEADS},_DEPLOY=${DEPLOY}"

cat <<PLAN

================ deploy plan ================
project          : ${PROJECT_ID}
region           : ${REGION}
artifact repo    : ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}
image tag        : ${TAG}
build preview-api: ${BUILD_PREVIEW}   (context ${PREVIEW_CONTEXT})
build leads-api  : ${BUILD_LEADS}   (context ${LEADS_CONTEXT})
deploy revisions : ${DEPLOY}
cloud build SA   : ${CLOUDBUILD_SA}
auth             : ${AUTH_MODE}
command          : gcloud builds submit . --config infra/cloudbuild.yaml
                     --project ${PROJECT_ID} --region ${REGION}
                     --service-account projects/${PROJECT_ID}/serviceAccounts/${CLOUDBUILD_SA}
                     --substitutions ${SUBS}
=============================================

PLAN

if [ "$DRY_RUN" = "true" ]; then echo "dry run: nothing submitted."; exit 0; fi

if [ "$ASSUME_YES" != "true" ]; then
  read -r -p "Submit this build? [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "aborted."; exit 1 ;; esac
fi

# Preflight: the token/account must be valid and the project reachable.
gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null

gcloud builds submit . \
  --config infra/cloudbuild.yaml \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service-account "projects/${PROJECT_ID}/serviceAccounts/${CLOUDBUILD_SA}" \
  --substitutions "$SUBS" \
  --ignore-file .gcloudignore

if [ "$DEPLOY" = "true" ]; then
  echo
  echo "Deployed. Service URLs:"
  [ "$BUILD_PREVIEW" = "true" ] && gcloud run services describe preview-api --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)'
  [ "$BUILD_LEADS" = "true" ] && gcloud run services describe leads-api --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)'
fi
