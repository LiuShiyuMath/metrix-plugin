---
name: promote-project-rule
description: Use when a project-local rule (stored under .teamagent/project/<repo>/rules.jsonl in current cwd) has matured (confidence ≥ 3) and should be promoted to the user-level store.
---

```
   .teamagent/project/<repo>/rules.jsonl
              |
              |  confidence >= 3
              v
        ~/.teamagent/rules.jsonl    (user store)
              |
              |  optional: publish-team-rule
              v
        $TEAMAGENT_TEAM_STORE       (team store)
```

# promote-project-rule

Lift a project-scoped rule one level up the trust ladder. Project rules
fire only in that repo; user rules fire in every Claude Code session for
that user.

## When to use

- The user has been running with a repo-local rule for long enough that
  its `confidence` field is `>= 3` and it has not been wrong.
- The user says "promote this rule", "elevate to user level", or "this
  one should apply everywhere".

## Inputs

- Repository root (default: current working directory).
- Either a rule `id` or `trigger.pattern`. If omitted, list all project
  rules with `confidence >= 3` and ask the user to pick.

## Paths

- Project store: `${CWD}/.teamagent/project/<repo>/rules.jsonl` where
  `<repo>` is the last path component of the git toplevel (or
  `os.path.basename(cwd)` if not a git repo).
- User store: `${HOME}/.teamagent/rules.jsonl`.

## Procedure

1. Detect repo name from `git rev-parse --show-toplevel` (basename) and
   build the project store path. If the file does not exist, abort with
   "no project rules yet".
2. Load all project rules. Filter to `confidence >= 3`.
3. Resolve target rule by `id` or `trigger.pattern`. Multiple matches =>
   ask the user; zero matches => abort with the available candidates.
4. Validate: same required fields as `publish-team-rule`.
5. Conflict scan against user store. If a user rule shares
   `trigger.pattern` with a different `correct`, do NOT overwrite — route
   to `/teamagent-team-sync:resolve-rule-conflict` and stop.
6. Stamp the outgoing rule:
   - `promoted_at`: current ISO8601 UTC timestamp.
   - `promoted_from`: `<repo>/<rule.id>`.
   - Keep `captured_at` and `session_origin`.
7. Append to `~/.teamagent/rules.jsonl`. Do NOT delete from the project
   store — the project rule continues to exist; promotion is additive.
8. Echo back the rule id, the user store path, and ask whether to also
   publish to the team store. If yes, hand off to
   `/teamagent-team-sync:publish-team-rule`.

## Output contract

- One-line confirmation containing the rule id and the user store path.
- A short JSON block with `{ "rule_id", "promoted_at", "promoted_from" }`.

## Failure modes

- No project store → tell the user where it would live and exit cleanly.
- Confidence below 3 → list candidate confidence values and refuse.
- User store unwritable → surface the OS error verbatim.

## Why this matters

Rules that only apply in one repo should not pollute every session, and
rules that have proved themselves in one repo should not be retyped in
every other repo. Promotion turns repeated wins into portable guardrails
without losing the project-level audit trail.

## Related

- `/teamagent-team-sync:publish-team-rule` for the next step up
  (user → team).
- `/teamagent-team-sync:resolve-rule-conflict` if the promotion would
  collide with an existing user rule.
