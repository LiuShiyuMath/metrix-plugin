#!/usr/bin/env bash
# Real-machine 4-pane tmux demo: 3 REAL interactive claude coders + 1 CEO
# rendering the REAL synced data those coders produce.
#
#   +-------------------------------+-------------------+
#   |                               |  Alice  (claude)  |
#   |   CEO                         +-------------------+
#   |   proof-console-tui           |  Bob    (claude)  |
#   |   --data <live synced>        +-------------------+
#   |                               |  Carol  (claude)  |
#   +-------------------------------+-------------------+
#
# Panes 1-3 are REAL interactive `claude` sessions (claudefast env:
# MiniMax cheap model, --dangerously-skip-permissions) each with its own
# isolated HOME/CLAUDE_HOME and a SHARED team store
# ($TEAMAGENT_TEAM_STORE), loading teamagent-memory + teamagent-team-sync.
#
#   Alice : real claude is corrected (moment -> dayjs); teamagent-memory
#           Stop hook captures the rule. Orchestrator publishes it into
#           the shared team store (the team-sync publish step).
#   Bob   : new real claude session; teamagent-team-sync SessionStart
#           pulls the synced rule; Bob's `npm install moment` attempt is
#           DENIED by the real PreToolUse hook.
#   Carol : real claude session; `npm install dayjs` passes (control).
#
# Pane 0 (CEO) loops the adapter (bin/teamagent-proof-adapter) over the
# REAL synced team store + the 3 coders' REAL events.jsonl, then renders
# proof-console-tui --data on it. As the coders work, the CEO console
# really shows it -- same synced truth, four views.
#
# Pane-id addressing + literal send-keys + clean bash, so base-index /
# starship cannot misroute or shred input.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${TEAMAGENT_WILD_BASE:-$(mktemp -d -t teamagent-synced-XXXXXX)}"
SESSION="${TEAMAGENT_WILD_SESSION:-teamagent-synced-$$}"
TUI="$ROOT/docs/proof-console-tui/proof-console-tui.mjs"
ADAPTER="$ROOT/bin/teamagent-proof-adapter"
MEM="$ROOT/plugins/teamagent-memory"
SYNC="$ROOT/plugins/teamagent-team-sync"
TEAM_STORE="$BASE/team/rules.jsonl"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 127; }; }
need tmux; need node; need jq; need claude

NODE_DIR="$(cd "$(dirname "$(command -v node)")" && pwd)"

# This committed script never hardcodes and never scrapes a key. It
# uses ONLY the MiniMax/Anthropic env already present in the shell the
# operator launches it from (e.g. run it from a shell where you have
# already run `claudefast` once, or that exports ANTHROPIC_API_KEY).
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Run this from a shell with the MiniMax env active (e.g. after \`claudefast\`)," >&2
  echo "or export ANTHROPIC_API_KEY first. This script will not read keys from disk." >&2
  exit 3
fi

tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
mkdir -p "$BASE"/{ceo,alice,bob,carol} "$BASE/team"
: > "$TEAM_STORE"

cleanup() {
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
  if [ "${TEAMAGENT_WILD_KEEP:-0}" != "1" ]; then rm -rf "$BASE"; fi
}
trap cleanup EXIT

# claudefast env replica (MiniMax cheap model) for the coder panes.
# ANTHROPIC_API_KEY is INHERITED from the launching shell (tmux panes
# inherit the server env). This string only sets the non-secret MiniMax
# routing vars — no credential is ever written here.
CF_ENV="export ANTHROPIC_BASE_URL='https://api.minimaxi.com/anthropic'; export ANTHROPIC_DEFAULT_HAIKU_MODEL='MiniMax-M2.7-highspeed'; export ANTHROPIC_DEFAULT_SONNET_MODEL='MiniMax-M2.7-highspeed'; export ANTHROPIC_DEFAULT_OPUS_MODEL='MiniMax-M2.7-highspeed'; export ANTHROPIC_MODEL='MiniMax-M2.7-highspeed'; export API_TIMEOUT_MS='3000000'; export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1'; export INSIGHTS_CAPTURE_DISABLED='1'"

P0="$(tmux new-session -d -P -F '#{pane_id}' -s "$SESSION" -x 220 -y 52 "bash --noprofile --norc")"
tmux set-option -t "$SESSION" default-command "bash --noprofile --norc" >/dev/null
P1="$(tmux split-window -h -P -F '#{pane_id}' -t "$P0")"
P2="$(tmux split-window -v -P -F '#{pane_id}' -t "$P1")"
P3="$(tmux split-window -v -P -F '#{pane_id}' -t "$P1")"
tmux set-option -t "$SESSION" main-pane-width 156 >/dev/null
tmux select-layout -t "$P0" main-vertical >/dev/null
tmux set-option -t "$SESSION" status on >/dev/null
tmux set-option -t "$SESSION" status-left " 3 real claude coders · memory+team-sync " >/dev/null
tmux set-option -t "$SESSION" status-right " CEO · proof-console (live synced) " >/dev/null

send() {
  tmux send-keys -t "$1" -l -- "$2"
  tmux send-keys -t "$1" Enter
}

# Launch a real interactive claude coder: isolated HOME, shared team
# store, both plugins loaded.
launch_coder() {
  local pane="$1" lower="$2"
  # Pre-seed the theme + onboarding markers so claude's first-run
  # "Choose the text style" picker never appears (that picker ate the
  # task prompt in the prior run). claude reads ~/.claude/settings.json.
  send "$pane" "PS1='\$ '; clear; export HOME='$BASE/$lower'; export CLAUDE_HOME='$BASE/$lower/.claude'; export PATH='$NODE_DIR':\"\$PATH\"; export TEAMAGENT_TEAM_STORE='$TEAM_STORE'; mkdir -p \"\$HOME\" \"\$CLAUDE_HOME\"; printf '%s' '{\"theme\":\"dark\"}' > \"\$CLAUDE_HOME/settings.json\"; printf '%s' '{\"hasCompletedOnboarding\":true,\"theme\":\"dark\"}' > \"\$HOME/.claude.json\"; $CF_ENV; cd '$ROOT'; echo '$lower : real interactive claude · memory+team-sync'"
  sleep 1.0
  send "$pane" "claude --dangerously-skip-permissions --add-dir '$ROOT' --plugin-dir '$MEM' --plugin-dir '$SYNC'"
}

(
  sleep 1.5
  # CEO: live loop over the REAL synced store + REAL coder events.
  send "$P0" "PS1='\$ '; clear; export PATH='$NODE_DIR':\"\$PATH\"; cd '$ROOT'; echo 'CEO : proof-console rendering the live synced team store'; while :; do node '$ADAPTER' --team-store '$TEAM_STORE' --coder Alice='$BASE/alice' --coder Bob='$BASE/bob' --coder Carol='$BASE/carol' --out '$BASE/live.json' >/dev/null 2>&1; node '$TUI' --data '$BASE/live.json' --demo; sleep 1; clear; done"

  # --- Alice: real claude, gets corrected; Stop hook captures rule ---
  launch_coder "$P1" alice
  sleep 22                              # boot + connectivity check
  tmux send-keys -t "$P1" Enter         # clear any residual "press enter"
  sleep 2
  send "$P1" "Add a tiny date-format helper to a new file scratch/date.js. Important correction: don't use moment, use dayjs. Keep it to a few lines."
  sleep 75   # real model turn + Stop-hook capture

  # team-sync publish: push Alice's captured rule into the shared store.
  if [ -s "$BASE/alice/.teamagent/rules.jsonl" ]; then
    cat "$BASE/alice/.teamagent/rules.jsonl" >> "$TEAM_STORE"
    echo "[orchestrator] published Alice rule -> team store" >&2
  fi
  sleep 2

  # --- Bob: real claude; SessionStart sync pulls rule; repeat DENIED ---
  launch_coder "$P2" bob
  sleep 20   # boot + teamagent-team-sync SessionStart pull
  tmux send-keys -t "$P2" Enter
  sleep 2
  send "$P2" "Run exactly this in bash, nothing else: npm install moment"
  sleep 65

  # --- Carol: real claude; corrected command passes (control) ---
  launch_coder "$P3" carol
  sleep 20
  tmux send-keys -t "$P3" Enter
  sleep 2
  send "$P3" "Run exactly this in bash, nothing else: npm install dayjs"
  sleep 55

  # Let the CEO console play a few cycles over the now-synced data.
  sleep 26
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
) &

tmux attach-session -t "$SESSION"
