---
description: Run the full TeamAgent CEO proof workflow (generate → audit → CEO summary → talk-html render). Entrance for /ceo-start.
---

```
  /teamagent-proof-console:ceo-start
        │
        └─► ceo-start skill
              ├─► generate-proof-packet
              ├─► audit-feature-evidence   (halt on fail)
              ├─► ceo-proof-summary
              └─► talk-html                (zh-CN, pitch template)
```

# /teamagent-proof-console:ceo-start

Single entrance to the CEO-facing TeamAgent proof workflow. Invokes the
`ceo-start` skill in this plugin, which chains four steps and writes the
final artifact under `evidence/ceo-start-<rule-id>-<UTC-timestamp>.html`.

Reference output (canonical example):
https://gist.github.com/LiuShiyuMath/b782633d079f2494ac2a3bd190933e9d

## Behavior

Defer fully to the `ceo-start` skill's workflow contract. Do not duplicate
its steps here; do not skip its halt-on-fail audit gate; do not bypass the
talk-html render at the end.

## On failure

Whichever step fails, surface the error verbatim and stop. Do not produce
a partial CEO page.
