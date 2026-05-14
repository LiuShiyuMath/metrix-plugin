#!/usr/bin/env bash
# demo/teamagent-demo.sh
#
# Deterministic end-to-end demo of the metrix-plugin marketplace.
# Drives the actual hook .cjs files with synthetic Claude Code events,
# under an isolated HOME so the developer's real rule store is untouched.
#
# Flow (eight steps from TASK.md):
#   1. Alice session opens
#   2. Alice corrects Claude: "don't use moment, use dayjs"
#   3. Stop hook captures -> rule card written
#   4. New session: Bob asks Claude to run npm install moment
#   5. PreToolUse hook denies, citing Alice's rule
#   6. UserPromptSubmit hook would also have warned -> shown next
#   7. /proof packet: evidence/ceo-summary.html (4 anchors verbatim)
#   8. CEO sees the evidence + judge harness verdict
#
# Designed for asciinema recording, ~50-60 seconds wall time.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_HOME="$(mktemp -d -t teamagent-demo-XXXXXX)"
trap 'rm -rf "$DEMO_HOME"' EXIT
export HOME="$DEMO_HOME"

# ---------------------- colors --------------------------
B=$'\e[1m'; R=$'\e[0m'
DUCK=$'\e[38;5;220m'         # duck yellow
POND=$'\e[38;5;75m'          # pond blue
RED=$'\e[38;5;203m'
GRN=$'\e[38;5;78m'
DIM=$'\e[2m'

banner() {
  local title="$1" sub="$2"
  printf '\n'
  printf '%s\n' "${DUCK}╔══════════════════════════════════════════════════════════════════════════════╗${R}"
  printf '%s║%s %-76s %s║%s\n' "${DUCK}" "${R}${B}" "$title" "${DUCK}" "${R}"
  printf '%s║%s %-76s %s║%s\n' "${DUCK}" "${R}${DIM}" "$sub" "${DUCK}" "${R}"
  printf '%s\n' "${DUCK}╚══════════════════════════════════════════════════════════════════════════════╝${R}"
}

step() {
  printf '\n%s>>%s %s\n' "${POND}" "${R}" "$1"
}

pause() { sleep "${1:-1.2}"; }

# ---------------------- 0 splash ------------------------
clear
cat <<'EOF'
                     __
                 ___( o)>          metrix-plugin
                 \ <_. )           TeamAgent live demo
                  `---'            (real hooks, isolated HOME)
EOF
pause 1.4

# ---------------------- 1 + 2 Alice ---------------------
banner "Scene 1 — Alice teaches Claude" "Session 1, Mac of Alice"
pause 0.6
step "Alice tells Claude:"
printf '   %s%s%s\n' "${B}" "don't use moment, use dayjs because moment is in maintenance mode" "${R}"
pause 1.4

# Build a synthetic transcript file the Stop hook will read.
TRANSCRIPT="$DEMO_HOME/alice-transcript.jsonl"
cat > "$TRANSCRIPT" <<'TXT'
{"type":"user","content":"please add a date helper"}
{"type":"assistant","content":"sure, let me npm install moment"}
{"type":"user","content":"no, don't use moment, use dayjs"}
TXT

step "Stop hook fires on session end..."
pause 0.6
EVENT='{"hook_event_name":"Stop","transcript_path":"'"$TRANSCRIPT"'","session_id":"alice-demo"}'
printf '%s' "$EVENT" | node "$ROOT/plugins/teamagent-memory/hooks/stop-capture.cjs" >/dev/null 2>&1 || true
pause 0.5

step "Rule store after capture:  ${DIM}~/.teamagent/rules.jsonl${R}"
if [ -f "$DEMO_HOME/.teamagent/rules.jsonl" ]; then
  printf '%s' "${GRN}"
  jq -C '{id, trigger:.trigger.pattern, wrong:.wrong, correct:.correct, confidence}' \
    "$DEMO_HOME/.teamagent/rules.jsonl" 2>/dev/null || cat "$DEMO_HOME/.teamagent/rules.jsonl"
  printf '%s' "${R}"
else
  printf '%s(no rule captured — pattern miss)%s\n' "${RED}" "${R}"
fi
pause 2.0

# ---------------------- 3 Bob ---------------------------
banner "Scene 2 — Bob tries the same mistake" "Session 2, three days later, fresh Claude"
pause 0.6
step "Bob asks Claude:"
printf '   %s%s%s\n' "${B}" "claude, run: npm install moment" "${R}"
pause 1.2

step "Claude is about to execute. PreToolUse hook intercepts..."
pause 0.6
PRE_EVENT='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm install moment"},"session_id":"bob-demo"}'
DECISION="$(printf '%s' "$PRE_EVENT" | node "$ROOT/plugins/teamagent-memory/hooks/pretooluse-enforce.cjs" 2>/dev/null)"

if echo "$DECISION" | grep -q '"permissionDecision":"deny"'; then
  printf '%s   BLOCKED%s\n' "${RED}${B}" "${R}"
  printf '%s' "${RED}"
  echo "$DECISION" | jq -C '.hookSpecificOutput | {decision: .permissionDecision, reason: .permissionDecisionReason}'
  printf '%s' "${R}"
else
  printf '%s   (no block emitted)%s\n' "${RED}" "${R}"
fi
pause 2.4

# ---------------------- 4 UserPromptSubmit -------------
banner "Scene 3 — Same plugin warns earlier too" "UserPromptSubmit hook, before Claude even starts"
pause 0.4
step "If Bob's prompt mentions a risky keyword, hook injects context:"
USERPROMPT='{"hook_event_name":"UserPromptSubmit","prompt":"please install moment for date parsing"}'
CTX="$(printf '%s' "$USERPROMPT" | node "$ROOT/plugins/teamagent-memory/hooks/userprompt-inject.cjs" 2>/dev/null)"
printf '%s' "${POND}"
echo "$CTX" | jq -C '.hookSpecificOutput.additionalContext // "(silent)"'
printf '%s' "${R}"
pause 2.0

# ---------------------- 5 Proof packet ------------------
banner "Scene 4 — CEO proof packet" "evidence/ rendered by teamagent-proof-console"
pause 0.4

step "Evidence files in the marketplace:"
ls -la "$ROOT/evidence" | tail -n +2 | head -5
pause 1.6

step "CEO summary — 4 anchor strings (hard contract):"
for anchor in "Previous Claude Code made this mistake" "TeamAgent blocked it" "rule-card" "before/after"; do
  count="$(grep -c -F "$anchor" "$ROOT/evidence/ceo-summary.html" 2>/dev/null || echo 0)"
  if [ "$count" -gt 0 ]; then
    printf '   %sOK%s  %-50s  hits: %s\n' "${GRN}" "${R}" "$anchor" "$count"
  else
    printf '   %sMISS%s %-50s\n' "${RED}" "${R}" "$anchor"
  fi
done
pause 2.4

step "HTML size:"
size="$(wc -c < "$ROOT/evidence/ceo-summary.html")"
printf '   %sbytes:%s %s   (gate: >= 2048)\n' "${B}" "${R}" "$size"
pause 1.2

# ---------------------- 6 Judge verdict -----------------
banner "Scene 5 — Third-party judge verdict" "bin/judge.sh — bash + jq + node --check + ffprobe"
pause 0.4
step "Running probes (no LLM, no self-eval)..."
( cd "$ROOT" && bash bin/judge.sh ) 2>&1 | grep -E '^(PASS|FAIL)' || true
pause 0.5
( cd "$ROOT" && jq -r '"verdict.all_passed = \(.verdict.all_passed)   probes: " + (.probes | map(.name + "/" + (if .passed then "PASS" else "FAIL" end)) | join(", "))' judge.json ) 2>/dev/null || true
pause 2.4

# ---------------------- 7 Outro -------------------------
banner "Done" "metrix-plugin · github.com/LiuShiyuMath/metrix-plugin"
cat <<EOF

  ${DUCK}__${R}
${DUCK} ___( o)>${R}   Previous Claude Code made this mistake.
${DUCK} \\ <_. )${R}    New Claude Code tried to repeat it.
${DUCK}  \`---'${R}     TeamAgent blocked it.

EOF
pause 1.6
