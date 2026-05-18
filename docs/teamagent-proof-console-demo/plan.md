# plan — 重设计多用户演示 + proof-console 单插件页

```
  research ──► plan ──► annotate ──► implement ──► report
                         （本文件）
  交付：① 新 tmux 脚本  ② 真机 cast+gif  ③ proof-console-only talk-html 页
        ④ 流程文档      ⑤ 原子提交（不 push / 不 PR）
```

## task description（做什么 / 怎么做 / 不做什么）

把演示从「Leader 静态面板 + 3 coder 全跑 memory」重设计为
**3 个 coder 跑 teamagent-memory + 1 个 CEO 跑 teamagent-proof-console TUI 交互**，
录一段真机录像，并用 `/talk-html` 只为 teamagent-proof-console 出一页。

- 不动 `demo/teamagent-tmux-wild.sh` 与其 gif（新建独立脚本）。
- talk-html 页主体只写 teamagent-proof-console；teamagent-memory 只作只读
  上游来源一笔带过，不作页面主体。
- 不伪造录像/数据；不 push、不开 PR（用户未要求）。

## expected outputs（可验收交付物）

1. `demo/teamagent-ceo-wild.sh`：4 窗格，Pane0=CEO（proof-console TUI `--demo`
   循环、main-vertical 宽窗 ≥100 列），Pane1-3=Alice/Bob/Carol 独立
   HOME/CLAUDE_HOME 跑 memory（capture → team-sync → DENY → ALLOW）。
   pane-id 寻址 + `send-keys -l` + clean bash + 注入 node PATH。
2. `docs/demo/teamagent-ceo-wild.cast` / `.gif` / `-poster.png`：真机 asciinema 录制 + agg 渲染。
3. `/Users/m1/.agents/talk-html/teamagent-proof-console-ceo-*.html`：zh-CN
   pitch 页，内嵌 gif base64 + poster 回退、SVG 流程图、audit pill、继续修改
   bar、footer 回链；本地预览 → 发布 gist，输出四个 URL。
4. `docs/teamagent-proof-console-demo/{research,plan,report}.md`，每个开头
   ASCII art、<200 行。
5. 单一关注点原子 commit：脚本 / 录制产物 / 流程文档分开提交。

## how-to-eval（第三方 judge harness，不让代码自评）

- `bash -n demo/teamagent-ceo-wild.sh` + `node --check proof-console-tui.mjs`。
- 真机 asciinema 跑脚本，KEEP 沙盒；judge 只读沙盒原始 JSON：
  - Alice `events.jsonl` 有 `kind:stop_capture` + 命中 rule id；
  - Bob `events.jsonl` 有 `kind:pretooluse_block` `decision:"deny"`，rule id 与
    Alice 一致（证明 team-sync 生效）；
  - Carol `events.jsonl` 有 `kind:pretooluse_pass`（对照放行）。
  - cast 内含 TUI 签名串（`merged PR` / `UserSubmitPrompt` / `Repo proof coverage`）
    证明 CEO 窗格真在跑 proof-console TUI。
- 页面契约：`lang="zh-CN"`、meta 注释、1×gif data URI、1×poster data URI、
  无 `file://`、teamagent-proof-console 出现次数 > teamagent-memory、Noto Serif
  SC + Fraunces、audit pill / 继续修改 bar / footer 齐全；headless Chrome 截图
  人眼复核 desktop+mobile；发布后 `curl` raw 返回 200。
- 证据与判读写入 `report.md`，结论由 judge 输出归纳，非作者自述。
