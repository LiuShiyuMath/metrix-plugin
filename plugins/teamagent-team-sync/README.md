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
  +------------+                       +--------------------+
  | project    |                       | conflicts.jsonl    |
  | rules      |                       | (logged ONCE) +    |
  +------------+                       | resolved.jsonl     |
                                       +--------------------+

  share/copy a WHOLE setup (not just rules):

   ~/.claude  --teamagent-share-->  public gist / repo
   (secret-redacted manifest)              |
                                  /talk-html (interactive)
                                  + [copy] button
                                          |
                                  one-click install prompt
                                          v
                                  paste -> Claude Code installs it
```

# teamagent-team-sync

Sync a team's Claude Code setup. Two things travel between machines
without anyone needing write access to anyone else's home directory:

1. **Rule cards** — one person's captured correction becomes a guardrail
   everyone gets on their next session (publish / promote / conflict).
2. **The whole setup** — `~/.claude`'s shareable surface (skills,
   plugins, agents, commands, CLAUDE.md structure) as a secret-redacted
   public gist/repo a teammate installs in one click.

## Why

`teamagent-memory` captures corrections per-user. Without sync, every
teammate relearns the same lesson, and every new laptop re-types the same
setup. This plugin makes both shareable: a shared rule store + conflict
policy, and a `share`/`copy` path for the whole config.

## What ships

```
plugins/teamagent-team-sync/
  .claude-plugin/plugin.json
  bin/
    teamagent-share              # ~/.claude -> redacted public manifest
    teamagent-install-prompt     # share-url + options -> install prompt
  skills/
    publish-team-rule/SKILL.md
    resolve-rule-conflict/SKILL.md
    promote-project-rule/SKILL.md
    share-claude-setup/SKILL.md  # the share + copy flows
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
- `~/.teamagent/conflicts.jsonl` — every distinct conflict the
  SessionStart hook refused to apply, logged **at most once** (keyed by
  `[pattern, local.correct, team.correct]`). Walk it with
  `resolve-rule-conflict`.
- `~/.teamagent/resolved.jsonl` — resolution markers. A conflict whose
  `key` appears here is skipped forever by SessionStart — no re-log, no
  re-prompt. This is what makes "re-running sync never re-prompts" true.
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
  Pulls new rules from the team store into the user store. On a
  `trigger.pattern` collision with a different `correct`, it logs the
  conflict **once** to `~/.teamagent/conflicts.jsonl` and warns, instead
  of overwriting. The same unresolved conflict never grows the ledger
  across sessions, and a `resolved.jsonl` marker silences it entirely.
  Silent when there is nothing to do.

- `UserPromptSubmit` → `userprompt-publish.cjs`
  Detects publish intent in the user message ("publish this rule",
  "share with team", "publish rule <id>") and reminds the assistant to
  invoke the `publish-team-rule` skill. Silent otherwise.

## Skills

- `/teamagent-team-sync:publish-team-rule` — copy one rule from local to
  team store with attribution.
- `/teamagent-team-sync:resolve-rule-conflict` — keep / accept / merge /
  drop; writes the resolution marker to `resolved.jsonl`.
- `/teamagent-team-sync:promote-project-rule` — lift a confident
  project-local rule into the user store (and optionally on to the team).
- `/teamagent-team-sync:share-claude-setup` — share the whole `~/.claude`
  surface, or copy someone else's via an interactive talk-html page.

## Conflict policy

The SessionStart hook never overwrites local rules. A conflict is
identified by a `trigger.pattern` collision where `correct` differs, and
keyed by the JSON array `[pattern, local.correct, team.correct]`. That
key is written **once** to `~/.teamagent/conflicts.jsonl` no matter how
many sessions start (the old behaviour re-appended every session — that
was the bug). `resolve-rule-conflict` lets the user choose:

- **keep local** — discard the inbound rule.
- **accept team** — atomic rewrite of the local store; team rule wins.
- **merge** — union the `wrong` lists, pick a winning `correct`, bump
  `confidence`, write back.
- **drop both** — remove the local rule too; do not import.

The decision is written as a marker to `~/.teamagent/resolved.jsonl`
(carrying the conflict `key` verbatim). SessionStart reads that file and
skips any matching conflict forever — re-running sync never re-prompts.

## Share / copy a whole setup

```
teamagent-share [--public|--secret] [--repo owner/name] [--dry-run]
teamagent-install-prompt <share-url> [--scope all|plugins|skills]
                         [--dry-run] [--html PATH]
```

- **SHARE** — `teamagent-share` inventories `~/.claude` (every skill +
  description, every plugin + its marketplace, agents, commands, and
  CLAUDE.md **headings only**), runs a deterministic secret redactor over
  `settings.json` (raw `.env`/`.credentials.json`/`*.key` are never
  collected), and publishes `claude-setup.md` + `.json` to a public gist
  (default) or a public personal repo. It prints a JSON summary whose
  `redactions` count is the honest safety signal.
- **COPY** — `share-claude-setup` renders the manifest through `/talk-html`
  in interactive mode with a **copy button**. The button (the JS twin of
  `teamagent-install-prompt`) builds the exact install prompt from the
  on-page option toggles plus this page's local path, and copies it.
  Paste into Claude Code → it runs `/plugin marketplace add` +
  `/plugin install` and copies skills — one click.

Both `bin/` tools are **fixed tools**: no model is in the manifest or
prompt path, so the judge harness can run them and diff their JSON.

**Safety.** A raw `~/.claude` dump is correctly auto-blocked by the
data-exfiltration policy. This plugin publishes the shareable *surface*
in full detail but never CLAUDE.md prose and never credential files.

## Install

This plugin lives inside the `metrix-plugin` marketplace monorepo. Once
the marketplace is registered with Claude Code, enable the plugin from
the plugins UI. To point at a team store other than the default:

```
export TEAMAGENT_TEAM_STORE=/Volumes/team-shared/teamagent/rules.jsonl
```

Add the export to your shell rc so SessionStart picks it up on every new
session.

## Failure modes

- Missing team store → hook exits silently with no changes.
- Unwritable user store → hook logs the error to stderr and exits 0;
  the Claude Code session is never broken by a sync failure.
- Malformed rule line in either store → that line is skipped; other
  rules import normally.
- `gh` missing/unauthed during `teamagent-share` → manifest kept locally;
  JSON `ok:false` with the reason and the local path.

## See also

- `plugins/teamagent-memory/` — captures the corrections in the first
  place. Without it there is nothing to publish.
- `plugins/teamagent-proof-console/` — provides the `talk-html` skill the
  copy flow drives, and generates the CEO-grade evidence packet.
