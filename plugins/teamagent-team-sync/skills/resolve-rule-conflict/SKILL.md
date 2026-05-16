---
name: resolve-rule-conflict
description: Use when an inbound team rule conflicts with a local rule on the same trigger.pattern. Surfaces both sides, asks the user to keep local / accept team / merge into combined wrong list / drop both, and writes the resolution.
---

```
   local rule         team rule
       \               /
        \             /
         v           v
        +-------------+
        |  conflict   |     same trigger.pattern
        |  detected   |     different "correct"
        +-------------+
              |
   keep local | accept team | merge | drop both
              v
        ~/.teamagent/rules.jsonl   (local store, maybe rewritten)
        ~/.teamagent/resolved.jsonl  (marker the SessionStart hook reads)
```

# resolve-rule-conflict

Walk a single conflict from `~/.teamagent/conflicts.jsonl` to a decision
and write the chosen rule back into the user store.

## When to use

- SessionStart sync hook emitted a warning that conflicts were written to
  `~/.teamagent/conflicts.jsonl`.
- User says "resolve conflict", "merge rule conflict", or asks why a team
  rule did not get applied.

## Inputs

- A conflict entry id or pattern. If not given, pick the oldest unresolved
  row in `~/.teamagent/conflicts.jsonl`.

## Procedure

1. Open `~/.teamagent/conflicts.jsonl`. Find the target row. Each row has
   `{ ts, key, pattern, local, team }`. The `key` is a JSON-array string
   `["<pattern>","<local.correct>","<team.correct>"]` — the stable identity
   the SessionStart hook uses to decide whether a conflict is resolved.
   Copy it **verbatim**; do not recompute or reformat it (a single space
   difference breaks the match).
2. Render both sides to the user side-by-side, including:
   - `id`, `trigger.pattern`
   - `wrong`, `correct`, `why`
   - `confidence`, `captured_at`, `published_by` (team only)
3. Ask the user to choose one of:
   - **keep local** — discard the inbound team rule.
   - **accept team** — replace the local rule. Find every line in
     `~/.teamagent/rules.jsonl` whose `trigger.pattern` matches and rewrite
     them in place (atomic temp file + rename). Append the team rule.
   - **merge** — keep one rule but combine the wrong lists. Build a new
     rule whose `wrong` is an array of the union of both `wrong` strings,
     `correct` is the user's chosen winner, `why` is concatenated with a
     separator, `confidence` is `max(local, team) + 1`. Rewrite local
     store atomically.
   - **drop both** — remove the local rule entirely; do not import the
     team rule. Useful when the disagreement reveals both sides were
     wrong.
4. **Write the resolution marker (load-bearing).** Append one line to
   `~/.teamagent/resolved.jsonl`:

   ```json
   { "key": <conflict.key verbatim>, "decision": "<keep_local|accept_team|merge|drop_both>", "resolved_at": "<ISO8601 UTC>", "winning_rule_id": "<id or null>" }
   ```

   This is the only thing that stops the SessionStart hook from
   re-surfacing the conflict. The hook matches on `key` (exact string).
   If you also keep an audit trail in `~/.teamagent/conflicts.jsonl`,
   that is optional — the hook ignores conflict-row mutations and reads
   `resolved.jsonl` alone. Never hand-build the key from the pattern;
   copy `conflict.key` byte-for-byte.
5. Echo back the decision and the resulting rule id.

## Output contract

- One-line summary of the decision and which rule id (if any) is now
  authoritative.
- A short JSON block with `{ "key", "pattern", "decision",
  "resolved_at", "winning_rule_id" }` — the same `key` written to
  `resolved.jsonl`, so a proof packet can verify the loop closed.

## Failure modes

- Conflicts file missing or empty → tell the user there is nothing to
  resolve and exit cleanly.
- Local rules file is locked or unwritable → surface the OS error
  verbatim, do not silently retry.
- User picks "merge" but the two `correct` values are identical → fall
  back to "accept team" (idempotent) and explain why.

## Why this matters

A team that overwrites local rules on every sync will fight its own
plugin. A team that ignores conflicts will drift apart silently. This
skill forces the disagreement into the user's attention exactly once,
records the choice, and keeps the local store the single source of truth
for what fires at PreToolUse time.

## Related

- SessionStart hook in this plugin is the producer of conflict rows.
- `/teamagent-team-sync:publish-team-rule` will refuse to publish if a
  conflict would be created — resolve here first.
