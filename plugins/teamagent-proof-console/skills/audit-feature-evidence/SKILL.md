---
name: audit-feature-evidence
description: Use when reviewing a TeamAgent capture; opens the rule card, replays the blocked event, asserts rule confidence >= threshold, checks transcript link resolves. Returns audit verdict pass/fail with reasons.
---

```
  rule-card.json ──┐
                   ├──► audit ──► verdict
  events.jsonl ────┤            ├─ pass
                   │            └─ fail (reasons[])
  transcript path ─┘
```

# audit-feature-evidence

Verify that a generated proof packet stands up to scrutiny. Run after
`generate-proof-packet` and before showing anything to the CEO. Returns a
machine-readable verdict so the slash command chain can short-circuit on
failure.

## When to invoke

The user says one of:

- "audit the proof"
- "is this evidence real"
- "verify the rule card"
- "spot-check this capture"
- "did the block actually happen"

## Inputs

- `evidence/rule-card.json` — produced by `generate-proof-packet`.
- `${HOME}/.teamagent/events.jsonl` — the audit trail. Read-only.
- `${HOME}/.teamagent/rules.jsonl` — confirm the rule still exists upstream.
- Confidence threshold: default `1`. Override with `--min-confidence N`.

## Checks (each emits pass/fail)

1. **schema** — `rule-card.json` parses, and every required field is
   present with the right type. Mirrors the `jq -e` gate from
   generate-proof-packet (id, trigger.tool, trigger.pattern, wrong,
   correct, why, confidence is a number, captured_at, session_origin,
   evidence.transcript_path, evidence.hook_event_id).
2. **upstream-match** — the same `id` exists in `~/.teamagent/rules.jsonl`
   with identical `trigger.pattern` and `wrong`/`correct` text. If the
   upstream rule has been edited since capture, flag as `drift`.
3. **confidence** — `confidence >= threshold` (default 1). Below threshold
   means the rule has not yet been reinforced and the packet is premature.
4. **event-replay** — at least one `block` or `warn` event in
   `events.jsonl` references this `rule_id`. Capture the most recent
   matching event for the report.
5. **transcript-link** — `evidence.transcript_path` resolves to a readable
   file or to a recorded session id that exists in events.jsonl. If
   missing, flag as `transcript_missing`.
6. **hook-event-id** — `evidence.hook_event_id` appears in events.jsonl.
   If absent, flag as `hook_event_missing`.

## Output schema

Print a single JSON object to stdout:

```json
{
  "rule_id": "rule-...",
  "verdict": "pass|fail",
  "checks": {
    "schema": "pass|fail",
    "upstream_match": "pass|fail|drift",
    "confidence": "pass|fail",
    "event_replay": "pass|fail",
    "transcript_link": "pass|fail|missing",
    "hook_event_id": "pass|fail|missing"
  },
  "reasons": ["..."],
  "most_recent_event": {
    "timestamp": "...",
    "session_id": "...",
    "decision": "block|warn|allow|capture"
  }
}
```

`verdict` is `pass` only when every check is `pass`. Anything else
(`fail`, `drift`, `missing`) flips the verdict to `fail` and the offending
check appears in `reasons` with a short explanation.

## Failure modes

- `evidence/rule-card.json` missing -> verdict fail, reason
  `rule-card.json not found; run generate-proof-packet first`.
- `~/.teamagent/events.jsonl` missing -> verdict fail, reason
  `no event log; cannot replay`.
- JSON parse error on any line -> verdict fail, reason cites the file.

## Never do

- Mutate `~/.teamagent/rules.jsonl` or `events.jsonl`.
- Trust a confidence value that arrived from outside the rule store.
- Mark a packet `pass` when the upstream rule has drifted; downgrade to
  `fail` and surface the diff in `reasons`.

## Hand-off

The slash command `/teamagent-proof-console:proof` calls this skill after
`generate-proof-packet`. If verdict is `fail`, halt the chain — do NOT
proceed to `ceo-proof-summary`. The CEO should never see an unaudited
packet.
