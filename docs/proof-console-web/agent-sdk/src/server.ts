/**
 * proof-console-web — drop any file, a Claude Agent SDK loop inspects it.
 *
 *   browser  --(multipart upload)-->  POST /analyze
 *                                        |
 *                                        v
 *                          per-job workspace/<id>/<file>
 *                                        |
 *                                        v
 *               query({ permissionMode: "bypassPermissions" })   <- MiniMax
 *                                        |
 *                 NDJSON stream  <-------+  (status / assistant / tool / result)
 *                                        |
 *                                        v
 *                       browser renders live log + final report
 *
 * Credentials come from the environment (ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL /
 * ANTHROPIC_MODEL). run.sh injects the MiniMax values; nothing is read from or
 * written to disk by this process.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const WORKSPACE = path.join(ROOT, "workspace");

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8920);
const MODEL = process.env.ANTHROPIC_MODEL ?? "MiniMax-M2.7-highspeed";
const BASE_URL = process.env.ANTHROPIC_BASE_URL ?? "(default anthropic)";
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 1024);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const ANALYZE_TIMEOUT_MS = Number(process.env.ANALYZE_TIMEOUT_MS ?? 300000);
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 30);

type JobRequest = Request & { jobId?: string; jobDir?: string };

// Disk storage: big log archives stream straight to the per-job dir instead of
// being buffered whole in RAM. jobId/jobDir are minted here, before the handler.
const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const jr = req as JobRequest;
      const jobId = randomUUID();
      const jobDir = path.join(WORKSPACE, jobId);
      jr.jobId = jobId;
      jr.jobDir = jobDir;
      mkdir(jobDir, { recursive: true }).then(
        () => cb(null, jobDir),
        (e: unknown) => cb(e instanceof Error ? e : new Error(String(e)), ""),
      );
    },
    filename(_req, file, cb) {
      const safe =
        path.basename(file.originalname).replace(/[^\w.\-]+/g, "_") || "upload.bin";
      cb(null, safe);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const app = express();
app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, model: MODEL, baseUrl: BASE_URL, hasKey: HAS_KEY, maxUploadMB: MAX_UPLOAD_MB });
});

/** One NDJSON event per line so the browser can read it incrementally. */
function send(res: Response, event: Record<string, unknown>): void {
  res.write(JSON.stringify(event) + "\n");
}

app.post(
  "/analyze",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const jr = req as JobRequest;
    const file = req.file;
    if (!file || !jr.jobDir) {
      res.status(400).json({ error: "no file uploaded (field name must be 'file')" });
      return;
    }
    if (!HAS_KEY) {
      res
        .status(500)
        .json({ error: "ANTHROPIC_API_KEY not set — start the server via ./run.sh" });
      return;
    }

    const jobDir = jr.jobDir;
    const safeName = file.filename; // already sanitized by the storage engine

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    send(res, {
      type: "status",
      stage: "received",
      jobId: jr.jobId,
      file: safeName,
      bytes: file.size,
      model: MODEL,
    });

    const bigMB = (file.size / 1048576).toFixed(1);
    const prompt = [
      `A user dropped a file named "${safeName}" (${file.size} bytes, ${bigMB} MB) into your working directory.`,
      `You do not know its format in advance — figure it out yourself.`,
      ``,
      `You have a STRICT budget: ~${Math.round(ANALYZE_TIMEOUT_MS / 1000)}s wall clock and ${MAX_TURNS} turns.`,
      `If the file is large, SAMPLE — never try to read or scan it whole. Use`,
      `\`file\`, \`head\`, \`tail\`, \`wc -l\`, \`unzip -l\`, random line samples, \`sqlite3 .schema\`.`,
      `Do not loop re-scanning the same content; one good pass beats ten partial ones.`,
      ``,
      `Do this:`,
      `1. Identify what it is (format, structure, size).`,
      `2. Pull representative samples + aggregate stats; note anything notable/risky.`,
      `3. ALWAYS write a self-contained "report.html" in the current directory BEFORE you`,
      `   finish — dark theme, no external/CDN assets, summary on top, then the real`,
      `   evidence you observed (real samples/stats — never invented). A partial report`,
      `   is mandatory; running out of budget with no report.html is a failure.`,
      `4. End your final text message with a 3-5 line plain-text executive summary.`,
      ``,
      `Be concise in chat; put the depth in report.html.`,
    ].join("\n");

    const abort = new AbortController();
    req.on("close", () => abort.abort());
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, ANALYZE_TIMEOUT_MS);

    try {
      const run = query({
        prompt,
        options: {
          cwd: jobDir,
          model: MODEL,
          permissionMode: "bypassPermissions",
          // bypassPermissions is inert without this companion flag — the SDK
          // only passes --allow-dangerously-skip-permissions when it is true.
          allowDangerouslySkipPermissions: true,
          allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit"],
          abortController: abort,
          maxTurns: MAX_TURNS,
        },
      });

      for await (const message of run) {
        if (message.type === "system" && message.subtype === "init") {
          send(res, { type: "status", stage: "agent-init", model: message.model });
        } else if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "text" && block.text.trim()) {
              send(res, { type: "assistant", text: block.text });
            } else if (block.type === "tool_use") {
              send(res, { type: "tool", name: block.name, input: block.input });
            }
          }
        } else if (message.type === "result") {
          const reportPath = path.join(jobDir, "report.html");
          const report = existsSync(reportPath)
            ? readFileSync(reportPath, "utf8")
            : null;
          send(res, {
            type: "result",
            subtype: message.subtype,
            isError: message.is_error,
            durationMs: message.duration_ms,
            costUsd: message.total_cost_usd ?? null,
            summary: message.subtype === "success" ? message.result : null,
            report,
          });
        }
      }
    } catch (err) {
      if (timedOut) {
        // Always give the client closure: ship whatever report.html exists.
        const reportPath = path.join(jobDir, "report.html");
        const report = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;
        send(res, {
          type: "result",
          subtype: "timeout",
          isError: true,
          durationMs: ANALYZE_TIMEOUT_MS,
          costUsd: null,
          summary: `分析超时（${Math.round(ANALYZE_TIMEOUT_MS / 1000)}s）。${
            report ? "已附上 Agent 在超时前写出的部分报告。" : "Agent 未能在超时前写出报告。"
          } 可加大 ANALYZE_TIMEOUT_MS 重试。`,
          report,
        });
      } else {
        send(res, { type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      clearTimeout(killer);
      res.end();
      // report.html was already inlined into the result event; drop the job dir.
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  },
);

// Multer (and any pre-handler) errors land here as clean JSON instead of
// Express's default HTML stack-trace page. The browser parses {error,code}.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const jr = req as JobRequest;
  if (jr.jobDir) void rm(jr.jobDir, { recursive: true, force: true }).catch(() => {});
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({
      error: tooBig
        ? `文件超过上限 ${MAX_UPLOAD_MB} MB。提高上限：MAX_UPLOAD_MB=4096 ./run.sh`
        : `上传错误：${err.message}`,
      code: err.code,
    });
    return;
  }
  res
    .status(500)
    .json({ error: err instanceof Error ? err.message : String(err), code: "INTERNAL" });
});

// Clear any job dirs orphaned by a previous crash before accepting traffic.
await rm(WORKSPACE, { recursive: true, force: true }).catch(() => {});

app.listen(PORT, HOST, () => {
  console.log(`proof-console-web → http://${HOST}:${PORT}`);
  console.log(`  model    = ${MODEL}`);
  console.log(`  base URL = ${BASE_URL}`);
  console.log(`  api key  = ${HAS_KEY ? "set" : "MISSING (use ./run.sh)"}`);
});
