#!/usr/bin/env bash
# probes/workflow-checks.sh
#
# Judge probe for the 4th plugin, teamagent-workflow. Fixed tools only,
# no self-eval. Proves:
#   - marketplace_plugin_count:   .plugins | length  (expected 4)
#   - workflow_in_marketplace:    a teamagent-workflow entry exists
#   - all_plugin_json_valid:      jq -e on every plugins/*/.claude-plugin/plugin.json
#   - gen_deterministic:          two runs on the same issue URL are byte-identical
#   - valid_issue_ok:             valid:true AND chatgpt.com URL AND claude.ai URL
#   - pr_url_rejected:            a PR URL yields valid:false
#   - empty_arg_rejected:         no arg yields valid:false
#   - gen_exit_zero:              the generator exits 0 on all of the above
#
# Output: a single JSON object to stdout. Exit 0 always (probe contract).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

GEN="plugins/teamagent-workflow/bin/gen-grill-urls.sh"
ISSUE="https://github.com/LiuShiyuMath/metrix-plugin/issues/2"
PR="https://github.com/LiuShiyuMath/metrix-plugin/pull/2"

# --- marketplace -----------------------------------------------------------
marketplace_plugin_count=0
workflow_in_marketplace=false
if [ -f .claude-plugin/marketplace.json ] && jq -e . .claude-plugin/marketplace.json >/dev/null 2>&1; then
  marketplace_plugin_count="$(jq '.plugins | length' .claude-plugin/marketplace.json)"
  if jq -e '.plugins[] | select(.name=="teamagent-workflow")' \
       .claude-plugin/marketplace.json >/dev/null 2>&1; then
    workflow_in_marketplace=true
  fi
fi

# --- every plugin.json valid ----------------------------------------------
all_plugin_json_valid=true
for pj in plugins/*/.claude-plugin/plugin.json; do
  [ -f "$pj" ] || continue
  if ! jq -e '.name and .description and .version' "$pj" >/dev/null 2>&1; then
    all_plugin_json_valid=false
  fi
done

# --- generator behaviour ---------------------------------------------------
gen_present=false
gen_deterministic=false
valid_issue_ok=false
pr_url_rejected=false
empty_arg_rejected=false
gen_exit_zero=true

if [ -x "$GEN" ] || [ -f "$GEN" ]; then
  gen_present=true

  set +e
  out1="$(bash "$GEN" "$ISSUE")";   rc1=$?
  out2="$(bash "$GEN" "$ISSUE")";   rc2=$?
  outpr="$(bash "$GEN" "$PR")";     rc3=$?
  outempty="$(bash "$GEN")";        rc4=$?
  set -e

  [ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ] && [ "$rc3" -eq 0 ] && [ "$rc4" -eq 0 ] \
    || gen_exit_zero=false

  if [ "$out1" = "$out2" ] && [ -n "$out1" ]; then
    gen_deterministic=true
  fi

  if printf '%s' "$out1" | jq -e '
        .valid == true
        and (.chatgpt_url | startswith("https://chatgpt.com/?prompt="))
        and (.claude_url  | startswith("https://claude.ai/new?q="))
      ' >/dev/null 2>&1; then
    valid_issue_ok=true
  fi

  printf '%s' "$outpr"    | jq -e '.valid == false' >/dev/null 2>&1 && pr_url_rejected=true
  printf '%s' "$outempty" | jq -e '.valid == false' >/dev/null 2>&1 && empty_arg_rejected=true
fi

jq -nc \
  --argjson cnt "$marketplace_plugin_count" \
  --argjson winm "$workflow_in_marketplace" \
  --argjson apjv "$all_plugin_json_valid" \
  --argjson gp "$gen_present" \
  --argjson gd "$gen_deterministic" \
  --argjson vio "$valid_issue_ok" \
  --argjson pur "$pr_url_rejected" \
  --argjson ear "$empty_arg_rejected" \
  --argjson gez "$gen_exit_zero" \
  '{
     marketplace_plugin_count: $cnt,
     workflow_in_marketplace:  $winm,
     all_plugin_json_valid:    $apjv,
     gen_present:              $gp,
     gen_deterministic:        $gd,
     valid_issue_ok:           $vio,
     pr_url_rejected:          $pur,
     empty_arg_rejected:       $ear,
     gen_exit_zero:            $gez,
     skipped:                  false
   }'
