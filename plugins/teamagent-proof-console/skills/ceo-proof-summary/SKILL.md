---
name: ceo-proof-summary
description: Use when the user (or CEO) wants the one-page summary 'Previous Claude Code made this mistake. New Claude Code tried to repeat it. TeamAgent blocked it.' Renders evidence/ceo-summary.html from a rule + event pair. <90s narration plan included.
---

```
  rule-card.json ─┐
                  ├──► narrate ──► ceo-summary.html (>= 2KB, 4 anchors)
  block event ────┘             └──► narration plan (<=90s)
```

# ceo-proof-summary

Final step in the proof console chain. Produce a single self-contained
HTML page and a short narration plan a human can read aloud or use to
record `ceo-demo.mp4`. Designed to make the demo trivially screenshot- or
screen-record-able.

## When to invoke

The user says one of:

- "give me the CEO summary"
- "render the one-pager"
- "what would I show the CEO"
- "ninety-second pitch of the block event"
- "build the proof page"

## Inputs

- `evidence/rule-card.json` — required.
- Most recent block/warn event for that rule (look it up from
  `${HOME}/.teamagent/events.jsonl`).
- Audit verdict from `audit-feature-evidence` (required to be `pass`). If
  missing or `fail`, refuse to render and explain which check failed.

## Four anchor strings (hard contract)

`evidence/ceo-summary.html` MUST contain all four strings verbatim. The
judge greps for them and fails the run if any is missing.

1. `Previous Claude Code made this mistake`
2. `TeamAgent blocked it`
3. `rule-card`
4. `before/after`

Size floor: `wc -c < evidence/ceo-summary.html` >= 2048.

## HTML structure

- Inline CSS only. No JS. No remote assets.
- Width capped at 960px.
- Sections, in order:
  1. Banner with the tagline (contains anchors 1 and 2).
  2. `before/after` table (header text is literally `before/after`).
  3. `rule-card` section: heading mentions `rule-card`, body shows
     pretty-printed JSON in a `<pre>`.
  4. Evidence list: transcript path, hook event id, block timestamp,
     session id of the blocked attempt, audit verdict.
  5. Footer with confidence count and link `evidence/rule-card.json`.

Pad the narrative so total bytes >= 2048. The padding must be real prose
that explains the rule (rule.why), the consequence of the wrong path, and
why the correct path is preferred. No lorem ipsum. No whitespace tricks.

## Narration plan (<=90s)

Print to stdout after rendering:

```
narration plan (<=90s)
  0:00  Hook: "Previous Claude Code made this mistake."
  0:10  Show before/after table
  0:30  Open rule-card.json — point to trigger + correct + confidence
  0:50  Replay block event — show timestamp + session_id
  1:10  TeamAgent blocked it — show confidence increment
  1:25  Close: "Same mistake, blocked at the keystroke. Confidence +1."
```

Adjust the timestamps to fit the rule, but the total must be <= 90s and
each beat must reference the actual rule-card or event content.

## ffmpeg/ffprobe note

If the human operator records `evidence/ceo-demo.mp4`, ffprobe must
report duration <= 90s and resolution >= 1280x720. This skill does NOT
produce the video; it produces the narration plan. The recording step is
manual on purpose so no synthetic media enters evidence/.

## Output contract (stdout)

```
ceo summary rendered
  html_path:    evidence/ceo-summary.html
  html_bytes:   <N>
  anchors:      4/4 present
  narration:    <printed above>
  mp4_status:   <present|stub|not_recorded>
```

If anchors < 4 or bytes < 2048, exit 1 with the failing condition.

## Failure modes

- `evidence/rule-card.json` missing -> exit 1, message
  `run generate-proof-packet first`.
- audit verdict missing or `fail` -> exit 1, message
  `audit-feature-evidence verdict required; got <state>`.
- Anchor count < 4 after render -> exit 1, message identifies which
  anchor is missing.
- Byte count < 2048 -> exit 1, message
  `summary under 2KB; add real narrative content, not padding`.

## Never do

- Add emojis, external assets, or JavaScript.
- Fabricate timestamps, session ids, or event ids.
- Generate `ceo-demo.mp4` from this skill.
- Inline `before/after` content that does not match the rule card.

## Hand-off

This is the last skill in the `/teamagent-proof-console:proof` chain. The
output is the artifact the operator screenshots or records. The proof
packet is now complete.
