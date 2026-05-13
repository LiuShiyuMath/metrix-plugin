```
 stream-json ─┐
 plugin-dir   ├─► probes/ ─► judge.json ─► verdict
 jq -e        │                              ▲
 ffprobe      │                              │
 node --check ┘                claudefast --plugin-dir /tmp/empty
                                  (机械隔离，不靠自评)
```

# EVAL — teamagent-marketplace

- `claudefast --output-format stream-json` — 事件源，runtime emit，不可伪造
- `claudefast --plugin-dir` — A/B 因果证据（`/tmp/empty` vs `$PWD`）
- `jq -e` — `evidence/rule-card.json` schema 检查
- `ffprobe` — `evidence/ceo-demo.mp4` 时长 ≤ 90s，≥ 1280×720
- `grep + wc -c` — `evidence/ceo-summary.html` 四锚点 + ≥ 2KB
- `node --check plugins/**/*.cjs` 与 `git status --porcelain` 为空
- verdict = `cat judge.json | claudefast --plugin-dir /tmp/empty` — 自评机械隔离
- hooks `.cjs`（官方默认 / 无 build / 跨平台），judge `bash+jq+ffprobe`（无额外 runtime / 无可改脚本面）
