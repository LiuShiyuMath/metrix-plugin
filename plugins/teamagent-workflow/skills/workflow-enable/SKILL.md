---
name: workflow-enable
description: Turn the teamagent-workflow FORCED gate on or off. Use when the user says "enable forced workflow", "enforce the workflow order", "turn on the workflow gate", "lock the pipeline", "开启强制流程", "启用 forced workflow", "强制按顺序", or "关闭强制 / disable forced workflow". Flips ~/.teamagent/forced.enabled via the fixed bin/workflow-forced.sh tool so every later stage (claim/grill/handoff/proof) must pass workflow-gate.sh before acting. Opt-in by design: until enabled the gate is an advisory pass-through and the plugin behaves exactly as before.
---

```
  /teamagent-workflow:workflow-enable [on|off|status]
        │
        └─▶ bin/workflow-forced.sh   (fixed tool, JSON out, exit 0)
              on  ─▶ touch ~/.teamagent/forced.enabled  + audit line
              off ─▶ rm    ~/.teamagent/forced.enabled  + audit line
            then every stage skill must clear workflow-gate.sh first
```

# workflow-enable — flip the FORCED gate

The four workflow arrows (claim → grill → handoff → proof) are only
*decorative* until forced workflow is enabled. This skill is the single
switch that makes them doors: once `on`, every stage skill must call
`workflow-gate.sh` before doing anything, and an out-of-order jump is
mechanically blocked — not "the model decided to stop".

It is **opt-in on purpose**. With forced workflow `off` the gate returns
`enforced:false, allowed:true` (advisory pass-through) and the plugin is
byte-for-byte the old behaviour. Nothing changes until a human turns it
on here.

## When to use

- "enable forced workflow", "enforce workflow order", "lock the pipeline",
  "开启强制流程", "启用 forced workflow", "强制按顺序走".
- "disable forced workflow", "关闭强制流程" → run it with `off`.
- "is forced workflow on?", "强制流程开了吗" → run it with `status`.

## Steps

1. **Resolve the action** from the command argument: `on` (enable),
   `off` (disable), or `status` (default if nothing given).
2. **Run the fixed tool — do not touch the flag file yourself:**
   ```
   bash "${CLAUDE_PLUGIN_ROOT}/bin/workflow-forced.sh" <on|off|status>
   ```
   Read its single JSON object: `valid`, `enabled`, `reason`,
   `flag_path`, `state_file`.
3. **If `valid:false`** — print `reason` verbatim and stop. Do not edit
   the flag or the state file by hand to "make it work".
4. **Report to the user, in Simplified Chinese**, exactly what changed:
   - on  → 强制流程已开启;此后 claim/grill/handoff/proof 每一步动手前都会先过
     `workflow-gate.sh`,跳阶段或回退会被机械拦截。
   - off → 强制流程已关闭;门禁回到 advisory 放行,顺序不再强制。
   - status → 当前是否开启,以及 flag / 状态文件路径(逐字)。
5. If just enabled, point the user at `/teamagent-workflow:workflow-start
   <issue-url>` as the correct ordered entry point.

## Hard rules

- The on/off/status decision MUST come from `workflow-forced.sh`. Never
  `touch`/`rm` the flag or hand-write the audit line — the whole point
  is a deterministic, judge-verifiable switch.
- Enabling forced workflow does **not** approve anything and does **not**
  advance any issue's stage; it only changes whether the gate enforces
  ordering. Approval stays a human action (see workflow-proof-comment).
- Output prose in Simplified Chinese; paths/commands/JSON stay verbatim.
