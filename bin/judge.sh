#!/usr/bin/env bash
# bin/judge.sh
#
# Third-party judge harness for teamagent-marketplace.
#
# Runs every probe under probes/*.sh, captures stdout/stderr and exit codes,
# parses each probe's single JSON line into a metrics object, then emits
# `judge.json` at the repo root AND inside the run's evidence directory.
#
# Per EVAL.md, this is the IMMUTABLE evaluator: bash + jq + ffprobe +
# node --check + claudefast. The LLM is allowed to read judge.json AFTER
# this script runs; the LLM is never the judge.
#
# Exit code: 0 if every probe reports skipped or its pass-criteria are
# satisfied; non-zero if any probe's verdict is FAIL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RUN_ID="run-$(date +%Y%m%d-%H%M%S)"
EVIDENCE_DIR="$ROOT/.judge/$RUN_ID"
mkdir -p "$EVIDENCE_DIR"

COMBINED_STDOUT="$EVIDENCE_DIR/combined.stdout"
: > "$COMBINED_STDOUT"

probes_json='[]'
failed_probes='[]'
all_passed=true

# pass_criteria(name, metrics_json) -> "true"/"false"
pass_criteria() {
  local name="$1" m="$2"
  local skipped
  skipped="$(printf '%s' "$m" | jq -r '.skipped // false')"
  if [ "$skipped" = "true" ]; then
    echo true; return
  fi
  case "$name" in
    stream-json)
      printf '%s' "$m" | jq -e '(.events // 0) >= 1 and (.parse_errors // 0) == 0' >/dev/null 2>&1 \
        && echo true || echo false
      ;;
    ab-plugin-dir)
      printf '%s' "$m" | jq -e '.a_blocked == false and .b_blocked == true and .b_benign_passed == true' >/dev/null 2>&1 \
        && echo true || echo false
      ;;
    file-checks)
      printf '%s' "$m" | jq -e '
        .rule_card_schema_ok == true and
        (.ceo_summary_kb // 0) >= 2 and
        (.ceo_summary_anchors // 0) == 4 and
        .cjs_node_check_ok == true and
        .git_clean == true and
        (.mp4_ok == true or .mp4_ok == null)
      ' >/dev/null 2>&1 && echo true || echo false
      ;;
    workflow-checks)
      printf '%s' "$m" | jq -e '
        (.marketplace_plugin_count // 0) == 4 and
        .workflow_in_marketplace == true and
        .all_plugin_json_valid == true and
        .gen_present == true and
        .gen_deterministic == true and
        .valid_issue_ok == true and
        .pr_url_rejected == true and
        .empty_arg_rejected == true and
        .gen_exit_zero == true
      ' >/dev/null 2>&1 && echo true || echo false
      ;;
    workflow-gate-checks)
      printf '%s' "$m" | jq -e '
        .gate_present == true and
        .forced_present == true and
        .advisory_pass_disabled == true and
        .enable_tool_ok == true and
        .gate_enforces_on_flag == true and
        .empty_only_claimed == true and
        .full_sequence_allowed == true and
        .skip_blocked == true and
        .backward_blocked == true and
        .idempotent_allowed == true and
        .bad_stage_invalid == true and
        .non_issue_invalid == true and
        .all_exit_zero == true
      ' >/dev/null 2>&1 && echo true || echo false
      ;;
    *) echo true ;;
  esac
}

for probe_path in "$ROOT"/probes/*.sh; do
  [ -f "$probe_path" ] || continue
  name="$(basename "$probe_path" .sh)"
  stdout_path="$EVIDENCE_DIR/${name}.out"
  stderr_path="$EVIDENCE_DIR/${name}.err"

  set +e
  bash "$probe_path" >"$stdout_path" 2>"$stderr_path"
  exit_code=$?
  set -e

  cat "$stdout_path" >> "$COMBINED_STDOUT"

  # Extract the last non-empty line of stdout as the metrics JSON.
  metrics_line="$(grep -v '^[[:space:]]*$' "$stdout_path" | tail -n 1 || true)"
  if [ -z "$metrics_line" ]; then
    metrics='{"skipped": true, "reason": "no stdout"}'
  elif printf '%s' "$metrics_line" | jq -e . >/dev/null 2>&1; then
    metrics="$metrics_line"
  else
    metrics="$(jq -nc --arg s "$metrics_line" '{skipped: true, reason: ("non-JSON stdout: " + ($s|.[0:200]))}')"
  fi

  passed="$(pass_criteria "$name" "$metrics")"
  if [ "$passed" != "true" ]; then
    all_passed=false
    failed_probes="$(printf '%s' "$failed_probes" | jq -c --arg n "$name" '. + [$n]')"
  fi

  probe_obj="$(jq -nc \
    --arg n "$name" \
    --argjson rc "$exit_code" \
    --argjson m "$metrics" \
    --arg sp "$stdout_path" \
    --arg ep "$stderr_path" \
    --argjson pass "$([ "$passed" = "true" ] && echo true || echo false)" \
    '{name: $n, exit_code: $rc, passed: $pass, metrics: $m, stdout_path: $sp, stderr_path: $ep}')"

  probes_json="$(printf '%s' "$probes_json" | jq -c --argjson p "$probe_obj" '. + [$p]')"
done

verdict="$(jq -nc \
  --argjson all "$([ "$all_passed" = true ] && echo true || echo false)" \
  --argjson failed "$failed_probes" \
  '{all_passed: $all, failed_probes: $failed}')"

judge_json="$(jq -nc \
  --arg schema "teamagent-judge/v1" \
  --arg rid "$RUN_ID" \
  --arg ed "$EVIDENCE_DIR" \
  --arg sp "$COMBINED_STDOUT" \
  --argjson probes "$probes_json" \
  --argjson verdict "$verdict" \
  '{schema: $schema, run_id: $rid, evidence_dir: $ed, stdout_path: $sp, probes: $probes, verdict: $verdict}')"

# pretty-print to both locations
printf '%s' "$judge_json" | jq . > "$ROOT/judge.json"
cp "$ROOT/judge.json" "$EVIDENCE_DIR/judge.json"

if [ "$all_passed" = true ]; then
  echo "PASS"
  exit 0
else
  fps="$(printf '%s' "$failed_probes" | jq -r 'join(",")')"
  echo "FAIL $fps"
  exit 1
fi
