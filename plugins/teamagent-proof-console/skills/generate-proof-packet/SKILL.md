---
name: generate-proof-packet
description: Use when the user asks for a proof packet, demo evidence, or 'show me the before/after'. Walks the rule store, picks one rule with >=1 blocked event, builds evidence/ ceo-summary.html + rule-card.json copy + optional ceo-demo.mp4 stub. Verifies output passes the EVAL.md checks.
---

```
  rules.jsonl ──┐
                ├──► pick rule ──► render ──► evidence/
  events.jsonl ─┘     (>=1 hit)            ├─ rule-card.json
                                           ├─ ceo-summary.html
                                           └─ ceo-demo.mp4 (optional)
```

# generate-proof-packet

Build a CEO-ready proof packet from the local TeamAgent rule store. The output
lives under `evidence/` at the workspace root and is consumed by
`audit-feature-evidence` (verification) and `ceo-proof-summary` (narration).

## When to invoke

The user says one of:

- "build me a proof packet"
- "show me the before/after"
- "generate demo evidence"
- "package the last blocked event"
- "render the CEO summary"

## Hard contract — four anchor strings

`evidence/ceo-summary.html` MUST contain these four anchor strings verbatim.
The downstream judge (`probes/file-checks.sh`) greps for them and fails the
verdict if any are missing.

1. `Previous Claude Code made this mistake`
2. `TeamAgent blocked it`
3. `rule-card`
4. `before/after`

The HTML body must also be at least 2048 bytes (`wc -c < ceo-summary.html`
returns a value >= 2048). Pad with real narrative content, not whitespace.

## Inputs

- `${HOME}/.teamagent/rules.jsonl` — one JSON rule per line. Each line is the
  rule-card schema (id, trigger, wrong, correct, why, confidence,
  captured_at, session_origin, evidence).
- `${HOME}/.teamagent/events.jsonl` — append-only audit trail. Each line:
  `{event, rule_id, session_id, timestamp, decision}` where `decision` is
  one of `allow`, `block`, `warn`, `capture`.

If either file is missing or empty, abort with a clear message. Do NOT
fabricate rules or events. Real evidence only.

## Algorithm

1. Read `~/.teamagent/rules.jsonl`. Parse each line as JSON. Discard malformed
   lines but log them to stderr.
2. Read `~/.teamagent/events.jsonl`. Build a tally
   `{rule_id -> {block: N, warn: N, capture: N}}`.
3. Pick the rule that has the highest `block + warn` count and at least one
   `block` or `warn` event. Tie-break by most recent `captured_at`.
4. If no rule has a block/warn event, fail with exit 1 and message
   `no blocked events yet; nothing to prove`.
5. Copy the picked rule JSON to `evidence/rule-card.json`. Pretty-print
   (2-space indent). Validate against schema before writing.
6. Locate the most recent block/warn event for that rule. Capture
   `event.session_id`, `event.timestamp`, and `event.decision`.
7. Render `evidence/ceo-summary.html` (see template below).
8. (Optional) If `ffmpeg` is installed and `evidence/ceo-demo.mp4` does not
   yet exist, leave a placeholder note in `evidence/README.md` describing
   what the operator should record. Do NOT generate a fake mp4.
9. Print a summary to stdout: rule id, block count, output paths.

## Rule-card schema (jq -e gate)

The judge runs:

```sh
jq -e '
  .id and .trigger.tool and .trigger.pattern
  and .wrong and .correct and .why
  and (.confidence | type == "number")
  and .captured_at and .session_origin
  and .evidence.transcript_path and .evidence.hook_event_id
' evidence/rule-card.json
```

Every field must be present and the right type. `confidence` must be a
number. The trigger object must include both `tool` and `pattern`.

## ceo-summary.html template

The skill renders a single self-contained HTML page. Inline CSS only. No JS.
No external assets. Width capped at 960px so it screenshots cleanly.

Required sections in order:

1. Header: project name, rule id, capture timestamp.
2. Tagline (verbatim): `Previous Claude Code made this mistake. New Claude
   Code tried to repeat it. TeamAgent blocked it.`
3. The `before/after` table: two columns. Left column shows the wrong
   action (rule `wrong` field). Right column shows the correct action
   (rule `correct` field). Header row uses the literal text `before/after`.
4. The `rule-card` block: pretty-print the rule JSON inside a `<pre>`. The
   `<section>` heading must contain the literal text `rule-card`.
5. Evidence list: transcript path, hook event id, block timestamp, session
   id of the blocked attempt.
6. Footer: confidence score, link target `evidence/rule-card.json`.

Pad the narrative so total bytes >= 2048. Use real explanation prose
(rule.why, rule.correct rationale, replay of the block event) — never
lorem ipsum or whitespace padding.

## Output contract (stdout summary)

```
proof packet built
  rule_id:       <id>
  block_events:  <count>
  rule_card:     evidence/rule-card.json
  ceo_summary:   evidence/ceo-summary.html (<bytes> bytes)
  mp4_status:    <present|stub|not_recorded>
```

## Failure modes

- Missing rule store -> exit 1, message `no rules.jsonl at ~/.teamagent`
- Empty rule store -> exit 1, message `rules.jsonl is empty`
- No block/warn events -> exit 1, message `no blocked events yet; nothing to prove`
- Malformed rule line -> log to stderr, skip, continue
- HTML under 2KB after render -> exit 1, message `ceo-summary.html under 2KB; add narrative content`

## Never do

- Fabricate rules, events, transcripts, or hook event ids.
- Edit `~/.teamagent/rules.jsonl` or `~/.teamagent/events.jsonl` from this
  skill. It is read-only.
- Generate a fake `ceo-demo.mp4`. If the recording is missing, leave a
  stub note for the human operator.
- Inline emojis or external assets in `ceo-summary.html`.

## Hand-off

After this skill completes, the typical next steps are
`audit-feature-evidence` (verify) and `ceo-proof-summary` (narration plan).
The `/teamagent-proof-console:proof` slash command chains all three.
