```
  approved status page (3 Qs answered)
            │
            ▼
   ┌─────────────────────────────────────────────┐
   │  teamagent-workflow — 4th plugin             │
   │  claim ─▶ grill ─▶ implement ─▶ proof        │
   └─────────────────────────────────────────────┘
            │
   task ─▶ expected outputs ─▶ 3rd-party judge harness
```

# plan — teamagent-workflow (4th plugin)

> Research+plan was presented as the talk-html status page
> `teamagent-workflow-workflow-status-20260516-140929.html`. The user
> approved by answering its 3 open questions. This file records the
> locked plan; `report.md` (same dir) records the actual result.

## 1. Task description

Add a 4th plugin `teamagent-workflow` to the metrix-plugin marketplace.
It is the cross-stage handoff layer (not another proof page): one GitHub
issue → grill session → implementation/PR → proof links written back to
the PR, with an append-only state file as the single source of truth.

**Locked scope (the 3 answered questions):**

1. Issue source — **GitHub issue only** in v1.
2. ChatGPT URL — **auto-generated**: a fixed shell tool emits both a
   `chatgpt.com/?prompt=…` and a `claude.ai/new?q=…` grill-me URL.
3. PR comment — **default `gh pr comment`** to write proof links back;
   dry-run body when `gh` absent / user opts out.

**Not doing:** Linear / local-JSONL issue sources; auto-approval (a human
approves by reading the HTML evidence); fake demos.

## 2. Expected outputs (acceptance checklist)

- `plugins/teamagent-workflow/.claude-plugin/plugin.json` — `jq -e` valid.
- `.claude-plugin/marketplace.json` — **4** plugins, includes
  `teamagent-workflow`, category `workflow`.
- `bin/gen-grill-urls.sh` — deterministic; valid issue ⇒ `valid:true`
  with both URLs; PR/empty ⇒ `valid:false`; exit 0 always.
- 4 skills (`workflow-claim-issue`, `workflow-grill-urls`,
  `workflow-handoff`, `workflow-proof-comment`).
- 3 commands (`workflow-start`, `workflow-grill`, `workflow-proof`).
- `README.md` — ASCII art, 4 stages, state schema, `%20`-vs-`+` note.
- `probes/workflow-checks.sh` + a real `pass_criteria` case in
  `bin/judge.sh`.

## 3. How to eval — 3rd-party judge harness (LLM judges raw JSON only)

Run the repo's immutable harness; the LLM may only read the emitted
JSON, never author the verdict (per `EVAL.md`):

```
bash bin/judge.sh           # runs probes/*.sh, writes judge.json
jq '.verdict' judge.json    # all_passed must be true, failed_probes []
```

`probes/workflow-checks.sh` dumps fixed metrics —
`marketplace_plugin_count==4`, `workflow_in_marketplace`,
`all_plugin_json_valid`, `gen_deterministic` (two runs byte-identical),
`valid_issue_ok`, `pr_url_rejected`, `empty_arg_rejected`,
`gen_exit_zero` — and `bin/judge.sh` gates on them. Verdict PASS only if
every probe (ab-plugin-dir, file-checks, stream-json, workflow-checks)
passes. No skill self-asserts done; the bash+jq harness decides.
