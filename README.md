<!--
   Alice session                rule store                  Bob session
   =============               ============                ============
   npm install moment   --->   rule-card.json   --->   PreToolUse hook
         |                          ^                          |
         v                          |                          v
    user correction  ---- Stop hook capture                 BLOCKED
         |                                                     |
         +-----------> proof console <-----------+             |
                            |                   |             |
                            v                   v             |
                    evidence/ceo-summary.html <--+-------------+
                            |
                            v
                            CEO
-->

# metrix-plugin

> Previous Claude Code made this mistake. New Claude Code tried to repeat it. TeamAgent blocked it.

A Claude Code plugin marketplace that captures user corrections in one session and prevents the same mistake from repeating in the next. Built on the [TeamBrain](https://github.com/libz-renlab-ai/TeamBrain) idea: short-term agent memory becomes durable team policy.

## What is in this repo

Three plugins, one marketplace catalog, one evidence directory, one judge harness.

| Plugin | Category | Job |
|---|---|---|
| `teamagent-memory` | memory | Capture corrections via Stop hook; block repeats via PreToolUse hook; inject rule context via UserPromptSubmit hook. |
| `teamagent-proof-console` | observability | Render `evidence/ceo-summary.html`, generate proof packets, audit feature evidence. |
| `teamagent-team-sync` | collaboration | Publish rules to the team, resolve cross-machine conflicts, promote project rules to team-wide rules. |

## Architecture

```
metrix-plugin/
  .claude-plugin/
    marketplace.json
  plugins/
    teamagent-memory/
      .claude-plugin/plugin.json
      skills/{capture-correction,explain-rule-hit,review-new-rules}/SKILL.md
      hooks/{hooks.json,pretooluse-enforce.cjs,stop-capture.cjs,userprompt-inject.cjs}
      bin/teamagent
      README.md
    teamagent-proof-console/
      .claude-plugin/plugin.json
      skills/{generate-proof-packet,audit-feature-evidence,ceo-proof-summary}/SKILL.md
      commands/proof.md
      README.md
    teamagent-team-sync/
      .claude-plugin/plugin.json
      skills/{publish-team-rule,resolve-rule-conflict,promote-project-rule}/SKILL.md
      hooks/{hooks.json,sessionstart-sync.cjs,userprompt-publish.cjs}
      README.md
  evidence/
    rule-card.json          # jq -e schema target
    ceo-summary.html        # 4 anchors + >= 2KB
    ceo-demo.mp4            # optional, ffprobe target (<= 90s, >= 1280x720)
  bin/judge.sh              # runs probes, emits judge.json
  probes/
    stream-json.sh          # claudefast --output-format stream-json
    ab-plugin-dir.sh        # A/B: /tmp/empty vs $PWD
    file-checks.sh          # jq -e + node --check + grep + wc -c + ffprobe
  README.md
  EVAL.md
```

## Demo storyline

1. Alice tries `npm install moment` in Claude Code.
2. User corrects Alice: do not use moment, use dayjs.
3. The `teamagent-memory` Stop hook captures the correction.
4. A rule-card is written with `trigger / wrong / correct / why / confidence`.
5. A new session opens. Bob, unaware, tries `npm install moment`.
6. The PreToolUse hook blocks the tool call before any package is installed.
7. The proof console records: saved 1 repeat mistake, rule confidence +1.
8. The CEO opens `evidence/ceo-summary.html` and sees transcript, rule-card, hook event, and before/after diff in one page.

## Install

In Claude Code, add the marketplace once, then install plugins individually.

```text
/plugin marketplace add LiuShiyuMath/metrix-plugin
/plugin install teamagent-memory@metrix-plugin
/plugin install teamagent-proof-console@metrix-plugin
/plugin install teamagent-team-sync@metrix-plugin
```

The hooks register themselves via each plugin's `hooks/hooks.json`. The rule store lives at `~/.teamagent/rules.jsonl`; the event log at `~/.teamagent/events.jsonl`.

## Evidence

The `evidence/` directory is the CEO-facing artifact set.

- `rule-card.json` is the canonical, schema-validated rule card.
- `ceo-summary.html` is a self-contained HTML proof page (no external assets).
- `ceo-demo.mp4` is an optional screen capture (<= 90s, >= 1280x720).

## Verify

The judge harness lives at `bin/judge.sh`. It runs four mechanical probes and emits a single `judge.json`. The final verdict is made by a separate `claudefast --plugin-dir /tmp/empty` process so the agent under test cannot grade its own homework.

```bash
bash bin/judge.sh
cat judge.json | claudefast --plugin-dir /tmp/empty
```

Probes:

- `probes/stream-json.sh` — captures runtime events via `claudefast --output-format stream-json`.
- `probes/ab-plugin-dir.sh` — runs the same prompt with `--plugin-dir /tmp/empty` and with `--plugin-dir $PWD` to prove the block is caused by the plugin.
- `probes/file-checks.sh` — runs `jq -e` on `rule-card.json`, `grep + wc -c` on `ceo-summary.html`, `node --check` on every `.cjs` hook, and `ffprobe` on `ceo-demo.mp4` if present.

See `EVAL.md` for the full verification contract.

## License

MIT.
