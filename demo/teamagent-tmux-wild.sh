#!/usr/bin/env bash
# Real-machine 4-pane tmux demo for TeamAgent.
# Pane 0 is the Leader frontend dashboard; panes 1-3 are real teammate
# claudefast instances with separate HOME and CLAUDE_HOME sandboxes.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${TEAMAGENT_WILD_BASE:-$(mktemp -d -t teamagent-wild-XXXXXX)}"
SESSION="${TEAMAGENT_WILD_SESSION:-teamagent-wild-$$}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 127
  }
}

need tmux
need claudefast
need node
need jq

tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
mkdir -p "$BASE"/{leader,alice,bob,carol}

cleanup() {
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
  if [ "${TEAMAGENT_WILD_KEEP:-0}" != "1" ]; then
    rm -rf "$BASE"
  fi
}
trap cleanup EXIT

send() {
  local pane="$1"
  local cmd="$2"
  tmux send-keys -t "$SESSION:0.$pane" "$cmd" C-m
}

init_pane() {
  local pane="$1" role="$2"
  local lower
  lower="$(printf '%s' "$role" | tr '[:upper:]' '[:lower:]')"
  send "$pane" "clear; export ROOT='$ROOT'; export HOME='$BASE/$lower'; export CLAUDE_HOME='$BASE/$lower/.claude'; export PATH='$ROOT/plugins/teamagent-memory/bin':\"\$PATH\"; mkdir -p \"\$HOME\" \"\$CLAUDE_HOME\"; echo '$role sandbox connected'; echo HOME=\$HOME; echo CLAUDE_HOME=\$CLAUDE_HOME"
}

tmux new-session -d -s "$SESSION" -x 132 -y 38 "bash --noprofile --norc"
tmux split-window -h -t "$SESSION:0"
tmux split-window -v -t "$SESSION:0.0"
tmux split-window -v -t "$SESSION:0.1"
tmux select-layout -t "$SESSION:0" tiled >/dev/null
tmux set-option -t "$SESSION" status on >/dev/null
tmux set-option -t "$SESSION" status-left " TeamAgent wild tmux " >/dev/null
tmux set-option -t "$SESSION" status-right " Leader/Alice/Bob/Carol " >/dev/null

(
  sleep 0.8
  init_pane 0 "Leader"
  init_pane 1 "Alice"
  init_pane 2 "Bob"
  init_pane 3 "Carol"

  sleep 1.6
  send 0 "while :; do clear; echo 'Leader Frontend Dashboard'; echo 'real machine: tmux + claudefast + isolated HOME/CLAUDE_HOME'; echo 'base: $BASE'; date '+%H:%M:%S'; echo; for r in alice bob carol; do echo === teammate:\ \$r ===; if [ -s '$BASE/'\$r'/.teamagent/rules.jsonl' ]; then tail -n 2 '$BASE/'\$r'/.teamagent/rules.jsonl' | jq -C .; else echo '(no rules)'; fi; if [ -s '$BASE/'\$r'/.teamagent/events.jsonl' ]; then tail -n 3 '$BASE/'\$r'/.teamagent/events.jsonl' | jq -C .; fi; echo; done; sleep 2; done"

  sleep 1.0
  send 1 "claudefast -p 'reply exactly ALICE_READY'"
  send 2 "claudefast -p 'reply exactly BOB_READY'"
  send 3 "claudefast -p 'reply exactly CAROL_READY'"

  sleep 18
  send 1 "printf '%s\n' '{\"type\":\"user\",\"content\":\"please add a date helper\"}' '{\"type\":\"assistant\",\"content\":\"sure, let me npm install moment\"}' '{\"type\":\"user\",\"content\":\"no, don'\"'\"'t use moment, use dayjs\"}' > \"\$HOME/alice-transcript.jsonl\""
  send 1 "printf '%s' '{\"hook_event_name\":\"Stop\",\"transcript_path\":\"'\"\$HOME\"'/alice-transcript.jsonl\",\"session_id\":\"alice-wild\"}' | node \"\$ROOT/plugins/teamagent-memory/hooks/stop-capture.cjs\"; teamagent list | jq -C ."

  sleep 3
  send 1 "for r in bob carol; do mkdir -p '$BASE/'\$r'/.teamagent'; cp \"\$HOME/.teamagent/rules.jsonl\" '$BASE/'\$r'/.teamagent/rules.jsonl'; done; echo 'team sync copied Alice rule to Bob/Carol homes'"

  sleep 3
  send 2 "printf '%s' '{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm install moment\"},\"session_id\":\"bob-wild\"}' | node \"\$ROOT/plugins/teamagent-memory/hooks/pretooluse-enforce.cjs\" | jq -C ."

  sleep 3
  send 3 "printf '%s' '{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm install dayjs\"},\"session_id\":\"carol-wild\"}' | node \"\$ROOT/plugins/teamagent-memory/hooks/pretooluse-enforce.cjs\"; echo 'Carol dayjs path passed'"

  sleep 5
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
) &

tmux attach-session -t "$SESSION"
