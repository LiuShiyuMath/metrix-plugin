# research — teamagent-proof-console CEO 演示

```
  上游只读事实                本插件四个出口              第三方判决门
  rules.jsonl   ─┐      ┌─ ① proof-console-tui.mjs ─┐
  events.jsonl  ─┴──────┼─ ② --dashboard out.html   ┼─► jq -e / grep+wc
  (teamagent-memory)    ├─ ③ /proof  → evidence/    │   ffprobe / claudefast
                        └─ ④ /ceo-start → talk-html ─┘   --plugin-dir /tmp/empty
```

实际收集到的上下文（非计划背景）。

## 仓库与插件

- 仓库 `metrixMarkets`：Claude Code plugin marketplace，4 个 plugin。
- `teamagent-memory`：3 个 coder 用。Stop hook `stop-capture.cjs` 把会话纠正写成
  `~/.teamagent/rules.jsonl`；PreToolUse `pretooluse-enforce.cjs` 命中规则时
  `decision:"deny"`。CLI `bin/teamagent list/events`。事件 schema：
  `{ts, kind, ...}`，`kind ∈ {stop_capture, pretooluse_block, pretooluse_pass}`。
- `teamagent-proof-console`（本页主体）：CEO 用。
  - TUI：`docs/proof-console-tui/proof-console-tui.mjs`，`--demo` 自动回放
    j/tab/m/enter/f/h（line 396 `runDemo()`，约 8s 一轮，q 退出）。
  - `proof-console-tui.mjs` line 326：`Math.max(100, columns)`、`Math.max(32, rows)`
    —— TUI 最小渲染 100×32，窗格必须够宽，否则错位。
  - `--dashboard out.html`：5 KPI 卡 + 联动过滤 + 4 Chart.js 图 + 可排序证据表。
  - 命令：`/teamagent-proof-console:proof`（commands/proof.md，链
    generate-proof-packet → audit-feature-evidence 失败即停 → ceo-proof-summary）、
    `/teamagent-proof-console:ceo-start`（commands/ceo-start.md，+ talk-html）。
  - EVAL 门（README）：`jq -e` schema、`grep+wc -c ≥2048` + 4 锚串、
    `ffprobe ≤90s ≥1280x720`、`claudefast --plugin-dir /tmp/empty` 机械隔离。
  - 4 锚串：`Previous Claude Code made this mistake` / `TeamAgent blocked it` /
    `rule-card` / `before/after`。ceo-start 参考产物 gist `b782633d`。

## 既有演示资产

- `demo/teamagent-tmux-wild.sh`：原 4 窗格（Leader 静态 dashboard + Alice/Bob/Carol
  全跑 memory），产物 `docs/demo/teamagent-wild.{cast,gif}`。决定**保留不动**。
- `docs/proof-console-tui/README.md` 给出 asciinema + agg 录制配方（agg 用
  `--fps-cap` 不是 `--fps`）。

## 关键环境事实（踩坑）

- worktree 默认从 `origin/main`（落后本地 main）建；需 `git merge main --ff-only`
  才有 `docs/proof-console-tui/`。
- tmux split-window 不带命令参数时用登录 shell（zsh+starship），会把 send-keys
  逐字打散成一行一字符。需 `default-command "bash --noprofile --norc"`。
- `tmux send-keys "$cmd" C-m` 会把长串里的 token 当键名重解析；必须
  `send-keys -l -- "$cmd"` 再单独 `Enter`。
- 用 pane-id（`%N`）寻址，不用数字下标，避免 base-index 错路由。
- 面板 `bash --noprofile --norc` 不继承 nvm PATH；需把 `dirname $(command -v node)`
  注入每个面板 PATH。
- `script -q /dev/null` 包裹 + 嵌套 tmux attach 会干扰 send-keys；真实
  asciinema pty 才是可靠验证路径（也是产物生成路径）。

## 会话与产物

- session `5fc08bd2-d742-4f68-98a3-5e628b8fffa6`，分支 `worktree-ceo-proof-demo`。
- talk-html 实时皮肤：`/Users/m1/.agents/skills/talk-html/`，产物输出
  `/Users/m1/.agents/talk-html/`。
