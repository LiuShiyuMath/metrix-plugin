#!/usr/bin/env bash
# probes/file-checks.sh
#
# Purpose: static evidence checks per EVAL.md.
#   - rule_card_schema_ok:   jq -e schema on evidence/rule-card.json
#   - ceo_summary_kb:        wc -c on evidence/ceo-summary.html (>= 2KB)
#   - ceo_summary_anchors:   grep -F count for 4 verbatim anchor strings
#   - cjs_node_check_ok:     node --check on every plugins/**/*.cjs
#   - git_clean:             git status --porcelain empty
#   - mp4_ok:                ffprobe duration<=90 AND width>=1280 AND height>=720
#                            (null if file absent or ffprobe missing)
#
# Output: a single JSON object to stdout. Exit 0 always.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# --- rule-card schema -------------------------------------------------------
rule_card_schema_ok=false
if [ -f evidence/rule-card.json ]; then
  if jq -e '.id and .trigger.pattern and .wrong and .correct and .why and (.confidence | type=="number")' \
       evidence/rule-card.json >/dev/null 2>&1; then
    rule_card_schema_ok=true
  fi
fi

# --- ceo-summary.html size + anchors ---------------------------------------
ceo_summary_bytes=0
ceo_summary_kb=0
ceo_summary_anchors=0
if [ -f evidence/ceo-summary.html ]; then
  ceo_summary_bytes=$(wc -c < evidence/ceo-summary.html | tr -d ' ')
  ceo_summary_kb=$(( ceo_summary_bytes / 1024 ))
  # Verbatim anchor strings per EVAL.md
  anchors=(
    "Previous Claude Code made this mistake"
    "TeamAgent blocked it"
    "rule-card"
    "before/after"
  )
  for a in "${anchors[@]}"; do
    if grep -F -q "$a" evidence/ceo-summary.html; then
      ceo_summary_anchors=$((ceo_summary_anchors + 1))
    fi
  done
fi

# --- node --check on every .cjs --------------------------------------------
cjs_node_check_ok=true
cjs_failed=()
if command -v node >/dev/null 2>&1; then
  while IFS= read -r f; do
    if ! node --check "$f" >/dev/null 2>&1; then
      cjs_node_check_ok=false
      cjs_failed+=("$f")
    fi
  done < <(find plugins -type f -name '*.cjs' 2>/dev/null)
else
  cjs_node_check_ok=false
  cjs_failed+=("node not in PATH")
fi

# --- git clean -------------------------------------------------------------
git_clean=false
git_status_lines=0
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  porcelain="$(git -C "$ROOT" status --porcelain 2>/dev/null || true)"
  if [ -z "$porcelain" ]; then
    git_clean=true
  else
    git_status_lines=$(printf '%s\n' "$porcelain" | grep -c . || true)
  fi
fi

# --- mp4_ok via ffprobe ----------------------------------------------------
mp4_ok="null"
mp4_meta="null"
if [ -f evidence/ceo-demo.mp4 ] && command -v ffprobe >/dev/null 2>&1; then
  ff_json="$(ffprobe -v error \
              -select_streams v:0 \
              -show_entries stream=width,height \
              -show_entries format=duration \
              -of json evidence/ceo-demo.mp4 2>/dev/null || echo '{}')"
  width=$(printf '%s' "$ff_json" | jq -r '.streams[0].width // 0')
  height=$(printf '%s' "$ff_json" | jq -r '.streams[0].height // 0')
  duration=$(printf '%s' "$ff_json" | jq -r '.format.duration // "0"')
  # bash floating compare via awk
  ok=$(awk -v d="$duration" -v w="$width" -v h="$height" \
       'BEGIN{ if (d+0 <= 90 && w+0 >= 1280 && h+0 >= 720) print "true"; else print "false" }')
  mp4_ok="$ok"
  mp4_meta=$(jq -nc --argjson w "$width" --argjson h "$height" --arg d "$duration" \
              '{width:$w, height:$h, duration:($d|tonumber? // 0)}')
fi

# --- assemble final JSON ---------------------------------------------------
failed_json='[]'
if [ "${#cjs_failed[@]}" -gt 0 ]; then
  failed_json="$(printf '%s\n' "${cjs_failed[@]}" | jq -Rsc 'split("\n") | map(select(length>0))')"
fi

jq -nc \
  --argjson rcs "$rule_card_schema_ok" \
  --argjson kb "$ceo_summary_kb" \
  --argjson bytes "$ceo_summary_bytes" \
  --argjson anch "$ceo_summary_anchors" \
  --argjson cjs "$cjs_node_check_ok" \
  --argjson gc "$git_clean" \
  --argjson gsl "$git_status_lines" \
  --argjson mp4 "$mp4_ok" \
  --argjson mp4m "$mp4_meta" \
  --argjson failed "$failed_json" \
  '{
    rule_card_schema_ok: $rcs,
    ceo_summary_kb: $kb,
    ceo_summary_bytes: $bytes,
    ceo_summary_anchors: $anch,
    cjs_node_check_ok: $cjs,
    cjs_failed: $failed,
    git_clean: $gc,
    git_status_lines: $gsl,
    mp4_ok: $mp4,
    mp4_meta: $mp4m,
    skipped: false
  }'

exit 0
