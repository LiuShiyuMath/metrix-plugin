```
 ____                 __    ______                      __
/ __ \_______  ____  / /_  / ____/___  ____  _________  / /__
/ /_/ / ___/ / / / / __ \/ /   / __ \/ __ \/ ___/ __ \/ / _ \
/ ____/ /  / /_/ / / /_/ / /___/ /_/ / / / (__  ) /_/ / /  __/
/_/   /_/   \__,_/_/_.___/\____/\____/_/ /_/____/\____/_/\___/
```

# Proof Console TUI Prototype

This is a terminal-first prototype for feature 02 usage analysis. It is
not the old fixed CEO HTML summary.

The console answers one question:

> What did three Claude Code users ask for in UserSubmitPrompt, and
> which merged PRs in three repos prove the behavior?

## Run

```sh
node docs/proof-console-tui/proof-console-tui.mjs
```

Keys:

- `up/down` or `j/k` move within the active pane.
- `tab` switches between users and prompts.
- `enter` opens prompt detail.
- `m` cycles the analysis pane through report, dive, and map modes.
- `f` cycles repo filters.
- `h` toggles help.
- `q` exits.

## Record

```sh
asciinema rec docs/proof-console-tui/proof-console-tui.cast \
  --window-size 130x38 \
  --title "Proof Console TUI feature-02 prototype" \
  --idle-time-limit 1.2 \
  --command "tmux new-session -x 130 -y 38 -A -s proof-console-tui 'node docs/proof-console-tui/proof-console-tui.mjs --demo'" \
  --overwrite
```

The current walkthrough also includes `proof-console-tui.gif`, rendered from
the cast with `agg`, and `proof-console-tui-transcript.txt`, captured from
real tmux panes at each navigation step.

## Data Contract

Replace `sample-data.json` with exported rows from the real pipeline:

- `users[].prompts[]` are UserSubmitPrompt-derived usage records.
- `prompts[].linked_prs[]` references `prs[].id`.
- `prs[]` contains only merged PR evidence.

The console should not claim proof when no merged PR row exists.

## Prototype Shape

- Report mode summarizes 3 Claude Code users, UserSubmitPrompt rows,
  merged PR evidence, and repo coverage.
- Dive mode follows one prompt from raw ask to intent, signals, and
  linked merged PRs.
- Map mode pivots across repos and signal clusters.

## HTML

`--html <path>` writes a static design preview only. It is not the
reporting surface.
