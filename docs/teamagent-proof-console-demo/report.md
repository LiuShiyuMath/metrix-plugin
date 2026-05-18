# report — 执行结果与第三方判读

```
  RUN ─► DUMP ─► READ
  跑固定工具  存原始 JSON   只读 raw 归纳结论（本文件）
  全部交付物 DONE · gist 已发布且 raw=200
```

## 状态：完成

| 交付物 | 路径 | 状态 |
|---|---|---|
| 新 tmux 脚本 | `demo/teamagent-ceo-wild.sh` | ✅ commit `01fd559` |
| 录制产物 | `docs/demo/teamagent-ceo-wild.{cast,gif}` + `-poster.png` | ✅ commit `ee47ac6` |
| talk-html 页 | `~/.agents/talk-html/teamagent-proof-console-ceo-20260518-100900.html` | ✅ 已发布 |
| 流程文档 | `docs/teamagent-proof-console-demo/{research,plan,report}.md` | ✅ 本提交 |

## 第三方 judge 原始判读（只读沙盒 JSON，非自评）

真机 asciinema（210×50 pty）跑 `bash demo/teamagent-ceo-wild.sh`，KEEP 沙盒后读取：

- Alice `events.jsonl`：`{"kind":"stop_capture","session_id":"alice-ceo-wild",
  "captured":[{"rule_id":"rule-2026-05-18-moment-dayjs"}]}` —— 纠正已捕获为规则卡。
- Bob `events.jsonl`：`{"kind":"pretooluse_block","rule_id":
  "rule-2026-05-18-moment-dayjs","command":"npm install moment","decision":"deny"}`
  —— team-sync 来的同一条规则**否决了重复犯错**。
- Carol `events.jsonl`：`{"kind":"pretooluse_pass","command":"npm install dayjs"}`
  —— 改对后的命令放行（对照组）。
- cast 内 TUI 签名计数：`merged PR`×263、`Claude Code users`×38、
  `UserSubmitPrompt`×83、`Repo proof coverage`×24 —— CEO 窗格确在跑 proof-console TUI。
- 静帧人眼复核：左大窗 proof-console TUI（PROOF CONSOLE / merged PRs / repo
  coverage），右列三窗 Alice 规则卡 JSON / Bob deny / Carol allow。

结论（由上面 raw 归纳）：四窗格、跨独立 HOME/CLAUDE_HOME 的拦截链端到端成立。

## 页面契约校验

`lang="zh-CN"` ✓ · meta 注释 ✓ · gif data URI ×1 ✓ · poster data URI ×1 ✓ ·
无 `file://` ✓ · `teamagent-proof-console` 19 次 vs `teamagent-memory` 6 次（仅作
只读上游）✓ · Noto Serif SC + Fraunces ✓ · audit pill / 继续修改 bar / footer ✓ ·
headless Chrome desktop+mobile 截图复核排版/录像/SVG 均正常 ✓。

发布 URL：

- gist: https://gist.github.com/LiuShiyuMath/da6da341dce3551cbbcfd7230f355946
- rendered: https://htmlpreview.github.io/?https://gist.githubusercontent.com/LiuShiyuMath/da6da341dce3551cbbcfd7230f355946/raw/teamagent-proof-console-ceo-20260518-100900.html
- raw `curl` 状态码：200（已传播）

## 偏差（据实记录，不夸大）

- worktree 默认基于落后的 `origin/main`，已 `git merge main --ff-only` 拉到本地
  main HEAD（9288072）后才有 `docs/proof-console-tui/`。
- `agg` 实际参数是 `--fps-cap` 不是 README 写的 `--fps`；按实际可用参数渲染
  （`--speed 1.5 --fps-cap 12 --font-size 13`）。未改 README（不在本任务范围）。
- 初版用 `script -q /dev/null` 验证失败（嵌套 attach + 登录 shell 打散
  send-keys）；改用真实 asciinema pty 验证，并把脚本改成 pane-id 寻址 +
  `send-keys -l` + clean bash + 注入 node PATH 后稳定可复现。
- 脚本去掉了 claudefast 依赖（原 wild 脚本有），换成确定性 node hook 调用，
  让录像可复现；面板仍是独立 HOME/CLAUDE_HOME 的真实沙盒。

## 风险与后续

- gif 1.1 MB → 页面 1.82 MB，超 talk-html 200 KB 软上限；属"真实录像"豁免，
  已在页面 figcaption 注明。如需更小可降 `--fps-cap`/缩短录制再重渲。
- `docs/proof-console-tui/sample-data.json` 是 prototype 样本；上线前需替换为
  真实 pipeline 导出（页面"诚实边界"已说明）。
- 未 push、未开 PR（用户未要求）；分支 `worktree-ceo-proof-demo`。
- `evidence/ceo-demo.mp4` 仍按设计人工录制，本任务未生成（不伪造）。
