#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_DATA = path.join(__dirname, "sample-data.json");

const ESC = "\x1b[";
const COLORS = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  inverse: `${ESC}7m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`
};

const args = process.argv.slice(2);
const options = {
  data: valueAfter("--data") || DEFAULT_DATA,
  html: valueAfter("--html"),
  demo: args.includes("--demo"),
  once: args.includes("--once")
};

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function readData(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const data = readData(options.data);

if (options.html) {
  fs.writeFileSync(options.html, renderHtmlPreview(data));
  console.log(`WROTE:${options.html}`);
  process.exit(0);
}

const state = {
  selectedUser: 0,
  selectedPrompt: 0,
  activePane: "users",
  repoFilter: "All",
  detail: false,
  help: false,
  status: "Ready: use arrows, tab, enter, f, r, h, q."
};

const repos = ["All", ...Array.from(new Set(data.prs.map((pr) => pr.repo)))];

function clear() {
  process.stdout.write(`${ESC}?25l${ESC}2J${ESC}H`);
}

function showCursor() {
  process.stdout.write(`${ESC}?25h${COLORS.reset}`);
}

function stripAnsi(input) {
  return input.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function widthOf(input) {
  return stripAnsi(input).length;
}

function fit(input, width) {
  const raw = stripAnsi(input);
  if (raw.length <= width) return input + " ".repeat(width - raw.length);
  return raw.slice(0, Math.max(0, width - 1)) + ">";
}

function box(title, lines, width, height, active = false) {
  const head = active ? `${COLORS.cyan}${title}${COLORS.reset}` : title;
  const top = `+-- ${fit(head, width - 7)}--+`;
  const body = [];
  const usable = height - 2;
  for (let i = 0; i < usable; i += 1) {
    body.push(`| ${fit(lines[i] || "", width - 4)} |`);
  }
  return [top, ...body, `+${"-".repeat(width - 2)}+`];
}

function selectedUser() {
  return data.users[state.selectedUser];
}

function selectedPrompt() {
  const user = selectedUser();
  return user.prompts[Math.min(state.selectedPrompt, user.prompts.length - 1)];
}

function promptPrs(prompt = selectedPrompt()) {
  return data.prs.filter((pr) => prompt.linked_prs.includes(pr.id));
}

function filteredPrs() {
  const promptIds = selectedUser().prompts.flatMap((prompt) => prompt.linked_prs);
  return data.prs.filter((pr) => promptIds.includes(pr.id) && (state.repoFilter === "All" || pr.repo === state.repoFilter));
}

function userLines() {
  return data.users.flatMap((user, index) => {
    const userPrs = data.prs.filter((pr) =>
      user.prompts.some((prompt) => prompt.linked_prs.includes(pr.id))
    );
    const prompts = user.prompts.length;
    const reposTouched = new Set(userPrs.map((pr) => pr.repo)).size;
    const selector = index === state.selectedUser ? `${COLORS.inverse}>` : " ";
    return [
      `${selector} ${user.name} ${COLORS.dim}${user.role}${COLORS.reset}`,
      `  prompts ${prompts}   merged PRs ${userPrs.length}   repos ${reposTouched}`,
      `  focus ${user.repo_focus.join(", ")}`,
      ""
    ];
  });
}

function promptLines() {
  const user = selectedUser();
  return user.prompts.flatMap((prompt, index) => {
    const active = index === state.selectedPrompt;
    const marker = active ? `${COLORS.inverse}>` : " ";
    const prCount = prompt.linked_prs.length;
    const signals = prompt.signals.join(" / ");
    return [
      `${marker} ${prompt.id} ${COLORS.green}${prompt.intent}${COLORS.reset}`,
      `  ${prompt.text}`,
      `  signals ${signals}`,
      `  merged PR evidence ${prCount}`,
      ""
    ];
  });
}

function repoLines() {
  const rows = filteredPrs();
  if (!rows.length) return ["No PRs for current filter."];
  return rows.flatMap((pr) => [
    `${COLORS.yellow}${pr.repo} #${pr.number}${COLORS.reset} ${pr.title}`,
    `  by ${pr.author}   merged ${pr.merged_at.slice(0, 10)}   ${pr.id}`,
    `  ${pr.impact}`,
    `  evidence ${pr.evidence.join(" / ")}`,
    ""
  ]);
}

function insightLines() {
  const user = selectedUser();
  const prompt = selectedPrompt();
  const prs = promptPrs(prompt);
  const repoNames = Array.from(new Set(prs.map((pr) => pr.repo))).join(", ");
  const signals = Array.from(new Set(user.prompts.flatMap((item) => item.signals)));
  const conversion = prs.length ? "prompt -> merged PR evidence exists" : "no linked merge";
  return [
    `${COLORS.bold}${data.feature.id}: ${data.feature.name}${COLORS.reset}`,
    data.feature.question,
    "",
    `Current user: ${user.name} (${user.role})`,
    `Current prompt: ${prompt.id} / ${prompt.intent}`,
    `Evidence repos: ${repoNames || "none"}`,
    `Conversion: ${conversion}`,
    "",
    `${COLORS.cyan}Usage read${COLORS.reset}`,
    `This is not a fixed CEO HTML summary. It is a prompt-to-merge console:`,
    `UserSubmitPrompt text -> intent/signals -> merged PRs -> repo evidence.`,
    "",
    `${COLORS.cyan}Dominant signals${COLORS.reset}`,
    signals.map((signal) => `- ${signal}`).join("\n"),
    "",
    `${COLORS.cyan}Selected outcome${COLORS.reset}`,
    prompt.outcome
  ].join("\n").split("\n");
}

function detailLines() {
  const prompt = selectedPrompt();
  const prs = promptPrs(prompt);
  return [
    `${COLORS.bold}Prompt detail${COLORS.reset}`,
    `${prompt.id}  ${prompt.timestamp}`,
    "",
    prompt.text,
    "",
    `${COLORS.bold}Outcome${COLORS.reset}`,
    prompt.outcome,
    "",
    `${COLORS.bold}Merged PRs${COLORS.reset}`,
    ...prs.flatMap((pr) => [
      `${pr.repo} #${pr.number}: ${pr.title}`,
      `  merged_at: ${pr.merged_at}`,
      `  impact: ${pr.impact}`,
      `  evidence: ${pr.evidence.join(", ")}`,
      ""
    ])
  ];
}

function helpLines() {
  return [
    `${COLORS.bold}Keys${COLORS.reset}`,
    "up/down or j/k: move in current pane",
    "tab: switch users/prompts pane",
    "enter: open/close prompt detail",
    "f: cycle repo filter",
    "r: reset user/prompt/filter",
    "h: help",
    "q: quit",
    "",
    `${COLORS.bold}Data contract${COLORS.reset}`,
    "Replace sample-data.json with exported UserSubmitPrompt rows and merged PR rows.",
    "Keep stable ids: prompt.linked_prs[] must reference prs[].id.",
    "The TUI never claims proof without a merged PR evidence row."
  ];
}

function render() {
  const columns = Math.max(100, process.stdout.columns || 120);
  const rows = Math.max(32, process.stdout.rows || 36);
  const leftW = Math.floor(columns * 0.31);
  const midW = Math.floor(columns * 0.34);
  const rightW = columns - leftW - midW - 2;
  const topH = rows - 8;
  const bottomH = 6;
  const header = `${COLORS.bold}${COLORS.cyan}PROOF CONSOLE TUI${COLORS.reset}  ${data.feature.id}  ${COLORS.dim}${data.generated_at}  data=${data.mode}${COLORS.reset}`;
  const sub = `Filter: repo=${state.repoFilter}   Pane=${state.activePane}   ${state.status}`;
  const left = box("Users", userLines(), leftW, topH, state.activePane === "users");
  const mid = box("UserSubmitPrompt", state.detail ? detailLines() : promptLines(), midW, topH, state.activePane === "prompts");
  const right = box(state.help ? "Help" : "Merged PR Evidence", state.help ? helpLines() : repoLines(), rightW, topH, false);
  const bottom = box("Analysis", insightLines(), columns, bottomH, false);

  clear();
  process.stdout.write(`${fit(header, columns)}\n${fit(sub, columns)}\n`);
  for (let i = 0; i < topH; i += 1) {
    process.stdout.write(`${left[i]} ${mid[i]} ${right[i]}\n`);
  }
  process.stdout.write(bottom.join("\n"));
}

function move(delta) {
  if (state.activePane === "users") {
    state.selectedUser = clamp(state.selectedUser + delta, 0, data.users.length - 1);
    state.selectedPrompt = 0;
  } else {
    const max = selectedUser().prompts.length - 1;
    state.selectedPrompt = clamp(state.selectedPrompt + delta, 0, max);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function handleKey(chunk) {
  const key = chunk.toString("utf8");
  if (key === "q" || key === "\u0003") quit();
  if (key === "\t") state.activePane = state.activePane === "users" ? "prompts" : "users";
  if (key === "h") state.help = !state.help;
  if (key === "\r") state.detail = !state.detail;
  if (key === "r") {
    state.selectedUser = 0;
    state.selectedPrompt = 0;
    state.repoFilter = "All";
    state.detail = false;
    state.help = false;
  }
  if (key === "f") {
    const next = (repos.indexOf(state.repoFilter) + 1) % repos.length;
    state.repoFilter = repos[next];
  }
  if (key === "j" || key === `${ESC}B`) move(1);
  if (key === "k" || key === `${ESC}A`) move(-1);
  render();
}

function quit() {
  showCursor();
  process.stdout.write("\n");
  process.exit(0);
}

function runDemo() {
  const steps = [
    ["j", 650],
    ["\t", 650],
    ["j", 650],
    ["\r", 1000],
    ["f", 650],
    ["f", 650],
    ["h", 1000],
    ["h", 650],
    ["q", 300]
  ];
  let offset = 700;
  for (const [key, delay] of steps) {
    offset += delay;
    setTimeout(() => handleKey(Buffer.from(key)), offset);
  }
}

function main() {
  process.on("exit", showCursor);
  process.on("SIGINT", quit);
  render();
  if (options.once) quit();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", handleKey);
  }
  if (options.demo) runDemo();
}

function renderHtmlPreview(input) {
  const repoCounts = input.prs.reduce((acc, pr) => {
    acc[pr.repo] = (acc[pr.repo] || 0) + 1;
    return acc;
  }, {});
  const cards = input.users.map((user) => {
    const prIds = new Set(user.prompts.flatMap((prompt) => prompt.linked_prs));
    return `<section><h2>${escapeHtml(user.name)}</h2><p>${escapeHtml(user.role)}</p><strong>${user.prompts.length}</strong> prompts <strong>${prIds.size}</strong> merged PRs</section>`;
  }).join("");
  const repoRows = Object.entries(repoCounts).map(([repo, count]) => `<li>${escapeHtml(repo)}: ${count} merged PRs</li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proof Console TUI Design Preview</title>
<style>
body{margin:0;background:#101418;color:#e7edf2;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
main{max-width:1120px;margin:0 auto;padding:32px}
.term{border:1px solid #3a4652;background:#141b22;padding:18px;box-shadow:0 18px 60px #0008}
.grid{display:grid;grid-template-columns:1fr 1.1fr 1.2fr;gap:12px}
section{border:1px solid #34414d;padding:14px;min-height:150px}
h1,h2{margin:0 0 10px}.accent{color:#6ee7f9}.muted{color:#90a1ad}
</style>
</head>
<body><main>
<p class="muted">Design preview only. The report surface is the terminal TUI.</p>
<div class="term">
<h1><span class="accent">PROOF CONSOLE TUI</span> ${escapeHtml(input.feature.id)}</h1>
<p>${escapeHtml(input.feature.question)}</p>
<div class="grid">${cards}<section><h2>Repos</h2><ul>${repoRows}</ul></section></div>
</div>
</main></body></html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

main();
