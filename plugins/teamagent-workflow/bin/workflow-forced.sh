#!/usr/bin/env bash
# plugins/teamagent-workflow/bin/workflow-forced.sh
#
# Fixed toggle for FORCED workflow enforcement (the "enable" tool behind
# the workflow-enable skill). The gate (workflow-gate.sh) is opt-in; this
# is the only thing that flips it on or off, and — like every other tool
# in this plugin — it is a FIXED TOOL: deterministic, JSON on stdout,
# exit 0 always, no LLM in the path. The judge harness drives it; the
# model only reads what it prints.
#
# Usage:
#   workflow-forced.sh on        # enable enforcement
#   workflow-forced.sh off       # disable enforcement (advisory again)
#   workflow-forced.sh status    # report current state (default)
#
# State of record:
#   - flag file:  $TEAMAGENT_FORCED_FLAG
#                 | $TEAMAGENT_HOME/forced.enabled
#                 | $HOME/.teamagent/forced.enabled
#   - audit line appended to the same append-only workflow.jsonl the gate
#     reads, so enabling/disabling is itself on the record:
#       {"ts":..,"issue_url":null,"stage":"forced_enabled"|"forced_disabled",..}
#
# Exit 0 always; the outcome lives in the JSON, never the exit code.

set -euo pipefail

ACTION="${1:-status}"

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"valid":false,"action":"'"$ACTION"'","enabled":false,"reason":"jq not found"}'
  exit 0
fi

TEAMAGENT_DIR="${TEAMAGENT_HOME:-$HOME/.teamagent}"
STATE_FILE="${TEAMAGENT_WORKFLOW_FILE:-$TEAMAGENT_DIR/workflow.jsonl}"
FORCED_FLAG="${TEAMAGENT_FORCED_FLAG:-$TEAMAGENT_DIR/forced.enabled}"

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ACTOR="$(git config user.name 2>/dev/null || echo unknown)"

emit() {
  # $1 valid  $2 enabled  $3 reason
  jq -nc \
    --arg action "$ACTION" \
    --argjson valid "$1" \
    --argjson enabled "$2" \
    --arg reason "$3" \
    --arg flag "$FORCED_FLAG" \
    --arg state "$STATE_FILE" \
    '{valid:$valid, action:$action, enabled:$enabled,
      flag_path:$flag, state_file:$state, reason:$reason}'
  exit 0
}

append_audit() {
  # $1 = stage marker
  mkdir -p "$(dirname "$STATE_FILE")"
  jq -nc \
    --arg ts "$TS" --arg stage "$1" --arg actor "$ACTOR" \
    '{ts:$ts, issue_url:null, stage:$stage, actor:$actor,
      chatgpt_url:null, claude_url:null, pr_url:null, proof_urls:[],
      note:("forced workflow " + (if $stage=="forced_enabled" then "enabled" else "disabled" end))}' \
    >> "$STATE_FILE"
}

case "$ACTION" in
  on|enable|true)
    mkdir -p "$TEAMAGENT_DIR"
    : > "$FORCED_FLAG" 2>/dev/null || { emit false false "cannot write flag file: $FORCED_FLAG"; }
    append_audit forced_enabled
    emit true true "forced workflow ENABLED — every stage now passes through workflow-gate.sh; out-of-order transitions are blocked"
    ;;
  off|disable|false)
    rm -f "$FORCED_FLAG" 2>/dev/null || true
    append_audit forced_disabled
    emit true false "forced workflow DISABLED — gate returns to advisory pass-through (ordering no longer enforced)"
    ;;
  status|"")
    if [ -f "$FORCED_FLAG" ]; then
      emit true true "forced workflow is ENABLED (flag present)"
    else
      emit true false "forced workflow is NOT enabled (advisory pass-through)"
    fi
    ;;
  *)
    emit false false "unknown action '$ACTION' — expected: on | off | status"
    ;;
esac
