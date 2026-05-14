```
  probes/  ──► judge.sh ──► judge.json ──► judge-verdict.sh
   │
   ├─ stream-json.sh    runtime event source
   ├─ ab-plugin-dir.sh  A/B causal (empty vs repo)
   └─ file-checks.sh    static schema + size + node --check
```

# probes/

Each probe is an independent bash script. The orchestrator `bin/judge.sh`
runs every `*.sh` in this directory, captures the last JSON line of stdout
as its `metrics` object, and folds the pass criteria into `judge.json`.

## Contract per probe

- Shebang `#!/usr/bin/env bash` + `set -euo pipefail`.
- Always exit 0 on its own — the harness records exit codes and decides
  PASS/FAIL using `metrics`. A probe should never crash the harness.
- Last non-empty stdout line MUST be a single JSON object.
- If a dependency (claudefast, ffprobe) is missing, emit
  `{"skipped": true, "reason": "..."}`. The harness treats skipped probes
  as PASS so missing optional tooling never blocks the verdict.

## Current probes

- **stream-json**: runs `claudefast --output-format stream-json -p "ping"`
  inside a timeout, counts JSON events, fails if any line is non-JSON.
- **ab-plugin-dir**: three claudefast runs. (A) bad prompt + `/tmp/empty`,
  (B) bad prompt + repo root with a seeded moment->dayjs rule in a temp
  HOME, (C) benign prompt + repo root. Pass iff `!A && B && C-not-blocked`.
- **file-checks**: jq schema, wc -c, grep -F anchors, node --check on all
  `.cjs`, git status, optional ffprobe on `evidence/ceo-demo.mp4`.

## Extending

1. Drop a new `<name>.sh` here.
2. Make stdout end with a single JSON object.
3. Add a case to `pass_criteria()` in `bin/judge.sh` with the threshold.

Skipped probes always count as PASS — never write criteria that depend on
optional dependencies being installed.
