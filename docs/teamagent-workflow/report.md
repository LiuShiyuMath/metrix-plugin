```
  plan.md ─▶ implement ─▶ bin/judge.sh ─▶ judge.json: PASS (4/4 probes)
                                              │
                                   report.md (this file)
```

# report — teamagent-workflow (4th plugin)

Status: **done & judge-verified.** All work isolated in worktree branch
`worktree-teamagent-workflow-plugin`, committed as 5 atomic commits.

## What was built (vs plan.md acceptance checklist)

| Item | Result |
|------|--------|
| `plugin.json` | created, `jq -e` valid |
| `marketplace.json` | 3 → **4** plugins; `teamagent-workflow`, category `workflow`; top-level version bumped 0.1.0 → 0.2.0 |
| `bin/gen-grill-urls.sh` | deterministic; canonical issue ⇒ exact approved prompt + both URLs; PR/empty ⇒ `valid:false`; exit 0 always |
| 4 skills | claim-issue, grill-urls, handoff, proof-comment |
| 3 commands | workflow-start, workflow-grill, workflow-proof |
| README | ASCII art, 4 stages, state schema, `%20`-vs-`+` rationale |
| probe + judge gate | `probes/workflow-checks.sh` + real `pass_criteria` case in `bin/judge.sh` |

## Verification (3rd-party judge harness, not self-eval)

`bash bin/judge.sh` on a clean tree → **PASS, exit 0**, `judge.json`:

```
verdict.all_passed = true   failed_probes = []
probes: ab-plugin-dir ✓  file-checks ✓  stream-json ✓  workflow-checks ✓
workflow-checks.metrics: marketplace_plugin_count=4, workflow_in_marketplace=true,
  all_plugin_json_valid=true, gen_deterministic=true, valid_issue_ok=true,
  pr_url_rejected=true, empty_arg_rejected=true, gen_exit_zero=true
```

`gen-grill-urls.sh` on the canonical input reproduces the user-approved
prompt verbatim ("Follow this instructions … grill me with the issue …
ONLY ANSWER IN CHINESE. LAST STEP BEFORE FINISH …").

## Deviations & decisions (reported honestly)

1. **Space encoding `%20`, not `+`.** The approved example showed `+`.
   Implementation uses RFC-3986 `%20` (`jq @uri`). Reason: decodes
   identically to `+` on `chatgpt.com`, but `claude.ai/new?q=` treats a
   literal `+` as a plus sign — `%20` is the only encoding correct on
   **both** targets. Documented in `README.md` ("Why `%20` not `+`").
2. **marketplace top-level version 0.1.0 → 0.2.0.** Adding a plugin is a
   material marketplace change; mirrors how proof-console carries its own
   bumped version. Plugin-level version stays 0.1.0 (new plugin).
3. **No PR opened / no `gh pr comment` executed.** Stage 4 is documented
   and skill-encoded but only fires when a real implementation PR exists;
   posting a comment is an outward-facing write and out of scope for this
   build. The skill defaults to `gh pr comment` with a dry-run fallback,
   as the user specified.

## Follow-ups (not blocking)

- A live end-to-end run (claim a real issue → open the two URLs → grill →
  paste back → implement → `/workflow-proof`) would exercise the state
  file and `gh pr comment` path against GitHub; deferred until there is a
  real target issue + PR.
- Optional: a tmux + claudefast stream-json recording per TASK.md §6 for
  a visual proof-of-work artifact of the workflow commands.
