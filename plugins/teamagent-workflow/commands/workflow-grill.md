---
description: Stage 2 only — regenerate the chatgpt.com + claude.ai grill-me URLs for an (already claimed) GitHub issue.
---

```
  /teamagent-workflow:workflow-grill <issue-url>
        │
        └─► workflow-grill-urls  →  bin/gen-grill-urls.sh
                                     ├─ chatgpt.com/?prompt=…
                                     └─ claude.ai/new?q=…
```

# /teamagent-workflow:workflow-grill

Run Stage 2 in isolation: produce the two browser-session grill URLs for
a GitHub issue without re-claiming it. Useful to re-open the grill in a
fresh tab or hand the links to someone else.

Argument: `<issue-url>` — `https://github.com/<owner>/<repo>/issues/<n>`.
If omitted, the skill uses the most recent claimed/grilled issue in
`~/.teamagent/workflow.jsonl`.

## Behavior

Invoke the `workflow-grill-urls` skill. It runs the deterministic
`bin/gen-grill-urls.sh`, appends a `grilled` state line, and prints both
URLs. The command never builds URLs itself.

## On failure

If `gen-grill-urls.sh` returns `valid:false` (e.g. a PR URL, or no
issue), print `reason` verbatim and stop.
