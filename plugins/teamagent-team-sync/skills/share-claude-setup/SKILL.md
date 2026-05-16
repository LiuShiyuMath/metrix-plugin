---
name: share-claude-setup
description: Use when the user wants to share their whole Claude Code setup with the team or copy someone else's. Two flows. SHARE — turn local ~/.claude main contents into a secret-redacted public gist (default) or a public personal repo via bin/teamagent-share. COPY — take a shared gist/repo URL, render it through /talk-html in interactive mode, and give the reader a "copy" button that emits a one-click install prompt (with options) to paste into Claude Code. Trigger phrases include "share my claude setup", "share my ~/.claude", "publish my setup to the team", "let the team copy my config", "copy that setup", "install someone's claude setup", "分享我的 claude 配置", "把我的 ~/.claude 发给团队", "一键安装这套配置".
---

```
  SHARE                                   COPY
  ~/.claude  --teamagent-share-->  gist/repo  --talk-html(interactive)-->  page
   (skills,        (secret-              (public          [copy] button
    plugins,        redacted             manifest)         |
    agents,         manifest)                              v
    commands,                              teamagent-install-prompt
    CLAUDE.md                              |
    headings)                              v
                                  prompt + claude.ai/new?q= + local html path
                                           |
                                           v
                                  paste into Claude Code -> one-click install
```

# share-claude-setup

Distribute a Claude Code setup between machines/teammates without anyone
needing write access to anyone else's home directory. The team store in
`publish-team-rule` shares *rules*; this skill shares the *whole
shareable surface* of `~/.claude` (skills, plugins, agents, commands,
CLAUDE.md structure, redacted settings).

Both directions are driven by **fixed tools** under `bin/`. No model is
in the publish or install-prompt path — the manifest and the install
prompt are assembled mechanically so a proof packet can diff them.

## Flow A — SHARE

Use when: "share my claude setup", "publish my ~/.claude to the team",
"分享我的 claude 配置".

1. Decide the target:
   - public gist (default — link is the unit of sharing):
     `bin/teamagent-share --public`
   - link-only gist: `bin/teamagent-share --secret`
   - public personal repo: `bin/teamagent-share --repo <owner>/<name>`
2. Run it. The script:
   - Inventories `~/.claude`: every skill (name + description), every
     installed plugin (+ its marketplace), agents, commands, and the
     **headings only** of `CLAUDE.md` (prose is withheld — that is where
     machine IPs and tokens live).
   - Runs a deterministic secret redactor over `settings.json`; raw
     `.env`, `.credentials.json`, `*.key` are never collected at all.
   - Publishes `claude-setup.md` + `claude-setup.json`.
3. Read the JSON last line: `{ok, mode, scope_counts, redactions,
   share_url, raw_url, manifest_md}`. Surface `share_url` and the
   `redactions` count to the user — the count is the honest safety
   signal ("N lines withheld as potential secrets").
4. Always preview locally before telling the user it is public:
   `--dry-run` builds the manifest and prints the same JSON without
   publishing.

**Safety contract (load-bearing).** A raw `~/.claude` dump WILL be
auto-blocked by the data-exfiltration policy, and rightly so. This skill
publishes the shareable *surface* in full detail but never the prose of
`CLAUDE.md` and never credential files. If the user insists on raw
prose, stop and make them confirm per file — do not bypass the redactor.

## Flow B — COPY

Use when: "copy that setup", "install this person's claude config",
"一键安装这套配置". Input: a gist/repo URL from Flow A.

1. Fetch the manifest URL and render it through **`/talk-html` in
   interactive mode** (see the talk-html skill's "Interactive mode"
   section). The page shows the setup (counts, plugin list, skill list)
   and embeds an interactive **copy block**:
   - option toggles: scope = `all | plugins | skills`, and a
     `dry-run` checkbox;
   - a **copy** button that, from the current toggles, builds the exact
     install prompt **plus the local html path of this page** and writes
     it to the clipboard.
2. The page's copy logic is the JS twin of `bin/teamagent-install-prompt`
   — same deterministic string, no model. To get the canonical prompt on
   the CLI (e.g. for a proof packet), run:

   ```
   bin/teamagent-install-prompt <share-url> --scope all [--dry-run] --html <page-path>
   ```

   It prints `{valid, scope, dry_run, html_path, prompt, claude_url}`.
   `claude_url` is `https://claude.ai/new?q=…` (space encoded as `%20`,
   never `+`) for a browser one-click; `prompt` is what the button copies.
3. The reader pastes the copied prompt into Claude Code. That session
   fetches the manifest and runs `/plugin marketplace add` +
   `/plugin install` for each plugin and copies each listed skill into
   `~/.claude/skills/` — one click, scoped by the toggles, optionally a
   dry-run plan first.

## Output contract

- SHARE: one line with `share_url`, `mode`, and `redactions=<n>`; plus
  the `{ok,…}` JSON for downstream proof packets.
- COPY: the local talk-html path, the `share_url` it was built from, and
  the exact install `prompt` (and `claude_url`) the copy button emits.

## Failure modes

| Failure | Recovery |
|---|---|
| `gh` not installed/authed | Manifest kept locally; JSON `ok:false` with the reason and the local path. Print `gh auth login`. |
| `~/.claude` missing | `ok:false reason:"no such claude home"`. Nothing published. |
| Manifest would leak a secret | The redactor drops the line and increments `redactions`; verify the count is plausible before sharing. |
| Reader on a machine without the marketplace | The install prompt runs `/plugin marketplace add` first, so this self-heals. |
| User wants raw CLAUDE.md prose | Refuse the bulk path; require per-file confirmation. Headings-only is the default for a reason. |

## Why this matters

A team that re-types its Claude Code setup on every new laptop loses a
day per laptop and drifts apart. One person curates skills, plugins,
agents, hooks; `teamagent-share` turns that into a public, safe, exactly
reproducible artifact, and the talk-html copy button turns "go read this
gist and figure out how to install it" into one paste.

## Related

- `/teamagent-team-sync:publish-team-rule` — shares one *rule*; this
  skill shares the whole *setup*.
- `/teamagent-team-sync:resolve-rule-conflict` — the SessionStart hook's
  conflict consumer (unrelated to share/copy, same plugin).
- talk-html skill (in `teamagent-proof-console`) — provides the
  interactive page + copy block this skill drives.
- `bin/teamagent-share`, `bin/teamagent-install-prompt` — the two fixed
  tools; the judge harness reads their JSON, never narrates it.
