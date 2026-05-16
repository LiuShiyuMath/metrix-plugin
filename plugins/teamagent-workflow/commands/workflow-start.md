---
description: Start the teamagent-workflow on a GitHub issue — claim it (Stage 1) then auto-generate the chatgpt.com + claude.ai grill URLs (Stage 2).
---

```
  /teamagent-workflow:workflow-start <issue-url>
        │
        ├─► workflow-claim-issue    (Stage 1: record `claimed`)
        └─► workflow-grill-urls     (Stage 2: gen-grill-urls.sh → 2 URLs)
```

# /teamagent-workflow:workflow-start

Entrance to the issue → grill → implement → proof pipeline. Takes one
GitHub issue URL and chains Stage 1 (claim) into Stage 2 (grill URLs).

Argument: `<issue-url>` — must be
`https://github.com/<owner>/<repo>/issues/<n>` (v1: GitHub issues only).

## Behavior

1. Invoke the `workflow-claim-issue` skill. If the URL is not a GitHub
   issue URL, it stops here — surface that and do not continue.
2. Invoke the `workflow-grill-urls` skill, which runs the deterministic
   `bin/gen-grill-urls.sh` and prints the chatgpt.com and claude.ai URLs.

Defer to each skill's contract. Do not generate URLs in the command
itself; do not skip the state-file writes.

## On failure

If Stage 1 rejects the URL, or `gen-grill-urls.sh` returns
`valid:false`, print the reason verbatim and stop. Do not produce a
partial or hand-made URL.
