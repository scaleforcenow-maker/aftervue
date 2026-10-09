#!/usr/bin/env bash
# Self-test for .gitleaks.toml: every custom rule must fire on a synthetic
# fixture, and the allowlist must silence the sample files.
#
# Fake credentials are assembled at runtime (prefix + generated body) so this
# file never contains a secret-shaped literal that GitHub push protection or
# the scanner itself would flag.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG="$REPO_ROOT/.gitleaks.toml"

if [ -n "${GITLEAKS_BIN:-}" ]; then
  GITLEAKS="$GITLEAKS_BIN"
elif command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS="$(command -v gitleaks)"
else
  GITLEAKS="$("$REPO_ROOT/scripts/secret_scan.sh" --print-bin)"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/gitleaks-selftest.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# Generators: deterministic, obviously fake, but shaped like the real thing.
alnum() { local n=$1 s=""; while [ ${#s} -lt "$n" ]; do s="${s}abcdef0123456789GHIJKLMNOPqrstuv"; done; printf '%s' "${s:0:$n}"; }
hex()   { local n=$1 s=""; while [ ${#s} -lt "$n" ]; do s="${s}0123456789abcdef"; done; printf '%s' "${s:0:$n}"; }
uuid()  { printf '%s-%s-%s-%s-%s' "$(hex 8)" "$(hex 4)" "$(hex 4)" "$(hex 4)" "$(hex 12)"; }

mkdir -p "$work/positive" "$work/negative/tests/fixtures"

# --- positives: each must produce at least one finding with the expected rule
declare -A EXPECT
w() { printf '%s\n' "$2" > "$work/positive/$1"; }

w google.txt     "GEMINI_API_KEY=AIza$(alnum 35)";                        EXPECT[google.txt]="aftervue-google-api-key"
w stripe_sk.txt  "STRIPE_SECRET=sk_live_$(alnum 32)";                     EXPECT[stripe_sk.txt]="aftervue-stripe-live-secret-key"
w stripe_rk.txt  "key = \"rk_live_$(alnum 32)\"";                        EXPECT[stripe_rk.txt]="aftervue-stripe-live-restricted-key"
w stripe_tk.txt  "STRIPE_TEST=sk_test_$(alnum 32)";                       EXPECT[stripe_tk.txt]="aftervue-stripe-test-secret-key"
w stripe_wh.txt  "STRIPE_WEBHOOK_SECRET=whsec_$(alnum 32)";               EXPECT[stripe_wh.txt]="aftervue-stripe-webhook-secret"
w postmark.txt   "POSTMARK_SERVER_TOKEN=$(uuid)";                         EXPECT[postmark.txt]="aftervue-postmark-server-token"
w postmark2.txt  "headers: { 'X-Postmark-Server-Token': '$(uuid)' }";     EXPECT[postmark2.txt]="aftervue-postmark-server-token"
w web3forms.txt  "leadKey: '$(uuid)', // web3forms";                      EXPECT[web3forms.txt]="aftervue-web3forms-access-key"
w web3forms2.txt "WEB3FORMS_ACCESS_KEY=$(uuid)";                          EXPECT[web3forms2.txt]="aftervue-web3forms-access-key"
w vercel.txt     "VERCEL_TOKEN=$(alnum 24)";                              EXPECT[vercel.txt]="aftervue-vercel-token"
w cloudflare.txt "TURNSTILE_SECRET_KEY=$(alnum 40)";                      EXPECT[cloudflare.txt]="aftervue-cloudflare-api-token"
w sa.json        "{ \"type\": \"service_account\", \"project_id\": \"x\" }"; EXPECT[sa.json]="aftervue-service-account-json"
printf -- '-----BEGIN PRIVATE KEY-----\n%s\n%s\n-----END PRIVATE KEY-----\n' "$(alnum 64)" "$(alnum 64)" > "$work/positive/AuthKey_ABCDE12345.p8"
EXPECT[AuthKey_ABCDE12345.p8]="aftervue-apple-p8-private-key"

# --- negatives: same shapes, but in allowlisted places or with placeholders
printf 'STRIPE_SECRET=sk_live_%s\n' "$(alnum 32)"        > "$work/negative/.env.example"
printf 'GEMINI_API_KEY=AIza%s\n' "$(alnum 35)"           > "$work/negative/tests/fixtures/keys.txt"
printf 'POSTMARK_SERVER_TOKEN=00000000-0000-0000-0000-000000000000\n' > "$work/negative/placeholders.env"
printf 'STRIPE_SECRET=${STRIPE_SECRET}\nVERCEL_TOKEN=process.env.VERCEL_TOKEN\n' > "$work/negative/envrefs.txt"
printf 'STRIPE_SECRET=sk_live_REPLACE_ME_%s\n' "$(alnum 20)" > "$work/negative/replace_me.txt"
printf "raw.products[1].prices[0].lookup_key = 'ai_marketing_prepaid_6mo';\nconst sku = \"app_monthly_core\";\n" > "$work/negative/stripe_ids.js"

fail=0

report="$work/positive.json"
set +e
"$GITLEAKS" dir --config "$CONFIG" --no-banner --exit-code 1 --redact \
  --report-format json --report-path "$report" "$work/positive" >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -ne 1 ]; then
  echo "FAIL: expected findings in positive fixtures (exit $rc)"; fail=1
fi

names=(); rules=(); for k in "${!EXPECT[@]}"; do names+=("$k"); rules+=("${EXPECT[$k]}"); done
EXPECT_RULES="${rules[*]}" python3 - "$report" "${names[@]}" <<'PY' || fail=1
import json, sys, os
report, names = sys.argv[1], sys.argv[2:]
findings = json.load(open(report)) if os.path.exists(report) else []
by_file = {}
for f in findings:
    by_file.setdefault(os.path.basename(f["File"]), set()).add(f["RuleID"])
expect = dict(zip(names, os.environ["EXPECT_RULES"].split()))
ok = True
for name, rule in expect.items():
    rules = by_file.get(name, set())
    if rule in rules:
        print(f"ok   {name:28s} -> {rule}")
    else:
        print(f"FAIL {name:28s} expected {rule}, got {sorted(rules) or 'nothing'}")
        ok = False
sys.exit(0 if ok else 1)
PY

set +e
"$GITLEAKS" dir --config "$CONFIG" --no-banner --exit-code 1 --redact \
  --report-format json --report-path "$work/negative.json" "$work/negative" >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -eq 0 ]; then
  echo "ok   allowlist silences sample files and placeholders"
else
  echo "FAIL: allowlisted fixtures produced findings (exit $rc):"
  python3 -c 'import json,sys; [print("  ", f["File"], f["RuleID"]) for f in json.load(open(sys.argv[1]))]' "$work/negative.json" || true
  fail=1
fi

if [ "$fail" -eq 0 ]; then echo "secret-scan rule self-test: PASS"; else echo "secret-scan rule self-test: FAIL"; fi
exit "$fail"
