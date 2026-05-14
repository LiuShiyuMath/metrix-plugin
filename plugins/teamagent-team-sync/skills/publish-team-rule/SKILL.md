---
name: publish-team-rule
description: Use when the user wants to share a captured rule with the team — copies a rule from ~/.teamagent/rules.jsonl into the team store (env TEAMAGENT_TEAM_STORE, default ~/.teamagent/team/rules.jsonl) with attribution and stamp.
---

```
  local store               team store
  ~/.teamagent/             $TEAMAGENT_TEAM_STORE
   rules.jsonl               (default ~/.teamagent/team/rules.jsonl)
       |                          ^
       |  pick rule               |
       |  validate schema         |
       |  stamp attribution       |
       +------------------------->+
                  publish-team-rule
```

# publish-team-rule

Share one rule card from the local user store with the team store. The
team store is a plain JSONL file; teammates' SessionStart hook pulls from
the same path on their machines.

## When to use

- User says "publish this rule", "share with team", "push to team store",
  "promote to team", or "publish rule <id>".
- A new local rule has reached confidence ≥ 1 and the user wants peers to
  benefit.

## Inputs

- Either a rule `id` (preferred — unique, stable) or a `trigger.pattern`
  string that uniquely identifies the rule in `~/.teamagent/rules.jsonl`.
- Optional: `published_by` (defaults to `$USER` or `unknown`).

## Procedure

1. Resolve paths:
   - Local: `${HOME}/.teamagent/rules.jsonl`
   - Team: `${TEAMAGENT_TEAM_STORE:-${HOME}/.teamagent/team/rules.jsonl}`
2. Read local store line-by-line; collect the rule that matches `id` or
   `trigger.pattern`. If zero match or multiple match, stop and ask the
   user to disambiguate. Do not guess.
3. Validate the rule has the required fields: `id`, `trigger.tool`,
   `trigger.pattern`, `wrong`, `correct`, `why`, `confidence`,
   `captured_at`. Missing fields => abort with a clear message.
4. Conflict scan: load team store (if it exists). If any team rule shares
   `trigger.pattern` and has a different `correct`, surface both sides and
   route the user to `/teamagent-team-sync:resolve-rule-conflict` instead
   of overwriting.
5. Stamp the outgoing rule:
   - `published_at`: current ISO8601 UTC timestamp.
   - `published_by`: `$USER` (fallback `unknown`).
   - `source_session`: keep original `session_origin` if present.
6. Append the stamped rule as a single line to the team store. Create the
   parent directory first if needed. Do NOT rewrite the file.
7. Echo back the rule id, team store path, and the count of rules now in
   the team store.

## Output contract

- One-line confirmation containing the rule id and the team store path.
- A short JSON block with `{ "rule_id", "team_store", "published_at" }`
  for downstream proof packets.

## Failure modes

- Local store missing → print remediation: "no local rules yet — capture
  one first with the teamagent-memory plugin".
- Multiple local matches → ask the user to pick by id.
- Team store path is unwritable → print the resolved path and the
  filesystem error verbatim.
- Schema validation failed → list every missing field by name.

## Why this matters

A team that cannot share what one teammate has learned will rediscover
the same wrong move on every new hire. Publishing converts one local
correction into a team-wide guardrail without giving anyone write access
to anyone else's machine — the team store is just a file path the team
agrees on (NFS, dropbox, syncthing, shared git repo, whatever).

## Related

- `/teamagent-team-sync:resolve-rule-conflict` when publishing a rule that
  collides with an existing team rule.
- `/teamagent-team-sync:promote-project-rule` when the rule lives in a
  project-local store and needs to climb to the user level first.
- SessionStart hook in this plugin pulls published rules into the user
  stores of everyone else.
