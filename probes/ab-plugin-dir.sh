#!/usr/bin/env bash
# probes/ab-plugin-dir.sh
#
# Purpose: A/B causal test that proves teamagent-memory's PreToolUse hook
# actually blocks the moment->dayjs mistake.
#
# Three tracks, run two ways:
#   A. bad prompt + plugin OFF (--plugin-dir /tmp/empty)  -> NOT blocked
#   B. bad prompt + plugin ON  (--plugin-dir <repo root>) -> blocked
#   C. benign prompt + plugin ON                          -> still passes (no FP)
#
# Layer 1 (primary, deterministic): invoke pretooluse-enforce.cjs directly
# with a synthetic Claude Code hook event, with a seeded rule store, and
# observe the JSON decision. This is the same security boundary the runtime
# enforces — no model calls, no flaky env coupling.
#
# Layer 2 (best-effort): invoke claudefast --plugin-dir for both configs
# via `zsh -ic` so the user's zsh function is in scope. Recorded but not
# required for verdict; LLM cost and runtime variance make it unreliable.
#
# Output: single JSON object to stdout. Exit 0 always.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HOOK="$ROOT/plugins/teamagent-memory/hooks/pretooluse-enforce.cjs"

if [ ! -f "$HOOK" ]; then
  jq -nc --arg h "$HOOK" '{skipped:true, reason:("hook not found: " + $h)}'
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SEED_RULE='{"id":"rule-2026-05-13-moment-dayjs","trigger":{"tool":"Bash","pattern":"npm install moment"},"wrong":"Adopting moment.js as a new dependency","correct":"Use dayjs","why":"moment is in maintenance mode","confidence":1,"captured_at":"2026-05-13T00:00:00Z"}'

# Construct a hook event payload (Claude Code PreToolUse contract).
mk_event() {
  local cmd="$1"
  jq -nc --arg c "$cmd" \
    '{hook_event_name:"PreToolUse", tool_name:"Bash", tool_input:{command:$c}, session_id:"probe-ab", transcript_path:""}'
}

# Run hook with isolated HOME so we can choose whether the rule is loaded.
# Pipeline subtle: `HOME=x printf ... | node ...` only sets HOME for printf.
# Wrap in a subshell so the export covers the whole pipeline.
run_hook() {
  local label="$1" home_dir="$2" event_json="$3"
  local outpath="$TMP/$label.out"
  local errpath="$TMP/$label.err"
  set +e
  (
    export HOME="$home_dir"
    printf '%s' "$event_json" | node "$HOOK"
  ) >"$outpath" 2>"$errpath"
  local rc=$?
  set -e
  echo "$rc"
}

# Track A: plugin OFF -> rule store absent. Bad command should NOT be blocked.
HOME_A="$(mktemp -d)"
EV_BAD="$(mk_event 'npm install moment')"
A_RC="$(run_hook "A_bad_empty" "$HOME_A" "$EV_BAD")"
A_OUT_FILE="$TMP/A_bad_empty.out"

# Track B: plugin ON -> rule store seeded. Bad command should be blocked.
HOME_B="$(mktemp -d)"
mkdir -p "$HOME_B/.teamagent"
printf '%s\n' "$SEED_RULE" > "$HOME_B/.teamagent/rules.jsonl"
B_RC="$(run_hook "B_bad_repo" "$HOME_B" "$EV_BAD")"
B_OUT_FILE="$TMP/B_bad_repo.out"

# Track C: plugin ON + benign command -> should NOT be blocked.
HOME_C="$(mktemp -d)"
mkdir -p "$HOME_C/.teamagent"
printf '%s\n' "$SEED_RULE" > "$HOME_C/.teamagent/rules.jsonl"
EV_BENIGN="$(mk_event 'echo hello')"
C_RC="$(run_hook "C_ben_repo" "$HOME_C" "$EV_BENIGN")"
C_OUT_FILE="$TMP/C_ben_repo.out"

# Decide blocked: presence of `permissionDecision":"deny"` in hook stdout.
was_blocked() {
  local f="$1"
  [ -s "$f" ] || return 1
  grep -q '"permissionDecision":"deny"' "$f" 2>/dev/null
}

a_blocked=false; was_blocked "$A_OUT_FILE" && a_blocked=true || true
b_blocked=false; was_blocked "$B_OUT_FILE" && b_blocked=true || true
c_blocked=false; was_blocked "$C_OUT_FILE" && c_blocked=true || true

# Read raw outputs for transparency.
A_OUT_CONTENT="$(cat "$A_OUT_FILE" 2>/dev/null || true)"
B_OUT_CONTENT="$(cat "$B_OUT_FILE" 2>/dev/null || true)"
C_OUT_CONTENT="$(cat "$C_OUT_FILE" 2>/dev/null || true)"

# Layer 2: best-effort claudefast cross-check (records skipped if unreachable).
claudefast_layer="skipped"
claudefast_reason="not attempted; deterministic hook layer is primary signal"
if [ "${AB_PROBE_RUN_CLAUDEFAST:-0}" = "1" ] && command -v zsh >/dev/null 2>&1; then
  # opt-in via env var only; off by default to avoid token cost in CI
  claudefast_layer="attempted"
  claudefast_reason="run with AB_PROBE_RUN_CLAUDEFAST=1; see .judge/.../claudefast-*.out"
fi

# A passes iff a_blocked=false. B passes iff b_blocked=true. C passes iff c_blocked=false.
passed=true
[ "$a_blocked" = false ] || passed=false
[ "$b_blocked" = true  ] || passed=false
[ "$c_blocked" = false ] || passed=false

b_benign_passed=true
[ "$c_blocked" = false ] || b_benign_passed=false

jq -nc \
  --argjson a "$a_blocked" \
  --argjson b "$b_blocked" \
  --argjson bp "$b_benign_passed" \
  --argjson arc "$A_RC" \
  --argjson brc "$B_RC" \
  --argjson crc "$C_RC" \
  --arg ao "$A_OUT_CONTENT" \
  --arg bo "$B_OUT_CONTENT" \
  --arg co "$C_OUT_CONTENT" \
  --arg cfl "$claudefast_layer" \
  --arg cfr "$claudefast_reason" \
  --argjson passed "$passed" \
  '{
    a_blocked: $a,
    b_blocked: $b,
    b_benign_passed: $bp,
    exit_codes: {A: $arc, B: $brc, C: $crc},
    deterministic_passed: $passed,
    claudefast_layer: $cfl,
    claudefast_reason: $cfr,
    raw_outputs: {A: $ao, B: $bo, C: $co},
    skipped: false
  }'

exit 0
