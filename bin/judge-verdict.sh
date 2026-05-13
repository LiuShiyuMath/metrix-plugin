#!/usr/bin/env bash
# bin/judge-verdict.sh
#
# Per EVAL.md: "verdict = cat judge.json | claudefast --plugin-dir /tmp/empty
# - 自评机械隔离". The empty plugin dir means claudefast cannot pull in any
# teamagent skill and use it to bias the call. The LLM only sees raw JSON.
#
# Falls back to printing the local judge.json verdict if claudefast is not
# in PATH.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

JUDGE_JSON="${ROOT}/judge.json"
if [ ! -f "$JUDGE_JSON" ]; then
  echo "FAIL no judge.json — run bin/judge.sh first" >&2
  exit 2
fi

load_claudefast() {
  if command -v claudefast >/dev/null 2>&1; then return 0; fi
  if [ -f "$HOME/.zshrc" ]; then
    set +u; source "$HOME/.zshrc" >/dev/null 2>&1 || true; set -u
  fi
  if [ -f "$HOME/.bashrc" ]; then
    set +u; source "$HOME/.bashrc" >/dev/null 2>&1 || true; set -u
  fi
  command -v claudefast >/dev/null 2>&1 || type claudefast >/dev/null 2>&1
}

mkdir -p /tmp/empty 2>/dev/null || true

if ! load_claudefast; then
  echo "NOTE claudefast not in PATH; falling back to local verdict"
  local_verdict="$(jq -r 'if .verdict.all_passed then "PASS" else "FAIL " + (.verdict.failed_probes | join(",")) end' "$JUDGE_JSON")"
  echo "$local_verdict"
  exit 0
fi

PROMPT='Read judge.json from stdin. Return ONLY PASS or FAIL with one-line reason. Do not reason beyond raw fields. The verdict is .verdict.all_passed; failed probe names are .verdict.failed_probes.'

bash -lc "claudefast --plugin-dir /tmp/empty -p '$PROMPT'" < "$JUDGE_JSON"
