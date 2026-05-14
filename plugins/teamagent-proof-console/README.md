```
  ┌──────────────────────────────────────────────────────────────┐
  │  teamagent-proof-console                                     │
  │                                                              │
  │   rules.jsonl   ──┐                                          │
  │                   ├─► /proof ──► evidence/                   │
  │   events.jsonl ──┘              ├─ rule-card.json (jq -e)    │
  │                                 ├─ ceo-summary.html (>= 2KB) │
  │                                 └─ ceo-demo.mp4 (optional)   │
  └──────────────────────────────────────────────────────────────┘
```

# teamagent-proof-console

Plugin for the `teamagent-marketplace`. Builds the demo artifact set
that proves a TeamAgent rule blocked a repeat mistake: a JSON rule card,
a CEO-ready HTML one-pager, and an optional 90-second video stub.

Tagline: **Previous Claude Code made this mistake. New Claude Code tried
to repeat it. TeamAgent blocked it.**

## What

Three skills and one slash command:

- `skills/generate-proof-packet` — picks one rule with at least one
  blocked event, writes `evidence/rule-card.json` and
  `evidence/ceo-summary.html`.
- `skills/audit-feature-evidence` — verifies the packet against the
  upstream rule store and event log; emits a pass/fail verdict.
- `skills/ceo-proof-summary` — renders the final HTML page and prints a
  `<=90s` narration plan.
- `commands/proof.md` — `/teamagent-proof-console:proof` chains the
  three skills in order with a hard halt on audit failure.

## Why

The marketplace verdict pipeline (see top-level `EVAL.md`) judges this
plugin by checking real artifacts, not by self-evaluation:

- `jq -e` validates the rule-card schema.
- `grep + wc -c` validates four anchor strings and a 2KB floor on the
  HTML page.
- `ffprobe` validates the optional mp4 (<= 90s, >= 1280x720).
- `claudefast --plugin-dir /tmp/empty` runs the verdict in mechanical
  isolation from the plugin under test.

The four anchor strings the HTML page must contain verbatim — and which
are called out in `skills/generate-proof-packet/SKILL.md`:

1. `Previous Claude Code made this mistake`
2. `TeamAgent blocked it`
3. `rule-card`
4. `before/after`

## Install

This plugin ships as part of the `teamagent-marketplace`. Install via the
marketplace manifest at the worktree root
(`.claude-plugin/marketplace.json`). Once enabled, the slash command
`/teamagent-proof-console:proof` becomes available in Claude Code
sessions that include this plugin.

Manual install (development):

```sh
claude --plugin-dir "$(pwd)"
```

## Inputs

- `${HOME}/.teamagent/rules.jsonl` — one JSON rule per line. Produced
  upstream by the `teamagent-memory` plugin Stop hook.
- `${HOME}/.teamagent/events.jsonl` — append-only audit trail. Each line
  is `{event, rule_id, session_id, timestamp, decision}`.

These two files are READ-ONLY from this plugin. No skill in this plugin
mutates them.

## Output contract

Written under `evidence/` at the workspace root:

| Path                         | Required | Validated by                             |
| ---------------------------- | -------- | ---------------------------------------- |
| `evidence/rule-card.json`    | yes      | `jq -e` schema check                      |
| `evidence/ceo-summary.html`  | yes      | `grep` for 4 anchors + `wc -c >= 2048`    |
| `evidence/ceo-demo.mp4`      | optional | `ffprobe` (<= 90s, >= 1280x720)           |

The HTML page is self-contained: inline CSS, no JavaScript, no remote
assets. Width capped at 960px so it screenshots cleanly.

## How it satisfies EVAL.md

- `evidence/rule-card.json` passes the `jq -e` schema gate spelled out in
  `generate-proof-packet/SKILL.md` (id, trigger.tool, trigger.pattern,
  wrong, correct, why, confidence as number, captured_at, session_origin,
  evidence.transcript_path, evidence.hook_event_id).
- `evidence/ceo-summary.html` passes `grep + wc -c` because the renderer
  in `ceo-proof-summary/SKILL.md` embeds the four anchors verbatim and
  pads narrative until the byte count clears 2048.
- `evidence/ceo-demo.mp4` is optional. When the human operator records
  it using the narration plan, ffprobe sees a duration <= 90s and
  resolution >= 1280x720.
- The slash command halts on `audit-feature-evidence` verdict `fail`, so
  the verdict pipeline cannot greenlight a drifted or low-confidence
  packet.
- The plugin contains no `.cjs` of its own (only the marketplace's
  other plugins do); `node --check` therefore passes trivially for
  files under this tree.

## Failure modes (surfaced through the slash command)

- No rules captured yet -> `no rules.jsonl at ~/.teamagent`.
- Rule store present but no block/warn events -> `no blocked events yet;
  nothing to prove`.
- Audit drift (upstream rule edited since capture) -> verdict `fail`,
  chain halts before HTML render.
- HTML render under 2KB -> exit 1, asks the operator to add real
  narrative content.

## Hard rules (per AGENTS.md and BRIEF.md)

- All `*.md` start with ASCII art, < 200 lines, no emojis.
- No fabricated rules, events, transcripts, or hook event ids.
- No synthetic `ceo-demo.mp4` — recording is manual on purpose.
- Slash command lives at namespace `/teamagent-proof-console:proof`.

## See also

- `../teamagent-memory/` — captures corrections, writes the rule store.
- `../teamagent-team-sync/` — publishes rules between teammates.
- Top-level `EVAL.md` — verdict pipeline this plugin must clear.
- Top-level `BRIEF.md` — full architecture and demo story.
