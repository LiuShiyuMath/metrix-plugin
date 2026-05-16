---
description: Stage 4 — write the visual-proof links back to the implementation PR via gh pr comment (or print the body for manual paste).
---

```
  /teamagent-workflow:workflow-proof <pr-url> <proof-url...>
        │
        └─► workflow-proof-comment
              ├─ gh pr comment <pr-url> --body-file …   (default)
              └─ dry-run body                            (gh absent / opt-out)
            human opens HTML evidence ─► approves (not the plugin)
```

# /teamagent-workflow:workflow-proof

Close the loop: post the proof links into the PR so a human can open the
visual evidence and approve. Default path is `gh pr comment`.

Arguments:
- `<pr-url>` — `https://github.com/<owner>/<repo>/pull/<n>`
- `<proof-url...>` — one or more remotely-openable proof links (gist /
  htmlpreview / published talk-html). At least one is required.

## Behavior

Invoke the `workflow-proof-comment` skill. It builds a Simplified-Chinese
comment body, posts it with `gh pr comment` (or prints it for manual
paste when `gh` is unavailable / the user opts out), and appends a
`proof` line to `~/.teamagent/workflow.jsonl`.

## Hard rules (enforced by the skill)

- Never post with zero proof URLs.
- Never write "approved" / "已批准" — approval is a human action.
- Proof links must be remotely openable, never a local `file://` path.
