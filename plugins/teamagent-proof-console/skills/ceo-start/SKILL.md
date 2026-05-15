---
name: ceo-start
description: Use as the CEO-facing entrance to the TeamAgent proof workflow. Run this when the user (or CEO) says "ceo-start", "demo this to my CEO", "run the proof workflow", "show the CEO console", "kick off ceo-start", "我要给 CEO 看", "CEO 演示", "跑一遍证明流程". Chains generate-proof-packet → audit-feature-evidence → ceo-proof-summary, then renders the result as a self-contained talk-html-style HTML page (zh-CN, polished, gist-publishable). Mirrors the workflow in https://gist.github.com/LiuShiyuMath/b782633d079f2494ac2a3bd190933e9d (teamagent-proof-console-results-20260515-064108.html).
---

```
                        ┌─────────────────────────────┐
                        │       /ceo-start            │
                        └──────────────┬──────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
    generate-proof-packet     audit-feature-evidence     ceo-proof-summary
       (rule + event)          (verdict pass/fail)         (HTML + plan)
              │                        │                        │
              └────────────────────────┴────────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │  talk-html (zh-CN render)    │
                        │  evidence/ceo-start-*.html   │
                        └──────────────────────────────┘
```

# /ceo-start — TeamAgent CEO entrance

`ceo-start` is the **single entrance** the user runs when they want the
full TeamAgent story end-to-end: capture → block → audit → CEO page.
It is not a new analysis; it stitches together skills that already exist
in this plugin and prints one clickable artifact.

## When to use

Trigger on any of:

- `/ceo-start`, `ceo-start`, `start ceo`, `kick off ceo-start`
- "demo this to my CEO", "show the CEO", "give CEO the proof page"
- "run the proof workflow", "run the full teamagent demo"
- 中文: "我要给 CEO 看一下", "CEO 演示", "跑一遍证明流程", "做一页给老板看"

If the user only wants the proof packet (no CEO HTML), use the existing
`/teamagent-proof-console:proof` command instead.

## Workflow (do not reorder)

### Step 1 — generate-proof-packet

Invoke the `generate-proof-packet` skill in this plugin. Confirm:

- `evidence/rule-card.json` exists.
- `evidence/ceo-summary.html` exists, ≥ 2048 bytes, contains the four
  anchor strings:
  - `Previous Claude Code made this mistake`
  - `TeamAgent blocked it`
  - `rule-card`
  - `before/after`

If any check fails, stop and surface the error. Do not fabricate.

### Step 2 — audit-feature-evidence

Invoke the `audit-feature-evidence` skill. Read its JSON verdict.

Only continue if `verdict == "pass"`. On `fail`, print the verdict object
verbatim, list the failed checks, halt the workflow.

### Step 3 — ceo-proof-summary

Invoke `ceo-proof-summary` to refresh `evidence/ceo-summary.html` and
emit the ≤90s narration plan.

### Step 4 — talk-html render

Invoke the `talk-html` skill in this plugin with:

- `slug: ceo-start-<rule-id>`
- `template: pitch`
- `prompt_summary`: 一句话讲清「上一只 Claude 犯过的错，新一只想再犯，
  TeamAgent 拦下来了」。
- Source content: the rule card JSON, the four anchor strings, the
  block-event timeline, the narration plan, and a link to the canonical
  proof example
  https://gist.github.com/LiuShiyuMath/b782633d079f2494ac2a3bd190933e9d
  (file: `teamagent-proof-console-results-20260515-064108.html`).

Save under `evidence/ceo-start-<rule-id>-<UTC-timestamp>.html`.
Open it locally for preview. Publishing to gist follows talk-html's own
default (publish unless the user says otherwise).

## Final user-facing summary

```
ceo-start ready
  rule_id:        <id>
  proof_packet:   evidence/ceo-summary.html
  audit_verdict:  pass
  ceo_html:       evidence/ceo-start-<id>-<ts>.html (<bytes> bytes)
  talk-html_pub:  <gist URL | local-only>
  reference:      https://gist.github.com/LiuShiyuMath/b782633d079f2494ac2a3bd190933e9d
```

## Hard rules

- Never invent a rule, an event, a verdict, or a transcript.
- Never write the CEO page if Step 2 returned `fail`.
- The CEO HTML must contain the same four anchor strings as the proof
  summary; talk-html rendering does not exempt them.
- Output language: Simplified Chinese for prose; English allowed only
  for paths, identifiers, code, and URLs (matches talk-html contract).
- Do not skip the talk-html step. The whole point of `ceo-start` is the
  CEO-facing render; without it, the user should just run the existing
  `/teamagent-proof-console:proof` command.
