#!/usr/bin/env bash
# Real-machine 4-pane tmux demo: 3 coders + 1 CEO.
#
#   +-------------------------------+-------------------+
#   |                               |  Alice  (coder)   |
#   |   CEO                         +-------------------+
#   |   teamagent-proof-console     |  Bob    (coder)   |
#   |   interactive TUI (--demo)    +-------------------+
#   |                               |  Carol  (coder)   |
#   +-------------------------------+-------------------+
#
# Pane 0 (CEO)  runs the real proof-console TUI on a loop (auto-driven
#               navigation via --demo). It needs >= 100 cols / 32 rows,
#               so it gets the wide main-vertical pane.
# Panes 1-3     are three coder sandboxes, each with its own isolated
#               HOME / CLAUDE_HOME, running the teamagent-memory hooks:
#               Alice captures a correction into a rule card, team-sync
#               copies it to Bob/Carol, Bob's repeat mistake is DENIED,
#               Carol's corrected command is ALLOWED.
#
# Deterministic on purpose: no claudefast dependency, so the recording
# is reproducible. The TUI, hooks and rule store are all real code.
#
# Robustness: panes are addressed by tmux pane-id (%N), never by
# numeric index, so a user ~/.tmux.conf with base-index / pane-base-index
# cannot misroute send-keys. Every pane is a clean `bash --noprofile
# --norc` (no starship/zsh line editor mangling pasted commands).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${TEAMAGENT_WILD_BASE:-$(mktemp -d -t teamagent-ceo-XXXXXX)}"
SESSION="${TEAMAGENT_WILD_SESSION:-teamagent-ceo-$$}"
TUI="$ROOT/docs/proof-console-tui/proof-console-tui.mjs"
MEM="$ROOT/plugins/teamagent-memory"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 127
  }
}

need tmux
need node
need jq

# Panes run `bash --noprofile --norc`, so they do not inherit an nvm /
# Homebrew PATH. Resolve the real node dir now and push it into every
# pane so the hooks and the TUI can find node.
NODE_DIR="$(cd "$(dirname "$(command -v node)")" && pwd)"

tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
mkdir -p "$BASE"/{ceo,alice,bob,carol}

cleanup() {
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
  if [ "${TEAMAGENT_WILD_KEEP:-0}" != "1" ]; then
    rm -rf "$BASE"
  fi
}
trap cleanup EXIT

# Pane 0 (CEO main, wide). Capture its pane-id; the rest split off it.
P0="$(tmux new-session -d -P -F '#{pane_id}' -s "$SESSION" \
  -x 210 -y 50 "bash --noprofile --norc")"
tmux set-option -t "$SESSION" default-command "bash --noprofile --norc" >/dev/null
P1="$(tmux split-window -h -P -F '#{pane_id}' -t "$P0")"
P2="$(tmux split-window -v -P -F '#{pane_id}' -t "$P1")"
P3="$(tmux split-window -v -P -F '#{pane_id}' -t "$P1")"
tmux set-option -t "$SESSION" main-pane-width 150 >/dev/null
tmux select-layout -t "$P0" main-vertical >/dev/null
tmux set-option -t "$SESSION" status on >/dev/null
tmux set-option -t "$SESSION" status-left " 3 coders · teamagent-memory " >/dev/null
tmux set-option -t "$SESSION" status-right " CEO · teamagent-proof-console TUI " >/dev/null

send() {
  local pane="$1" cmd="$2"
  # -l sends the string literally so tmux does not re-parse embedded
  # tokens (Space/Enter/C-m/quotes) as key names and shred it into
  # one-char-per-line. Enter is sent as a separate explicit key.
  tmux send-keys -t "$pane" -l -- "$cmd"
  tmux send-keys -t "$pane" Enter
}

# Coder pane: isolated HOME/CLAUDE_HOME + teamagent-memory bin + node.
init_coder() {
  local pane="$1" role="$2" lower
  lower="$(printf '%s' "$role" | tr '[:upper:]' '[:lower:]')"
  send "$pane" "PS1='\$ '; clear; export ROOT='$ROOT'; export HOME='$BASE/$lower'; export CLAUDE_HOME='$BASE/$lower/.claude'; export PATH='$MEM/bin':'$NODE_DIR':\"\$PATH\"; mkdir -p \"\$HOME\" \"\$CLAUDE_HOME\"; echo '$role coder sandbox · teamagent-memory'; echo HOME=\$HOME"
}

# CEO pane: isolated HOME + node, then run the proof-console TUI loop.
init_ceo() {
  send "$P0" "PS1='\$ '; clear; export ROOT='$ROOT'; export HOME='$BASE/ceo'; export CLAUDE_HOME='$BASE/ceo/.claude'; export PATH='$NODE_DIR':\"\$PATH\"; mkdir -p \"\$HOME\" \"\$CLAUDE_HOME\"; cd \"\$ROOT\"; echo 'CEO sandbox · teamagent-proof-console'; echo HOME=\$HOME"
}

(
  sleep 2.5
  init_ceo
  sleep 0.4
  init_coder "$P1" "Alice"
  sleep 0.4
  init_coder "$P2" "Bob"
  sleep 0.4
  init_coder "$P3" "Carol"

  # CEO starts the real interactive TUI, looped so it keeps navigating
  # for the whole recording (each --demo cycle is ~8s, then restart).
  sleep 2.0
  send "$P0" "while :; do node \"$TUI\" --demo; sleep 1; clear; done"

  # Alice: a previous session was corrected (moment -> dayjs). The Stop
  # hook turns that correction into a durable rule card.
  sleep 2.5
  send "$P1" "printf '%s\n' '{\"type\":\"user\",\"content\":\"please add a date helper\"}' '{\"type\":\"assistant\",\"content\":\"sure, let me npm install moment\"}' '{\"type\":\"user\",\"content\":\"no, don'\"'\"'t use moment, use dayjs\"}' > \"\$HOME/alice-transcript.jsonl\""
  send "$P1" "printf '%s' '{\"hook_event_name\":\"Stop\",\"transcript_path\":\"'\"\$HOME\"'/alice-transcript.jsonl\",\"session_id\":\"alice-ceo-wild\"}' | node \"$MEM/hooks/stop-capture.cjs\"; echo '--- rule card captured ---'; teamagent list | jq -C ."

  # team-sync: Alice's rule card is published to Bob and Carol homes.
  sleep 4.0
  send "$P2" "for r in bob carol; do mkdir -p '$BASE/'\$r'/.teamagent'; cp '$BASE/alice/.teamagent/rules.jsonl' '$BASE/'\$r'/.teamagent/rules.jsonl'; done; echo 'team-sync: Alice rule -> Bob, Carol'"

  # Bob: new session tries the same mistake. PreToolUse DENIES it.
  sleep 3.0
  send "$P2" "printf '%s' '{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm install moment\"},\"session_id\":\"bob-ceo-wild\"}' | node \"$MEM/hooks/pretooluse-enforce.cjs\" | jq -C ."

  # Carol: the corrected command passes through (control case).
  sleep 4.0
  send "$P3" "printf '%s' '{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm install dayjs\"},\"session_id\":\"carol-ceo-wild\"}' | node \"$MEM/hooks/pretooluse-enforce.cjs\"; echo 'Carol: npm install dayjs ALLOWED (control)'"

  # Let the CEO TUI play a few more full navigation cycles on screen.
  sleep 26
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
) &

tmux attach-session -t "$SESSION"
