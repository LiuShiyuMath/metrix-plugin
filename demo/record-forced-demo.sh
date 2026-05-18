#!/usr/bin/env bash
# demo/record-forced-demo.sh
#
# Records the FORCED workflow gate being enforced through the REAL,
# interactive Claude Code CLI (claudefast) running inside a live tmux
# session — not bash poking the gate directly. A "typist" injects the
# same commands a human would with `tmux send-keys`; a background poller
# turns `tmux capture-pane -e -p` into an asciicast v2 stream; `agg`
# renders the GIF. The .cast + .gif are committed as evidence.
#
# Why not `asciinema rec -c "tmux attach"`: in a TTY-less background job
# the foreground tmux client silently exits. The detached-session +
# capture-pane poll path is the one that survives — same lesson as the
# repo's other tmux demo.
#
# Isolation: the real $HOME is kept (overriding HOME makes headless
# claudefast hang with no TTY). The workflow state + forced flag are
# redirected to a temp dir via TEAMAGENT_WORKFLOW_FILE /
# TEAMAGENT_FORCED_FLAG — both honoured by workflow-gate.sh and
# workflow-forced.sh — so ~/.teamagent is never touched.
#
# Output:
#   demo/forced-demo.cast   asciicast v2 (raw evidence)
#   demo/forced-demo.gif    rendered GIF (embedded in the talk-html page)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN="$ROOT/plugins/teamagent-workflow"
ISSUE="${DEMO_ISSUE:-https://github.com/LiuShiyuMath/metrix-plugin/issues/2}"

OUT_CAST="$SCRIPT_DIR/forced-demo.cast"
OUT_GIF="$SCRIPT_DIR/forced-demo.gif"

COLS=100; ROWS=30
WORK="$(mktemp -d -t wfdemo-XXXXXX)"
SOCK="$WORK/t.sock"
SESSION="forced"
export TEAMAGENT_WORKFLOW_FILE="$WORK/workflow.jsonl"
export TEAMAGENT_FORCED_FLAG="$WORK/forced.enabled"
: > "$TEAMAGENT_WORKFLOW_FILE"

TMUX() { tmux -S "$SOCK" "$@"; }

cleanup() {
  [ -n "${POLL_PID:-}" ] && kill "$POLL_PID" 2>/dev/null || true
  TMUX kill-server 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

for need in tmux agg jq zsh perl; do
  command -v "$need" >/dev/null 2>&1 || { echo "missing: $need" >&2; exit 127; }
done

# ---- start a real interactive zsh pane (claudefast is a zsh function) -----
TMUX new-session -d -s "$SESSION" -x "$COLS" -y "$ROWS" "zsh -i"
TMUX set-option -t "$SESSION" status on >/dev/null
TMUX set-option -t "$SESSION" status-left  " teamagent-workflow FORCED " >/dev/null
TMUX set-option -t "$SESSION" status-right " real tmux + interactive claude CLI " >/dev/null
sleep 2

send() { TMUX send-keys -t "$SESSION" "$1" C-m; }

# ---- background asciicast v2 synthesiser ----------------------------------
# One output event per *changed* screen: clear + home + full screen. agg
# holds the last frame during the gaps, so model-thinking pauses render
# naturally and the cast stays small (identical screens are skipped).
START="$(date +%s)"
printf '{"version":2,"width":%d,"height":%d,"timestamp":%d,"env":{"SHELL":"/bin/zsh","TERM":"xterm-256color"}}\n' \
  "$COLS" "$ROWS" "$START" > "$OUT_CAST"

poller() {
  local prev="" cur t
  while :; do
    cur="$(tmux -S "$SOCK" capture-pane -e -p -t "$SESSION" 2>/dev/null || true)"
    if [ "$cur" != "$prev" ] && [ -n "$cur" ]; then
      t="$(perl -e 'printf "%.3f", time - $ARGV[0]' "$START" 2>/dev/null || echo 0)"
      printf '%s' "$cur" | jq -Rsc --argjson t "$t" \
        '[$t,"o",("[H[2J[3J" + . + "\r\n")]' >> "$OUT_CAST"
      prev="$cur"
    fi
    sleep 0.5
  done
}
poller & POLL_PID=$!

# ---- the typist: one claudefast turn per beat -----------------------------
# Each beat is a real interactive `claudefast --plugin-dir` invocation
# typed into the pane like a person. Block until a per-beat sentinel is
# printed (or a hard timeout), then move on.
#
# Completion is detected by a per-beat RC FILE in $WORK (never on the
# pane), so the sentinel can't pollute screen-grep and beats can't
# race/overlap. The typed line stays short — the long Chinese prompt is
# read from a file by the pane's own zsh — so send-keys never garbles.
BEATS="$WORK/beats"; mkdir -p "$BEATS"

beat() {
  local n="$1" label="$2" prompt="$3" max="${4:-240}"
  local bf="$BEATS/b${n}.prompt" rc="$BEATS/b${n}.rc"
  printf '%s' "$prompt" > "$bf"
  rm -f "$rc"
  send "clear; printf '\\n  == Beat ${n} : ${label} ==\\n\\n'"
  sleep 2
  if [ "${DEMO_FAKE:-0}" = "1" ]; then
    send "echo \"[fake beat ${n}] ${label}\"; sleep 1; echo \$? > '$rc'"
  else
    # pane's zsh expands \$(cat bf) and \$? ; output streams to the
    # pane (recorded); the rc file appears only after claudefast exits.
    send "claudefast --plugin-dir '$PLUGIN' -p \"\$(cat '$bf')\" ; echo \$? > '$rc'"
  fi
  local waited=0
  while [ ! -f "$rc" ] && [ "$waited" -lt "$max" ]; do
    sleep 3; waited=$((waited+3))
  done
  sleep 4
}

ISO="本次为隔离演示：workflow 状态文件就是环境变量 \$TEAMAGENT_WORKFLOW_FILE，forced flag 就是 \$TEAMAGENT_FORCED_FLAG，一切读写都用它们、绝不用 ~/.teamagent。"

send "clear; echo '== teamagent-workflow FORCED demo : real interactive Claude CLI in tmux =='"
sleep 1
send "echo \"issue: $ISSUE\"; echo \"state file: \$TEAMAGENT_WORKFLOW_FILE\""
sleep 2

beat 1 "enable forced workflow" \
  "运行命令 /teamagent-workflow:workflow-enable on 开启强制流程，用一句话报告结果。" 180

beat 2 "claim then JUMP to proof -> BLOCKED" \
  "${ISO}我要对 issue ${ISSUE} 直接做 Stage 4 proof（证据 https://example.com/p）。按 workflow-proof-comment 要求先跑 bin/workflow-gate.sh；若 allowed:false 就把 reason 一字不差打印并停止，绝不发 gh pr comment。" 240

beat 3 "Stage 1 claim -> ALLOWED" \
  "${ISO}对 issue ${ISSUE} 执行 Stage 1 claim：先跑 bin/workflow-gate.sh '<issue>' claimed，仅当 allowed:true 才用 jq -nc 追加一行 {ts,issue_url,stage:claimed,actor} 到 \$TEAMAGENT_WORKFLOW_FILE，并打印门禁 reason。" 240

beat 4 "Stage 2 grill -> ALLOWED" \
  "${ISO}对 issue ${ISSUE} 执行 Stage 2 grill：先跑 bin/workflow-gate.sh '<issue>' grilled，仅当 allowed:true 才追加 stage=grilled 行到 \$TEAMAGENT_WORKFLOW_FILE，打印门禁 reason。" 240

beat 5 "Stage 3 handoff -> ALLOWED" \
  "${ISO}对 issue ${ISSUE} 执行 Stage 3 handoff：先跑 bin/workflow-gate.sh '<issue>' handoff，仅当 allowed:true 才追加 stage=handoff 行到 \$TEAMAGENT_WORKFLOW_FILE，打印门禁 reason。" 240

beat 6 "Stage 4 proof -> NOW ALLOWED" \
  "${ISO}现在 issue ${ISSUE} 已到 handoff，执行 Stage 4 proof：跑 bin/workflow-gate.sh '<issue>' proof，这次应当 allowed:true，打印门禁 reason（顺序走完后这道门才放行）。" 240

send "clear; echo '== state file (append-only, what the gate reads) =='; cat \$TEAMAGENT_WORKFLOW_FILE | jq -c '{stage,issue_url}'"
sleep 5
send "echo; echo '== demo complete: skip was BLOCKED, the ordered path was ALLOWED =='"
sleep 4

kill "$POLL_PID" 2>/dev/null || true; POLL_PID=""
TMUX kill-server 2>/dev/null || true

# ---- render GIF -----------------------------------------------------------
echo "cast lines: $(wc -l < "$OUT_CAST")"
agg --cols "$COLS" --rows "$ROWS" --speed 1.6 --fps-cap 10 \
    --theme asciinema "$OUT_CAST" "$OUT_GIF" 2>&1 | tail -2 || {
  echo "agg failed" >&2; exit 1; }

ls -la "$OUT_CAST" "$OUT_GIF"
echo "FINAL_STATE:"; cat "$TEAMAGENT_WORKFLOW_FILE" 2>/dev/null | jq -c '{stage,issue_url}' || true
echo "RECORD_DONE"
