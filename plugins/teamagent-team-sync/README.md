```
  +------------+        publish        +-------------+
  |  local     |  --------------->     |   team      |
  |  user      |                       |   store     |
  |  store     |  <---------------     |  (shared    |
  +------------+        SessionStart   |   file)     |
       ^                  sync         +-------------+
       |                                       |
       | promote                               | conflict?
       |                                       v
  +------------+                       +-------------+
  | project    |                       | conflicts.  |
  | rules      |                       | jsonl       |
  +------------+                       +-------------+
```

# teamagent-team-sync

Sync rule cards across a team. Three skills + two hooks turn one person's
captured correction into a guardrail everyone on the team gets the next
time they open Claude Code.

## Why

`teamagent-memory` captures corrections per-user. Without sync, every
teammate has to learn the same lesson independently. This plugin gives
the team a shared rule store and a conflict policy so the same mistake
gets blocked everywhere — without anyone needing write access to anyone
else's machine.

## What ships

```
plugins/teamagent-team-sync/
  .claude-plugin/plugin.json
  skills/
    publish-team-rule/SKILL.md
    resolve-rule-conflict/SKILL.md
    promote-project-rule/SKILL.md
  hooks/
    hooks.json
    sessionstart-sync.cjs
    userprompt-publish.cjs
  README.md
```

## Stores and paths

- `~/.teamagent/rules.jsonl` — your user store (read by every Claude Code
  session via the teamagent-memory plugin).
- `$TEAMAGENT_TEAM_STORE` — the team store. Defaults to
  `~/.teamagent/team/rules.jsonl`. Point it at any path the team can read
  (NFS, Dropbox, syncthing, shared git checkout, etc.).
- `~/.teamagent/conflicts.jsonl` — every conflict the SessionStart hook
  refused to apply. One row per conflict. Resolve via the
  `resolve-rule-conflict` skill.
- `~/.teamagent/events.jsonl` — audit trail; every hook fire appends a
  line.
- `${CWD}/.teamagent/project/<repo>/rules.jsonl` — project-scoped rules.
  Used by `promote-project-rule`.

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `TEAMAGENT_TEAM_STORE` | `~/.teamagent/team/rules.jsonl` | Path the SessionStart hook reads from and `publish-team-rule` writes to. |
| `HOME` | platform default | Root for all user-level stores. |
| `USER` | unknown | Stamped into `published_by` on publish. |

## Hooks

- `SessionStart` → `sessionstart-sync.cjs`
  Pulls new rules from the team store into the user store. If the
  inbound rule shares `trigger.pattern` with an existing local rule but
  has a different `correct`, it writes the pair to
  `~/.teamagent/conflicts.jsonl` and surfaces a warning instead of
  overwriting. Silent when there is nothing to do.

- `UserPromptSubmit` → `userprompt-publish.cjs`
  Detects publish intent in the user message ("publish this rule",
  "share with team", "publish rule <id>") and reminds the assistant to
  invoke the `publish-team-rule` skill. Silent otherwise.

## Skills

- `/teamagent-team-sync:publish-team-rule` — copy one rule from local to
  team store with attribution.
- `/teamagent-team-sync:resolve-rule-conflict` — keep / accept / merge /
  drop, writes the decision.
- `/teamagent-team-sync:promote-project-rule` — lift a confident
  project-local rule into the user store (and optionally on to the team).

## Conflict policy

The SessionStart hook never overwrites local rules. Conflicts are
identified by `trigger.pattern` collisions where `correct` differs. Each
conflict is appended verbatim to `~/.teamagent/conflicts.jsonl` for the
user to walk through with the `resolve-rule-conflict` skill. The user
chooses:

- **keep local** — discard the inbound rule.
- **accept team** — atomic rewrite of the local store; team rule wins.
- **merge** — union the `wrong` lists, pick a winning `correct`, bump
  `confidence`, write back.
- **drop both** — remove the local rule too; do not import.

The choice is recorded back into the conflicts file so re-running sync
never re-prompts.

## Install

This plugin lives inside the `teamagent-marketplace` monorepo. Once the
marketplace is registered with Claude Code, enable the plugin from the
plugins UI. To point at a team store other than the default:

```
export TEAMAGENT_TEAM_STORE=/Volumes/team-shared/teamagent/rules.jsonl
```

Add the export to your shell rc so SessionStart picks it up on every new
session.

## Failure modes

- Missing team store → hook exits silently with no changes.
- Unwritable user store → hook logs the error to stderr and exits 0;
  Claude Code session is never broken by sync failure.
- Malformed rule line in either store → that line is skipped; other
  rules import normally.

## See also

- `plugins/teamagent-memory/` — captures the corrections in the first
  place. Without it there is nothing to publish.
- `plugins/teamagent-proof-console/` — generates the evidence packet for
  CEO-grade demos.
