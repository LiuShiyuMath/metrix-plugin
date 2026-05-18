<!--
   browser  --upload-->  /analyze  --query()-->  Claude Agent SDK
      ^                                              |  (MiniMax)
      |                                              v
      +------- NDJSON stream (log + report.html) ----+
-->

# proof-console-web

把**任意格式**文件拖进浏览器，一个 Claude Agent SDK 循环（走 MiniMax）自己判断它是什么、
自己选工具勘验、最后写出一份**交互式 HTML 报告**回贴到页面里。

## 它是什么 / 用户价值

不是"上传 → 固定解析器"。是"上传 → Agent 自主决定怎么分析"。
jsonl / csv / zip / sqlite / 源码 / 二进制都行——格式判断、抽样、统计、风险点
都由 Agent 在沙箱化的 per-job 目录里现场完成，证据来自文件本身，不编造。

## 架构

```
docs/proof-console-web/agent-sdk/
├── src/server.ts        Express + multer + @anthropic-ai/claude-agent-sdk query()
├── public/index.html    拖拽 UI，读 NDJSON 流，iframe 渲染 report.html
├── run.sh               注入 MiniMax 凭据后启动（密钥只在进程内）
├── .env.example         可选：显式锁定凭据
└── workspace/<jobId>/   每次分析一个隔离目录，Agent 的 cwd
```

- 权限模式：`permissionMode: "bypassPermissions"`，工具集 `Read/Glob/Grep/Bash/Write/Edit`，
  `cwd` 锁在 per-job 的 `workspace/<jobId>/`，`maxTurns: 40`，请求断开即 abort。
- 凭据：`ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` 走环境变量。
  `run.sh` 从 `~/.zshrc` 的 `claudefast()` 块里取 `sk-cp-` token，**不落盘、不提交**。

## 运行

```bash
cd docs/proof-console-web/agent-sdk
npm install
./run.sh                 # 自动建构 + 注入 MiniMax 凭据
open http://127.0.0.1:8920
```

推荐用 `.env` 锁定凭据（比从 `~/.zshrc` 挖 token 更安全）：
`cp .env.example .env` 并填 `ANTHROPIC_API_KEY`。`.env` 已在 `.gitignore`。

每次分析的 `workspace/<jobId>/` 在结果回贴后即删除；服务启动时也会清空残留目录。

## 如何验证 (how-to-verify)

第三方 harness，不让代码自评：

| 步 | 命令 | 期望 |
|----|------|------|
| typecheck | `npm run typecheck` | exit 0 |
| build | `npm run build` | `dist/server.js` 生成 |
| health | `curl -s localhost:8920/health` | `{"ok":true,"hasKey":true,...}` |
| e2e | 拖一个 `.jsonl`/`.csv` 进页面 | 出现 `result` 行 + 右侧渲染出 report.html |

`npm run build` 跑 `tsc`，类型零报错即结构正确；`/health` 证明凭据注入成功；
拖一个样本文件跑通整条 Agent 循环即端到端通过。
