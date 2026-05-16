---
name: workflow-proof-comment
description: Stage 4 of the teamagent-workflow handoff. Use when an implementation PR is open and the user says "write the proof back to the PR", "post the proof comment", "close the loop on the PR", "把证明写回 PR", "发 proof 评论". Posts the visual-proof links (gist / talk-html / htmlpreview) into the PR via `gh pr comment` as the human-approval entry point, records a `proof` state line, and explicitly leaves final approval to a human.
---

```
  PR URL + proof URLs ─▶ [workflow-proof-comment] ─▶ gh pr comment
                               │                       (proof block)
                               │                     └─ dry-run body
                               │                        if gh absent / opt-out
                               └─▶ ~/.teamagent/workflow.jsonl
                                    {"stage":"proof",...}
                          human reads HTML evidence ─▶ approves (not us)
```

# workflow-proof-comment — Stage 4

Write the proof links back to the implementation PR so a human can open
the visual evidence and approve. v1 default is `gh pr comment`; a
dry-run prints the comment body for manual paste.

## When to use

- An implementation PR exists for a handed-off issue.
- `/teamagent-workflow:workflow-proof <pr-url> <proof-url…>`
- "write proof back to PR", "post proof comment", "把证明写回 PR".

## Steps

1. **Collect inputs:** the PR URL (`https://github.com/<o>/<r>/pull/<n>`)
   and one or more proof URLs (gist / htmlpreview / talk-html publish).
   At least one proof URL is required — refuse to post an empty proof.
2. **Build the comment body** (Markdown, Simplified Chinese prose):
   - 关联 issue 与本 PR
   - 证据链接列表 (each proof URL on its own line, clickable)
   - 一句话：本评论是人工审批入口，证据需人工打开 HTML 后再决定是否批准
   - 不写「已通过/已批准」——审批是人的动作，不是本插件的
3. **Post it (default):**
   ```
   gh pr comment <pr-url> --body-file <tmpfile>
   ```
   If `gh` is missing, or the user asked for manual mode, **do not
   post** — print the exact comment body in a fenced block and tell the
   user to paste it.
4. **Append a `proof` line** to `~/.teamagent/workflow.jsonl` with
   `pr_url` and `proof_urls` filled in (`jq -nc`, one line). Do not
   write `approved` — that line only appears when a human approves.
5. **Report** the posted comment URL (or dry-run notice) to the user in
   Simplified Chinese.

## Hard rules

- Never post a proof comment with zero proof URLs.
- Never write the word "approved" / "已批准" into the PR or the state
  file. The plugin delivers evidence to a human; it does not self-approve.
- `gh pr comment` is an outward-facing write — if the run is unattended
  or `gh` auth is unclear, prefer dry-run and surface the body rather
  than silently failing.
- The proof must be openable by a remote reader (gist / htmlpreview /
  published talk-html), never a local `file://` or machine path.
- Output prose in Simplified Chinese; URLs/commands verbatim.
