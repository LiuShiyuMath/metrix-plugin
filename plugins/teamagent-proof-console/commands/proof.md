---
description: Generate a CEO proof packet from the most recent blocked event.
---

```
  /teamagent-proof-console:proof
        │
        ├─► generate-proof-packet   (pick rule + render evidence/)
        ├─► audit-feature-evidence  (verdict gate; halt on fail)
        └─► ceo-proof-summary       (render HTML + narration plan)
```

# /teamagent-proof-console:proof

Produce a CEO-ready proof packet from the local TeamAgent rule store. The
command chains three skills in this plugin and writes its output under
`evidence/` at the workspace root.

Run the steps below in order. Do not skip a step. If a step fails, stop
the chain and report which step failed and why; do not silently fall
through to the next skill.

## Step 1 — generate-proof-packet

Invoke the `generate-proof-packet` skill from this plugin. It will:

- Read `~/.teamagent/rules.jsonl` and `~/.teamagent/events.jsonl`.
- Pick the rule with the most `block` or `warn` events (tie-break by most
  recent `captured_at`).
- Write `evidence/rule-card.json` (pretty-printed) and
  `evidence/ceo-summary.html` (>= 2KB, four required anchor strings).
- Print a stdout summary with rule id, block count, and output paths.

If the skill exits non-zero, stop here. Surface the error message verbatim
to the user. Do not fabricate a packet.

## Step 2 — audit-feature-evidence

Invoke the `audit-feature-evidence` skill from this plugin. It will:

- Re-parse `evidence/rule-card.json`.
- Cross-check the rule against `~/.teamagent/rules.jsonl` for drift.
- Confirm `confidence >= 1` (default threshold).
- Replay the most recent block/warn event from `~/.teamagent/events.jsonl`.
- Resolve the transcript path and the hook event id.
- Emit a JSON verdict object.

Only proceed to Step 3 when `verdict == "pass"`. If the verdict is `fail`,
print the JSON verdict, list the failed checks, and stop. The CEO must
never see an unaudited packet.

## Step 3 — ceo-proof-summary

Invoke the `ceo-proof-summary` skill from this plugin. It will:

- Render `evidence/ceo-summary.html` with the four required anchors:
  - `Previous Claude Code made this mistake`
  - `TeamAgent blocked it`
  - `rule-card`
  - `before/after`
- Confirm `wc -c evidence/ceo-summary.html` >= 2048.
- Print a `<=90s` narration plan to stdout.

If anchor count < 4 or bytes < 2048, the skill exits 1. Surface the error
and stop.

## Final user-facing summary

Once all three steps succeed, print:

```
proof packet ready
  rule_id:      <id>
  rule_card:    evidence/rule-card.json
  ceo_summary:  evidence/ceo-summary.html (<bytes> bytes, 4/4 anchors)
  audit:        pass
  narration:    see ceo-proof-summary stdout
  mp4_status:   <present|stub|not_recorded>
```

## Hard rules

- Do not edit `~/.teamagent/rules.jsonl` or `~/.teamagent/events.jsonl`.
- Do not invent rules, events, transcripts, or hook event ids.
- Do not generate a synthetic `evidence/ceo-demo.mp4`; the human operator
  records that manually with the narration plan as a script.
- Do not skip the audit step. If verdict is `fail`, halt the chain.
