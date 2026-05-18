---
description: Turn the FORCED workflow gate on/off/status — when enabled, every stage (claim/grill/handoff/proof) must clear bin/workflow-gate.sh before acting.
---

```
  /teamagent-workflow:workflow-enable [on|off|status]
        │
        └─► workflow-enable skill → bin/workflow-forced.sh
              on      enable enforcement (touch forced.enabled + audit)
              off     back to advisory pass-through
              status  report current state (default)
```

# /teamagent-workflow:workflow-enable

The single switch for FORCED workflow. The gate is opt-in: until you run
this with `on`, the four stages behave exactly as before (advisory
pass). Turning it on makes `claim → grill → handoff → proof` an enforced
state machine — `workflow-gate.sh` blocks any skip or backward jump.

Argument: `on` | `off` | `status` (default `status` when omitted).

## Behavior

Invoke the `workflow-enable` skill. It runs the deterministic
`bin/workflow-forced.sh`, which flips `~/.teamagent/forced.enabled` and
appends a `forced_enabled` / `forced_disabled` audit line to the same
append-only `~/.teamagent/workflow.jsonl` the gate reads. The command
never touches the flag itself.

## On failure

If `workflow-forced.sh` returns `valid:false` (e.g. an unknown action,
or the flag file is unwritable), print `reason` verbatim and stop.

## Note

Enabling does not approve or advance anything — it only changes whether
ordering is enforced. Approval remains a human action.
