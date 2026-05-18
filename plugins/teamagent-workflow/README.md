```
  _____                _                    _    __ _
 |_   _|__  __ _ _ __  / \   __ _  ___ _ __ | |_ / _| | _____      __
   | |/ _ \/ _` | '_ \/ _ \ / _` |/ _ \ '_ \| __| |_| |/ _ \ \ /\ / /
   | |  __/ (_| | | |/ ___ \ (_| |  __/ | | | |_|  _| | (_) \ V  V /
   |_|\___|\__,_|_|/_/   \_\__, |\___|_| |_|\__|_| |_|\___/ \_/\_/
                           |___/   issue → grill → implement → proof

  ┌──────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
  │ 1. claim │──▶│ 2. grill     │──▶│ 3. implement  │──▶│ 4. proof     │
  │ an issue │   │ chatgpt.com  │   │ + open a PR   │   │ gh pr comment│
  │          │   │ + claude.ai  │   │ from results  │   │ proof links  │
  └────┬─────┘   └──────┬───────┘   └──────┬────────┘   └──────┬───────┘
       └────────────────┴── ~/.teamagent/workflow.jsonl ───────┘
                  (one append-only state line per stage)
```

# teamagent-workflow

The 4th TeamAgent plugin. It is **not** another proof page — it is the
cross-stage handoff that turns one GitHub issue into a tracked state
machine: claim → grill → implement → proof-back-to-PR.

`teamagent-proof-console` still generates evidence; `talk-html` still
renders it. `teamagent-workflow` is the glue that records where each
issue is and produces the exact artifact the next stage needs.

## v1 scope (locked)

Three decisions, confirmed on the approved status page:

1. **Issue source — GitHub issue only.** No Linear, no local JSONL in
   v1. The URL must match
   `https://github.com/<owner>/<repo>/issues/<n>`.
2. **ChatGPT URL — auto-generated.** The workflow does *not* wait for a
   user-pasted link. `bin/gen-grill-urls.sh` deterministically produces
   both a `chatgpt.com/?prompt=…` and a `claude.ai/new?q=…` URL that open
   a browser session already running the grill-me prompt for that issue.
3. **PR comment — default `gh pr comment`.** Stage 4 writes the proof
   links straight back to the PR via `gh pr comment`. A dry-run mode
   prints the comment body for manual paste when `gh` is unavailable or
   the user opts out.

## The 4 stages

| Stage | Skill | Input | Fixed output |
|-------|-------|-------|--------------|
| 1. claim | `workflow-claim-issue` | issue URL | a `claimed` line in `~/.teamagent/workflow.jsonl` |
| 2. grill | `workflow-grill-urls` | issue URL | chatgpt.com + claude.ai URLs (from `gen-grill-urls.sh`) |
| 3. handoff | `workflow-handoff` | grilled results pasted into the issue | an implementation brief + branch/PR plan |
| 4. proof | `workflow-proof-comment` | PR URL + proof links | a `gh pr comment` (or dry-run body) + `proof` state line |

## Commands

- `/teamagent-workflow:workflow-start <issue-url>` — Stage 1 + 2 in one
  shot: claim the issue and print the two grill URLs.
- `/teamagent-workflow:workflow-grill <issue-url>` — Stage 2 only:
  regenerate the grill URLs for an already-claimed issue.
- `/teamagent-workflow:workflow-proof <pr-url> <proof-url...>` — Stage 4:
  write the proof links back to the PR.
- `/teamagent-workflow:workflow-enable [on|off|status]` — flip the FORCED
  gate (see below). Default `status`.

## FORCED workflow (opt-in gate)

In v0 the four arrows above were **decorative**. Nothing stopped you
from claiming an issue and immediately posting a proof — the skills only
*asked* the model politely to stop. For a plugin whose whole job is
handing evidence to a human for approval, "all on the honour system" is
the one place it must not be.

`bin/workflow-gate.sh` makes a **tool**, not the model, decide whether a
stage transition is legal. Given an issue URL and a target stage it
rebuilds the issue's current stage from the append-only state file and
answers one JSON object. The entire policy is one line:

```
allowed = (requested == current) OR (requested == current + 1)
          stages: claimed=1 · grilled=2 · handoff=3 · proof=4
```

That single line closes three illegal moves with no extra branches —
**skipping** (claim → proof), **starting mid-pipeline** (grill before
claim), and **going backward** (re-grill after proof). Re-running the
current stage (`requested == current`) is the only permitted non-advance
and is idempotent.

It is **opt-in by design**: until you run
`/teamagent-workflow:workflow-enable on` the gate returns
`enforced:false, allowed:true` and the plugin is byte-for-byte its old
self. `workflow-enable` (via the fixed `bin/workflow-forced.sh`) flips
`~/.teamagent/forced.enabled` and records a `forced_enabled` /
`forced_disabled` audit line. Once enabled, all four stage skills must
clear `workflow-gate.sh` before doing anything; `allowed:false` ⇒ they
print `reason` verbatim and stop — no state line, no `gh pr comment`, no
fabricated brief.

```
  claim ──▣──▶ grill ──▣──▶ handoff ──▣──▶ proof        ▣ = workflow-gate.sh
    ▲                                        │
    └──────── BLOCKED: backward ◀────────────┘
    └──────── BLOCKED: skip ahead ───────────┘   (when forced workflow enabled)
```

The gate guarantees **order**, never **content quality** — whether the
grill was good or the proof links are real is still a human's call on
the PR. Approval stays a human action; the gate never writes `approved`.

## State file

`~/.teamagent/workflow.jsonl` — append-only, one JSON object per stage
transition. Same store directory as `teamagent-memory`'s
`rules.jsonl` / `events.jsonl`.

```json
{"ts":"2026-05-16T14:30:00Z","issue_url":"https://github.com/owner/repo/issues/2",
 "stage":"claimed","actor":"libz","chatgpt_url":null,"claude_url":null,
 "pr_url":null,"proof_urls":[],"note":"claimed via /workflow-start"}
```

`stage` ∈ `claimed | grilled | handoff | proof | approved` (plus the
gate's own audit markers `forced_enabled | forced_disabled`, which carry
`issue_url:null` and are ignored when rebuilding an issue's stage). The
file is the single source of truth — every skill reconstructs context
from it, never from chat memory.

## Why `%20` not `+` for spaces

`gen-grill-urls.sh` encodes spaces as `%20` (RFC-3986 via `jq @uri`),
not the form-encoded `+`. Both decode identically on `chatgpt.com`, but
`claude.ai/new?q=` treats a literal `+` as a plus sign — `%20` is the
only encoding that works on **both** targets. The user-approved example
showed `+` for illustration; `%20` is the correct, portable realization.

## Verification

This plugin ships two judge probes, `probes/workflow-checks.sh` and
`probes/workflow-gate-checks.sh` (both run by the repo's `bin/judge.sh`).
They prove, with fixed tools and no self-eval:

- marketplace lists **4** plugins (was 3) and every `plugin.json` is
  `jq -e`-valid;
- `gen-grill-urls.sh` is deterministic — same issue URL ⇒ byte-identical
  JSON across two runs;
- a valid issue URL yields `valid:true` with both a `chatgpt.com` and a
  `claude.ai` URL; a PR URL and an empty arg yield `valid:false` and
  exit 0 (probe-safe);
- against a mechanically-built isolated state file, `workflow-gate.sh`:
  passes through (`enforced:false`) until enabled; once enabled lets only
  `claimed` start an empty issue, allows the full ordered sequence,
  blocks every skip and every backward jump, allows idempotent re-runs,
  and returns `valid:false` for a bad stage or a non-issue URL — every
  case exit 0.

The LLM may read `judge.json` afterwards; it never authors the verdict.
