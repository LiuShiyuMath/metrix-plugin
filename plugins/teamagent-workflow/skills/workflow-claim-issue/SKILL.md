---
name: workflow-claim-issue
description: Stage 1 of the teamagent-workflow handoff. Use when the user says "claim this issue", "start the workflow on issue N", "认领这个 issue", "开始处理 issue", or pastes a GitHub issue URL to begin the issue→grill→implement→proof pipeline. Records a `claimed` line in ~/.teamagent/workflow.jsonl so every later stage can rebuild context from the state file instead of chat memory. v1 supports GitHub issues only.
---

```
  issue URL ──▶ [workflow-claim-issue] ──▶ ~/.teamagent/workflow.jsonl
                       │                         {"stage":"claimed",...}
                       └─▶ next: /workflow-grill (Stage 2)
```

# workflow-claim-issue — Stage 1

Claim a GitHub issue into the TeamAgent workflow state machine. This does
not change the issue on GitHub; it records local handoff metadata so the
grill / implement / proof stages are reproducible.

## When to use

- `/teamagent-workflow:workflow-start <url>` (which chains into Stage 2)
- "claim issue", "start workflow on this issue", "认领 issue", "开始这个 issue"
- The user pastes a `https://github.com/<owner>/<repo>/issues/<n>` URL
  and wants to begin the pipeline.

## Steps

1. **Validate the URL.** It MUST match
   `^https://github\.com/[^/]+/[^/]+/issues/[0-9]+$`. If it is a PR URL,
   a Linear URL, or anything else, stop and tell the user v1 supports
   GitHub issues only. Do not coerce or guess.
2. **Ensure the store.** `mkdir -p ~/.teamagent`. The workflow state
   file is `~/.teamagent/workflow.jsonl` (same dir as teamagent-memory).
3. **Append one `claimed` line** (compact JSON, one line):
   ```json
   {"ts":"<UTC ISO8601>","issue_url":"<url>","stage":"claimed","actor":"<git user.name or 'unknown'>","chatgpt_url":null,"claude_url":null,"pr_url":null,"proof_urls":[],"note":"<short note>"}
   ```
   Get the timestamp with `date -u +%Y-%m-%dT%H:%M:%SZ` and the actor
   with `git config user.name`. Build the line with `jq -nc` so it is
   always valid JSON — never hand-concatenate.
4. **Confirm** to the user, in Simplified Chinese, with the issue URL and
   that Stage 2 (`workflow-grill-urls`) is next.

## Hard rules

- Never invent an issue, an owner, or a number.
- Never write a `claimed` line for a non-GitHub-issue URL.
- The state line must be valid JSON on a single line (`jq -nc`).
- Do not open a browser here — URL generation is Stage 2's job.
- Output prose in Simplified Chinese; URLs/paths/JSON stay verbatim.
