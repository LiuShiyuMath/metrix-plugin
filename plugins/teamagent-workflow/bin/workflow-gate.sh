#!/usr/bin/env bash
# plugins/teamagent-workflow/bin/workflow-gate.sh
#
# Deterministic FORCED-workflow gate (the thing that turns the four
# decorative arrows into doors that do not open out of order).
#
# Given a GitHub issue URL and a target stage, it rebuilds — from the
# append-only state file, never from chat memory — which stage that issue
# is currently at, then answers exactly ONE JSON object: may this stage
# transition happen, yes or no, and why.
#
# This is a FIXED TOOL on purpose, same contract as gen-grill-urls.sh and
# per metrixMarkets EVAL.md: no LLM is in the decision path. The judge
# harness can run it, drive a mechanically-built isolated state file, and
# prove the policy holds. The LLM may only READ the JSON it prints; it
# never authors the verdict.
#
# The entire forced-workflow policy is ONE line:
#
#     allowed = (requested == current) OR (requested == current + 1)
#
# Stage numbers:  claimed=1 · grilled=2 · handoff=3 · proof=4
# (`approved` is stage 5 but is NOT gate-requestable — it is a human
#  action, never a tool transition; asking for it is an unknown stage.)
#
# Contract:
#   - Input:  $1 = https://github.com/<owner>/<repo>/issues/<n>
#             $2 = requested stage  (claimed|grilled|handoff|proof)
#   - Output: one JSON object on stdout, last line, always.
#   - Exit 0 ALWAYS (probe-safe). Validity/allowance live in the JSON
#     fields (.valid / .allowed), never in the exit code.
#   - Enable model: the gate is OPT-IN. Until forced workflow is enabled
#     (see the workflow-enable skill / `${TEAMAGENT_FORCED_FLAG}` file),
#     it returns enforced:false, allowed:true — an advisory pass that
#     keeps the plugin backward-compatible. Enabling flips it to the
#     strict one-line policy above.
#   - Isolation: state file resolves from, in order,
#       $TEAMAGENT_WORKFLOW_FILE
#       $TEAMAGENT_HOME/workflow.jsonl
#       $HOME/.teamagent/workflow.jsonl
#     so judge probes / tmux demos isolate via a temp file or temp HOME.
#   - Dependency: jq (already a hard dep in this repo per EVAL.md).

set -euo pipefail

# ---- output helpers -------------------------------------------------------

emit_invalid() {
  # $1 = reason ; $2 = requested stage (may be empty)
  jq -nc --arg reason "$1" --arg req "${2:-}" \
    '{valid:false, enforced:null, allowed:false,
      current_stage:null,
      requested_stage:(if $req=="" then null else $req end),
      required_prev:null, reason:$reason}'
  exit 0
}

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"valid":false,"enforced":null,"allowed":false,"current_stage":null,"requested_stage":null,"required_prev":null,"reason":"jq not found"}'
  exit 0
fi

ISSUE_URL="${1:-}"
REQUESTED="${2:-}"

[ -n "$ISSUE_URL" ] || emit_invalid "missing issue url argument" "$REQUESTED"
[ -n "$REQUESTED" ] || emit_invalid "missing requested stage argument" ""

# v1 scope: GitHub issues only — identical shape check to gen-grill-urls.sh.
if ! printf '%s' "$ISSUE_URL" | grep -Eq '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/[0-9]+$'; then
  emit_invalid "not a github issue url (v1 supports github issues only): $ISSUE_URL" "$REQUESTED"
fi

# ---- stage vocabulary -----------------------------------------------------

stage_num() {
  case "$1" in
    claimed) echo 1 ;;
    grilled) echo 2 ;;
    handoff) echo 3 ;;
    proof)   echo 4 ;;
    *)       echo "" ;;
  esac
}
stage_name() {
  case "$1" in
    1) echo claimed ;;
    2) echo grilled ;;
    3) echo handoff ;;
    4) echo proof ;;
    *) echo "" ;;
  esac
}

REQ_NUM="$(stage_num "$REQUESTED")"
if [ -z "$REQ_NUM" ]; then
  emit_invalid "unknown stage '$REQUESTED' — expected one of: claimed | grilled | handoff | proof" "$REQUESTED"
fi

# ---- resolve state file & enable flag -------------------------------------

TEAMAGENT_DIR="${TEAMAGENT_HOME:-$HOME/.teamagent}"
STATE_FILE="${TEAMAGENT_WORKFLOW_FILE:-$TEAMAGENT_DIR/workflow.jsonl}"
FORCED_FLAG="${TEAMAGENT_FORCED_FLAG:-$TEAMAGENT_DIR/forced.enabled}"

ENFORCED=false
[ -f "$FORCED_FLAG" ] && ENFORCED=true

# ---- rebuild current stage from append-only state -------------------------
# current = highest gate-stage number ever written for THIS issue_url.
# No matching line (or no file) => current 0 (issue never claimed).

CUR_NUM=0
if [ -f "$STATE_FILE" ]; then
  CUR_NUM="$(
    jq -r --arg u "$ISSUE_URL" '
      select(type=="object")
      | select(.issue_url == $u)
      | .stage
      | if   . == "claimed" then 1
        elif . == "grilled" then 2
        elif . == "handoff" then 3
        elif . == "proof"   then 4
        else 0 end
    ' "$STATE_FILE" 2>/dev/null | sort -n | tail -n1
  )"
  [ -n "$CUR_NUM" ] || CUR_NUM=0
fi

CUR_NAME="$(stage_name "$CUR_NUM")"     # "" when CUR_NUM=0
CUR_LABEL="${CUR_NAME:-<unclaimed>}"
REQUIRED_PREV="$(stage_name $((REQ_NUM - 1)))"   # "" when requested == claimed

# ---- the policy -----------------------------------------------------------

ALLOWED=false
REASON=""

if [ "$ENFORCED" != "true" ]; then
  ALLOWED=true
  REASON="forced workflow not enabled — advisory pass (run /teamagent-workflow:workflow-enable to enforce ordering)"
elif [ "$CUR_NUM" -eq 0 ] && [ "$REQ_NUM" -ne 1 ]; then
  ALLOWED=false
  REASON="BLOCKED: issue not claimed yet — start with stage 'claimed' (you asked for '$REQUESTED')"
elif [ "$REQ_NUM" -eq "$CUR_NUM" ]; then
  ALLOWED=true
  REASON="re-running the current stage (idempotent): $CUR_LABEL"
elif [ "$REQ_NUM" -eq $((CUR_NUM + 1)) ]; then
  ALLOWED=true
  REASON="advancing exactly one stage: $CUR_LABEL -> $REQUESTED"
elif [ "$REQ_NUM" -gt "$CUR_NUM" ]; then
  ALLOWED=false
  REASON="BLOCKED: cannot skip — '$REQUESTED' needs '$REQUIRED_PREV' first, but the issue is only at '$CUR_LABEL'"
else
  ALLOWED=false
  REASON="BLOCKED: cannot go backward — issue is at '$CUR_LABEL', '$REQUESTED' is behind it"
fi

# ---- emit -----------------------------------------------------------------

jq -nc \
  --argjson enforced "$ENFORCED" \
  --argjson allowed "$([ "$ALLOWED" = true ] && echo true || echo false)" \
  --arg cur "$CUR_NAME" \
  --arg req "$REQUESTED" \
  --arg prev "$REQUIRED_PREV" \
  --arg reason "$REASON" \
  '{
     valid: true,
     enforced: $enforced,
     allowed: $allowed,
     current_stage: (if $cur=="" then null else $cur end),
     requested_stage: $req,
     required_prev: (if $prev=="" then null else $prev end),
     reason: $reason
   }'
