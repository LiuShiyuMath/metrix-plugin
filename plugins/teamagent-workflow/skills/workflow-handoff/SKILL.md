---
name: workflow-handoff
description: Stage 3 of the teamagent-workflow handoff. Use when the grilled results have been pasted back into the GitHub issue and the user says "implement this", "do the handoff", "turn the grill into a PR plan", "开始实现", "把 grill 结果变成实现". Reads the grilled discussion from the issue, distills it into a concrete implementation brief (branch, scope, files, acceptance), records a `handoff` state line, and points at Stage 4 for proof-back.
---

```
  issue + grilled comment ─▶ [workflow-handoff] ─▶ implementation brief
                                   │                 (branch / scope /
                                   │                  files / accept)
                                   └─▶ ~/.teamagent/workflow.jsonl
                                        {"stage":"handoff",...}
                                   next: implement → open PR → Stage 4
```

# workflow-handoff — Stage 3

Convert a grilled issue discussion into an implementation brief the
coding session can execute, and record the transition. This skill does
**not** write product code itself — it produces the brief and the state
line; the actual implementation happens in a normal coding session (or
Codex / Claude Code), then a PR is opened.

## When to use

- The user confirms the grilled results are now in the GitHub issue.
- "implement this issue", "handoff", "make the PR plan", "开始实现",
  "把 grill 的结论落地".

## Stage gate (FORCED) — do this first

Before reading the issue or distilling anything, clear the gate for
**this** stage (`handoff`):

```
bash "${CLAUDE_PLUGIN_ROOT}/bin/workflow-gate.sh" "<issue-url>" handoff
```

If `allowed:false`, print `reason` **verbatim** and **stop** — do not
`gh issue view`, do not write a brief, do not append a `handoff` line.
If `valid:false`, print `reason` verbatim and stop. Continue only on
`allowed:true`. (Not-enabled ⇒ `enforced:false, allowed:true` ⇒ proceed
normally.)

## Steps

1. **Fetch the grilled discussion.** Use `gh issue view <n> --repo
   <owner>/<repo> --comments` (read-only) to read the issue body plus the
   pasted grill results. If `gh` is unavailable, ask the user to paste
   the grilled conclusion.
2. **Distill an implementation brief** (in Simplified Chinese):
   - 目标 (what the issue actually asks, post-grill)
   - 范围 / 不做 (scope and explicit non-goals from the grill)
   - 建议分支名 (`<type>/issue-<n>-<slug>`)
   - 受影响文件 / 模块
   - 验收方式 — must be a third-party check, not self-assessment
     (a fixed command/probe that emits JSON for an LLM judge to read,
     per the repo's EVAL.md philosophy)
3. **Append a `handoff` line** to `~/.teamagent/workflow.jsonl` with the
   issue URL and `note` summarizing the brief (`jq -nc`, one line).
4. **Tell the user the next move:** implement on the suggested branch,
   open a PR, then run `/teamagent-workflow:workflow-proof <pr-url>
   <proof-url…>` (Stage 4) to write the proof links back.

## Hard rules

- `workflow-gate.sh` gates this stage. A `handoff` brief is never
  written when the gate said `allowed:false` — print its `reason`
  verbatim and stop.
- Do not fabricate grill conclusions. If the issue has no pasted grill
  results, stop and say so — the workflow is out of order.
- The acceptance criterion in the brief must be externally verifiable
  (fixed tool → JSON → separate LLM judge), never "the model thinks it's
  done".
- This skill records `handoff`; it does not record `proof` or
  `approved` — that is Stage 4 and human approval respectively.
- Output prose in Simplified Chinese; identifiers/paths/commands verbatim.
