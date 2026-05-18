---
name: workflow-grill-urls
description: Stage 2 of the teamagent-workflow handoff. Use when the user says "generate the grill URLs", "give me the chatgpt/claude link for this issue", "grill this issue in the browser", "生成 grill 链接", "给我 chatgpt 链接", or after Stage 1 claimed an issue. Runs the deterministic bin/gen-grill-urls.sh to produce a chatgpt.com and a claude.ai URL that open a browser session already running the grill-me prompt for the issue, then records a `grilled` state line. No LLM is in the URL path.
---

```
  issue URL ─▶ [workflow-grill-urls] ─▶ bin/gen-grill-urls.sh (fixed tool)
                                              │
                                ┌─────────────┴─────────────┐
                                ▼                            ▼
                     chatgpt.com/?prompt=…        claude.ai/new?q=…
                                └──────────── ~/.teamagent/workflow.jsonl
                                                {"stage":"grilled",...}
```

# workflow-grill-urls — Stage 2

Turn a claimed GitHub issue into two clickable browser-session URLs that
prefill the grill-me prompt. The URLs are produced by a fixed shell tool,
not by the model — this is what makes the handoff auditable.

## When to use

- After `workflow-claim-issue`, or via `/teamagent-workflow:workflow-grill`
  / `/teamagent-workflow:workflow-start`.
- "generate grill URLs", "chatgpt link for issue N", "claude.ai 链接",
  "grill 这个 issue".

## Stage gate (FORCED) — do this first

Before generating anything, clear the gate for **this** stage
(`grilled`):

```
bash "${CLAUDE_PLUGIN_ROOT}/bin/workflow-gate.sh" "<issue-url>" grilled
```

If `allowed:false`, print `reason` **verbatim** and **stop** — do not
run `gen-grill-urls.sh`, do not append a `grilled` line. If
`valid:false`, print `reason` verbatim and stop. Continue only on
`allowed:true`. (Not-enabled ⇒ `enforced:false, allowed:true` ⇒ proceed
normally.)

## Steps

1. **Resolve the issue URL.** From the command argument, or the most
   recent `claimed`/`grilled` line in `~/.teamagent/workflow.jsonl`.
2. **Run the fixed tool — do not generate URLs yourself:**
   ```
   bash "${CLAUDE_PLUGIN_ROOT}/bin/gen-grill-urls.sh" "<issue-url>"
   ```
   Read its single JSON object: `valid`, `prompt`, `chatgpt_url`,
   `claude_url`.
3. **If `valid:false`** — print `reason` verbatim and stop. Do not
   hand-craft a URL to "fix" it.
4. **If `valid:true`** — append a `grilled` line to the state file with
   `chatgpt_url` and `claude_url` filled in (`jq -nc`, one line).
5. **Present both URLs** to the user, in Simplified Chinese, as a
   copy-pasteable block:
   ```
   ChatGPT:  <chatgpt_url>
   Claude:   <claude_url>
   ```
   Remind them: the grilled session must end by pasting the detailed
   grilled results back into the GitHub issue (the prompt already
   instructs the web LLM to say so) — that paste is the Stage 3 trigger.

## Hard rules

- `workflow-gate.sh` runs before `gen-grill-urls.sh`. If it says
  `allowed:false`, no URL is generated and no `grilled` line is written
  — print its `reason` verbatim and stop.
- The URLs MUST come from `gen-grill-urls.sh`. Never construct or
  "tweak" a `chatgpt.com` / `claude.ai` URL by hand — the whole point is
  a deterministic, judge-verifiable artifact.
- Do not alter the prompt template inline; if the user wants a different
  prompt, set `GRILL_PROMPT_TEMPLATE` and rerun the tool.
- Output prose in Simplified Chinese; the URLs stay verbatim and
  unwrapped (no line breaks inside a URL).
