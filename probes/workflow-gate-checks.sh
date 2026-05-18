#!/usr/bin/env bash
# probes/workflow-gate-checks.sh
#
# Judge probe for the FORCED workflow gate (teamagent-workflow). Fixed
# tools only, no self-eval. It drives bin/workflow-gate.sh and
# bin/workflow-forced.sh against a MECHANICALLY-built, isolated temp
# state file (never the real ~/.teamagent), and asserts a fixed set of
# booleans:
#
#   advisory_pass_disabled : gate not enabled => enforced:false,
#                            allowed:true even for proof-on-empty
#   enable_tool_ok         : workflow-forced.sh on/off reports
#                            enabled:true / enabled:false
#   gate_enforces_on_flag  : with flag present the gate reports
#                            enforced:true
#   empty_only_claimed     : enabled+empty => 'proof' blocked AND
#                            'claimed' allowed
#   full_sequence_allowed  : claimed->grilled->handoff->proof each
#                            allowed as state advances
#   skip_blocked           : at 'claimed', requesting 'proof' is blocked
#   backward_blocked       : at 'proof', requesting 'grilled' is blocked
#   idempotent_allowed     : at 'claimed', requesting 'claimed' allowed
#   bad_stage_invalid      : unknown stage => valid:false
#   non_issue_invalid      : non-issue URL => valid:false
#   all_exit_zero          : every invocation exited 0 (probe contract)
#
# Output: a single JSON object to stdout, last line. Exit 0 always.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

GATE="plugins/teamagent-workflow/bin/workflow-gate.sh"
FORCED="plugins/teamagent-workflow/bin/workflow-forced.sh"
ISSUE="https://github.com/LiuShiyuMath/metrix-plugin/issues/2"
PRURL="https://github.com/LiuShiyuMath/metrix-plugin/pull/2"

gate_present=false
[ -f "$GATE" ] && gate_present=true
forced_present=false
[ -f "$FORCED" ] && forced_present=true

WORK="$(mktemp -d -t wfgate-XXXXXX)"
export TEAMAGENT_WORKFLOW_FILE="$WORK/workflow.jsonl"
export TEAMAGENT_FORCED_FLAG="$WORK/forced.enabled"
trap 'rm -rf "$WORK"' EXIT

all_exit_zero=true
# g <issue> <stage>  -> echoes gate JSON, records non-zero exits
g() {
  local out rc
  set +e
  out="$(bash "$GATE" "$1" "$2")"; rc=$?
  set -e
  [ "$rc" -eq 0 ] || all_exit_zero=false
  printf '%s' "$out"
}
f() {
  local out rc
  set +e
  out="$(bash "$FORCED" "$1")"; rc=$?
  set -e
  [ "$rc" -eq 0 ] || all_exit_zero=false
  printf '%s' "$out"
}
jbool() { printf '%s' "$1" | jq -e "$2" >/dev/null 2>&1 && echo true || echo false; }

state_reset() { : > "$TEAMAGENT_WORKFLOW_FILE"; }
state_add()   { # $1 = stage
  jq -nc --arg u "$ISSUE" --arg s "$1" \
    '{ts:"t",issue_url:$u,stage:$s,actor:"probe"}' >> "$TEAMAGENT_WORKFLOW_FILE"
}
enable()  { : > "$TEAMAGENT_FORCED_FLAG"; }
disable() { rm -f "$TEAMAGENT_FORCED_FLAG"; }

# --- advisory_pass_disabled ----------------------------------------------
disable; state_reset
adv="$(g "$ISSUE" proof)"
advisory_pass_disabled="$(jbool "$adv" '.enforced==false and .allowed==true')"

# --- enable_tool_ok + gate_enforces_on_flag -------------------------------
enable_tool_ok=false
gate_enforces_on_flag=false
if [ "$forced_present" = true ]; then
  disable
  on_json="$(f on)"
  off_after=false
  # the tool writes the real flag; verify then restore to our own control
  on_ok="$(jbool "$on_json" '.valid==true and .enabled==true')"
  flag_made=false; [ -f "$TEAMAGENT_FORCED_FLAG" ] && flag_made=true
  enf="$(g "$ISSUE" claimed)"
  gate_enforces_on_flag="$(jbool "$enf" '.enforced==true')"
  off_json="$(f off)"
  off_ok="$(jbool "$off_json" '.valid==true and .enabled==false')"
  flag_gone=true; [ -f "$TEAMAGENT_FORCED_FLAG" ] && flag_gone=false
  if [ "$on_ok" = true ] && [ "$flag_made" = true ] && \
     [ "$off_ok" = true ] && [ "$flag_gone" = true ]; then
    enable_tool_ok=true
  fi
fi

# From here on we control the flag directly (mechanical, independent of
# the toggle tool's audit-line side effect).
enable

# --- empty_only_claimed ---------------------------------------------------
state_reset
ec_proof="$(g "$ISSUE" proof)"      # must be blocked
ec_claim="$(g "$ISSUE" claimed)"    # must be allowed
empty_only_claimed="$(
  [ "$(jbool "$ec_proof" '.allowed==false and .valid==true')" = true ] && \
  [ "$(jbool "$ec_claim" '.allowed==true  and .valid==true')" = true ] && \
  echo true || echo false )"

# --- full_sequence_allowed -----------------------------------------------
state_reset
s1="$(g "$ISSUE" claimed)";  state_add claimed
s2="$(g "$ISSUE" grilled)";  state_add grilled
s3="$(g "$ISSUE" handoff)";  state_add handoff
s4="$(g "$ISSUE" proof)";    state_add proof
full_sequence_allowed="$(
  for j in "$s1" "$s2" "$s3" "$s4"; do
    [ "$(jbool "$j" '.allowed==true')" = true ] || { echo false; exit; }
  done; echo true )"

# state file now ends at: claimed,grilled,handoff,proof  (current=proof)
# --- backward_blocked -----------------------------------------------------
bw="$(g "$ISSUE" grilled)"
backward_blocked="$(jbool "$bw" '.allowed==false and (.reason|test("backward"))')"

# --- skip_blocked + idempotent_allowed (state truncated to claimed) ------
state_reset; state_add claimed
sk="$(g "$ISSUE" proof)"
skip_blocked="$(jbool "$sk" '.allowed==false and (.reason|test("skip"))')"
id="$(g "$ISSUE" claimed)"
idempotent_allowed="$(jbool "$id" '.allowed==true and (.reason|test("idempotent"))')"

# --- bad_stage_invalid + non_issue_invalid -------------------------------
bs="$(g "$ISSUE" frobnicate)"
bad_stage_invalid="$(jbool "$bs" '.valid==false')"
ni="$(g "$PRURL" claimed)"
non_issue_invalid="$(jbool "$ni" '.valid==false')"

jq -nc \
  --argjson gate_present "$gate_present" \
  --argjson forced_present "$forced_present" \
  --argjson advisory_pass_disabled "$advisory_pass_disabled" \
  --argjson enable_tool_ok "$enable_tool_ok" \
  --argjson gate_enforces_on_flag "$gate_enforces_on_flag" \
  --argjson empty_only_claimed "$empty_only_claimed" \
  --argjson full_sequence_allowed "$full_sequence_allowed" \
  --argjson skip_blocked "$skip_blocked" \
  --argjson backward_blocked "$backward_blocked" \
  --argjson idempotent_allowed "$idempotent_allowed" \
  --argjson bad_stage_invalid "$bad_stage_invalid" \
  --argjson non_issue_invalid "$non_issue_invalid" \
  --argjson all_exit_zero "$all_exit_zero" \
  '{
     gate_present:           $gate_present,
     forced_present:         $forced_present,
     advisory_pass_disabled: $advisory_pass_disabled,
     enable_tool_ok:         $enable_tool_ok,
     gate_enforces_on_flag:  $gate_enforces_on_flag,
     empty_only_claimed:     $empty_only_claimed,
     full_sequence_allowed:  $full_sequence_allowed,
     skip_blocked:           $skip_blocked,
     backward_blocked:       $backward_blocked,
     idempotent_allowed:     $idempotent_allowed,
     bad_stage_invalid:      $bad_stage_invalid,
     non_issue_invalid:      $non_issue_invalid,
     all_exit_zero:          $all_exit_zero,
     skipped:                false
   }'
