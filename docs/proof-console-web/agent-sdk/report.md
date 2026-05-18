<!--
   scaffold ──► deps/typecheck/build ──► verifier ──► live MiniMax e2e ──► DONE
      ✓                 ✓                   ✓               ✓
-->

# report.md — proof-console-web 交付情况

## 状态：完成并实跑验证通过

「拖任意文件 → Claude Agent SDK 循环自主勘验 → 交互报告回贴」端到端跑通，连的是真实 MiniMax。

## 实际执行结果

| 阶段 | 命令 / 动作 | 结果 |
|------|-------------|------|
| typecheck | `npm run typecheck` | exit 0 |
| build | `npm run build` | `dist/server.js` 生成，`node --check` 通过 |
| 静态/health 冒烟 | boot + `curl /health` | `{"ok":true,...}`，`/` 与 400 路径正常 |
| SDK 审查 | `agent-sdk-verifier-ts` 子代理 | PASS（1 处阻断项已修，见下） |
| **live e2e** | run.sh 注入 MiniMax → 上传 `sample.jsonl` | **subtype=success, isError=false** |

## live e2e 证据（真实数字）

- 模型 `MiniMax-M2.7-highspeed`，base URL `https://api.minimaxi.com/anthropic`，`hasKey=true`
- Agent 自主工具链：Read → Glob → Read → Bash → Write → Edit×4 → Bash
- 耗时 138,274 ms，cost $1.80，report.html 12,850 bytes（合法 `<html>`）
- 报告内容来自文件本身，非编造：正确识别植入的 3 个异常
  - `bob` 从 TEST-NET-3 文档 IP `203.0.113.77` 批量 `export_db` 48 万行
  - `carol` 6 秒内 3 次登录失败后成功（暴力破解形态）
  - 2 秒内 3 次重复 export
- 跑完 `workspace/<jobId>/` 自动删除，启动时清残留 — 已核实

## 与计划的偏差

- verifier 查出 `permissionMode:"bypassPermissions"` 缺少必需伴随项
  `allowDangerouslySkipPermissions:true`（否则 bypass 静默失效）——已修并复跑通过。
- iframe sandbox 由 `allow-same-origin` 改为 `allow-scripts`（隔离不串父页）。
- 加了 per-job workspace 清理 + 启动 orphan sweep。

## 用户实测发现的 bug 及修复（均已 live 复跑验证）

1. **上传 81MB zip → HTTP 500 "File too large"**（multer 硬编码 25MB + 默认 HTML 堆栈页）
   - 修：`memoryStorage(25MB)` → `diskStorage`、`MAX_UPLOAD_MB`（默认 1024）、
     express 错误中间件返回干净 JSON（413/400）、UI 解析 JSON 错误并重置卡住的面板。
   - 验证：上传 43,914,630 字节（41.9MB）zip → `stage:received`（修复前必 500）。
2. **大/病态文件上 Agent 跑过客户端超时、无终止事件 → UI 永久卡"分析中"**
   - 修：`ANALYZE_TIMEOUT_MS`（默认 300s）到点 abort 并下发终止
     `result(subtype=timeout)`（带已写出的部分报告）；prompt 加预算/采样约束；
     `MAX_TURNS` 默认 30。
   - 验证：90s 超时跑 41.9MB zip → curl 94s 返回（非挂死）、终止事件
     `{"type":"result","subtype":"timeout","isError":true,"durationMs":90000}`。

## 后续可选项（非阻断）

- `dev` 脚本可换 watch 模式（`tsx watch`），目前一次性 build+run。
- 大文件/并发场景可加 job 队列与速率限制。

## 提交

分支 `worktree-proof-console-web`，4 个原子提交：scaffold / lock / verifier-fixes / report。
凭据从不入库（`.env` 与 `workspace/` 已 gitignore，token 仅运行时由 run.sh 注入进程）。
