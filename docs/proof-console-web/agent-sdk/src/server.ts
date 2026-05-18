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
import express, { type Request, type Response } from "express";
import multer from "multer";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, model: MODEL, baseUrl: BASE_URL, hasKey: HAS_KEY });
});

/** One NDJSON event per line so the browser can read it incrementally. */
function send(res: Response, event: Record<string, unknown>): void {
  res.write(JSON.stringify(event) + "\n");
}

app.post(
  "/analyze",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "no file uploaded (field name must be 'file')" });
      return;
    }
    if (!HAS_KEY) {
      res
        .status(500)
        .json({ error: "ANTHROPIC_API_KEY not set — start the server via ./run.sh" });
      return;
    }

    const jobId = randomUUID();
    const jobDir = path.join(WORKSPACE, jobId);
    // multer/express may not preserve unicode names; keep a safe basename.
    const safeName = path.basename(file.originalname).replace(/[^\w.\-]+/g, "_") || "upload.bin";
    const filePath = path.join(jobDir, safeName);

    await mkdir(jobDir, { recursive: true });
    await writeFile(filePath, file.buffer);

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    send(res, {
      type: "status",
      stage: "received",
      jobId,
      file: safeName,
      bytes: file.size,
      model: MODEL,
    });

    const prompt = [
      `A user dropped a file named "${safeName}" (${file.size} bytes) into your working directory.`,
      `You do not know its format in advance — figure it out yourself.`,
      ``,
      `Do this:`,
      `1. Inspect the file using whatever tools fit (Read, Bash for \`file\`/\`head\`/\`unzip -l\`/\`sqlite3\`, Grep, etc.).`,
      `2. Determine what it is, what it contains, and anything notable, risky, or interesting.`,
      `3. Write a self-contained interactive report to "report.html" in the current directory:`,
      `   dark theme, no external network/CDN assets, a summary up top, then the evidence`,
      `   you actually observed (real samples/stats from the file — never invented).`,
      `4. End your final text message with a 3-5 line plain-text executive summary.`,
      ``,
      `Be concise in chat; put the depth in report.html.`,
    ].join("\n");

    const abort = new AbortController();
    req.on("close", () => abort.abort());

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
          maxTurns: 40,
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
      send(res, { type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
      // report.html was already inlined into the result event; drop the job dir.
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  },
);

// Clear any job dirs orphaned by a previous crash before accepting traffic.
await rm(WORKSPACE, { recursive: true, force: true }).catch(() => {});

app.listen(PORT, HOST, () => {
  console.log(`proof-console-web → http://${HOST}:${PORT}`);
  console.log(`  model    = ${MODEL}`);
  console.log(`  base URL = ${BASE_URL}`);
  console.log(`  api key  = ${HAS_KEY ? "set" : "MISSING (use ./run.sh)"}`);
});
