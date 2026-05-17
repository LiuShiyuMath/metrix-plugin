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
  dashboard: valueAfter("--dashboard"),
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

if (options.dashboard) {
  fs.writeFileSync(options.dashboard, renderDashboard(data));
  console.log(`WROTE:${options.dashboard}`);
  process.exit(0);
}

const state = {
  selectedUser: 0,
  selectedPrompt: 0,
  activePane: "users",
  repoFilter: "All",
  analysisMode: "Report",
  detail: false,
  help: false,
  status: "Ready: arrows, tab, enter, m, f, r, h, q."
};

const repos = ["All", ...Array.from(new Set(data.prs.map((pr) => pr.repo)))];
const analysisModes = ["Report", "Dive", "Map"];

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

function allPrompts() {
  return data.users.flatMap((user) => user.prompts.map((prompt) => ({ user, prompt })));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function topSignals() {
  return Object.entries(countBy(allPrompts().flatMap(({ prompt }) => prompt.signals)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function repoCoverage() {
  return data.prs.map((pr) => {
    const linkedPrompts = allPrompts().filter(({ prompt }) => prompt.linked_prs.includes(pr.id));
    return { pr, linkedPrompts };
  });
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
  if (state.analysisMode === "Dive") return diveLines();
  if (state.analysisMode === "Map") return mapLines();
  return reportLines();
}

function reportLines() {
  const user = selectedUser();
  const prompt = selectedPrompt();
  const prs = promptPrs(prompt);
  const repoNames = Array.from(new Set(prs.map((pr) => pr.repo))).join(", ");
  const signals = Array.from(new Set(user.prompts.flatMap((item) => item.signals)));
  const conversion = prs.length ? "prompt -> merged PR evidence exists" : "no linked merge";
  const promptTotal = allPrompts().length;
  const repoTotal = new Set(data.prs.map((pr) => pr.repo)).size;
  return [
    `${COLORS.bold}${data.feature.id}: ${data.feature.name}${COLORS.reset}`,
    data.feature.question,
    `Scope: ${data.users.length} Claude Code users / ${promptTotal} UserSubmitPrompt rows / ${data.prs.length} merged PRs / ${repoTotal} repos`,
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

function diveLines() {
  const user = selectedUser();
  const prompt = selectedPrompt();
  const prs = promptPrs(prompt);
  return [
    `${COLORS.bold}Dive path${COLORS.reset}`,
    `${user.name} -> ${prompt.id} -> ${prs.length} merged PR evidence rows`,
    "",
    `${COLORS.cyan}UserSubmitPrompt${COLORS.reset}`,
    prompt.text,
    "",
    `${COLORS.cyan}Intent and signals${COLORS.reset}`,
    `intent: ${prompt.intent}`,
    `signals: ${prompt.signals.join(" / ")}`,
    "",
    `${COLORS.cyan}Merged PR proof${COLORS.reset}`,
    ...prs.flatMap((pr) => [
      `${pr.repo} #${pr.number} ${pr.title}`,
      `impact: ${pr.impact}`,
      `evidence: ${pr.evidence.join(" / ")}`
    ]),
    "",
    `${COLORS.cyan}Analyst note${COLORS.reset}`,
    "The console treats merged PRs as evidence rows, not as decoration.",
    "A prompt without linked merged PRs stays visible but does not become proof."
  ];
}

function mapLines() {
  const promptTotal = allPrompts().length;
  const repoCounts = countBy(data.prs.map((pr) => pr.repo));
  const repoSummary = Object.entries(repoCounts)
    .map(([repo, count]) => `${repo} ${count}`)
    .join(" / ");
  const signalSummary = topSignals()
    .slice(0, 5)
    .map(([signal, count]) => `${signal} ${count}`)
    .join(" / ");
  return [
    `${COLORS.bold}Usage map${COLORS.reset}`,
    `${data.users.length} users  ${promptTotal} prompts  ${data.prs.length} merged PRs`,
    "",
    `${COLORS.cyan}Repo proof coverage${COLORS.reset}`,
    repoSummary,
    "",
    `${COLORS.cyan}Signal clusters${COLORS.reset}`,
    signalSummary,
    "",
    `${COLORS.cyan}Prompt -> PR map${COLORS.reset}`,
    ...repoCoverage().flatMap(({ pr, linkedPrompts }) => [
      `${pr.repo} #${pr.number} <= ${linkedPrompts.map(({ prompt }) => prompt.id).join(", ") || "unlinked"}`
    ])
  ];
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
    "m: switch analysis mode: report/dive/map",
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
  const topH = rows - 10;
  const bottomH = 8;
  const header = `${COLORS.bold}${COLORS.cyan}PROOF CONSOLE TUI${COLORS.reset}  ${data.feature.id}  ${COLORS.dim}${data.generated_at}  data=${data.mode}${COLORS.reset}`;
  const sub = `Filter: repo=${state.repoFilter}   Pane=${state.activePane}   Mode=${state.analysisMode}   ${state.status}`;
  const left = box("Users", userLines(), leftW, topH, state.activePane === "users");
  const mid = box("UserSubmitPrompt", state.detail ? detailLines() : promptLines(), midW, topH, state.activePane === "prompts");
  const rightTitle = state.help ? "Help" : `Merged PR Evidence: ${state.repoFilter}`;
  const right = box(rightTitle, state.help ? helpLines() : repoLines(), rightW, topH, false);
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
  if (key === "m") {
    const next = (analysisModes.indexOf(state.analysisMode) + 1) % analysisModes.length;
    state.analysisMode = analysisModes[next];
  }
  if (key === "r") {
    state.selectedUser = 0;
    state.selectedPrompt = 0;
    state.repoFilter = "All";
    state.analysisMode = "Report";
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
    ["m", 650],
    ["\r", 1000],
    ["m", 650],
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
  const promptCount = input.users.reduce((count, user) => count + user.prompts.length, 0);
  const signalRows = Object.entries(countBy(input.users.flatMap((user) => user.prompts.flatMap((prompt) => prompt.signals))))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([signal, count]) => `<li>${escapeHtml(signal)} <b>${count}</b></li>`)
    .join("");
  const cards = input.users.map((user) => {
    const prIds = new Set(user.prompts.flatMap((prompt) => prompt.linked_prs));
    const intents = user.prompts.map((prompt) => `<li>${escapeHtml(prompt.intent)}</li>`).join("");
    return `<section><h2>${escapeHtml(user.name)}</h2><p>${escapeHtml(user.role)}</p><strong>${user.prompts.length}</strong> prompts <strong>${prIds.size}</strong> merged PRs<ul>${intents}</ul></section>`;
  }).join("");
  const repoRows = Object.entries(repoCounts).map(([repo, count]) => `<li>${escapeHtml(repo)}: ${count} merged PRs</li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proof Console TUI Design Preview</title>
<style>
body{margin:0;background:#0c1116;color:#e7edf2;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
main{max-width:1180px;margin:0 auto;padding:32px}
.term{border:1px solid #3a4652;background:#121a22;padding:18px;box-shadow:0 18px 60px #0008}
.bar{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #303b45;padding-bottom:12px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:1fr 1.15fr 1.25fr;gap:12px}
section{border:1px solid #34414d;padding:14px;min-height:172px}
h1,h2{margin:0 0 10px}.accent{color:#6ee7f9}.muted{color:#90a1ad}.good{color:#86efac}
ul{padding-left:18px}.analysis{margin-top:12px;border-color:#596775}.kbd{color:#facc15}
</style>
</head>
<body><main>
<p class="muted">Design preview only. The report surface is the terminal TUI.</p>
<div class="term">
<div class="bar"><h1><span class="accent">PROOF CONSOLE TUI</span> ${escapeHtml(input.feature.id)}</h1><span class="muted">mode=<span class="kbd">report/dive/map</span></span></div>
<p>${escapeHtml(input.feature.question)}</p>
<p class="good">${input.users.length} users / ${promptCount} UserSubmitPrompt rows / ${input.prs.length} merged PRs / ${Object.keys(repoCounts).length} repos</p>
<div class="grid">${cards}<section><h2>Repos</h2><ul>${repoRows}</ul><h2>Signals</h2><ul>${signalRows}</ul></section></div>
<section class="analysis"><h2>Analysis Pane</h2><p>UserSubmitPrompt -> intent/signals -> merged PR evidence. HTML is only a preview; the operator dives in with the TUI.</p></section>
</div>
</main></body></html>
`;
}

function renderDashboard(input) {
  const json = JSON.stringify(input).replace(/</g, "\\u003c");
  const featureName = escapeHtml(input.feature.name);
  const featureQuestion = escapeHtml(input.feature.question);
  const featureId = escapeHtml(input.feature.id);
  const generatedAt = escapeHtml(input.generated_at);
  const dataMode = escapeHtml(input.mode);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${featureName} · 证据控制台</title>
<meta name="description" content="proof-console 用量分析仪表盘：UserSubmitPrompt 到已合并 PR 的人看版。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1" integrity="sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ" crossorigin="anonymous"></script>
<style>
:root{
  --bg:#080b10;--bg2:#0b0f15;--panel:#10161f;--panel2:#141b26;
  --hair:#1d2630;--hair2:#2a3543;--hair3:#3a4757;
  --txt:#eaf0f6;--txt2:#a4b1c0;--txt3:#6c7a8a;--txt4:#46525f;
  --az:#56b6ff;--azd:#1f5f8f;--lime:#9ae66e;--coral:#ff8a6b;--gold:#f5c451;
  --azglow:rgba(86,182,255,.32);
  --mono:'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --disp:'Sora','Noto Sans SC',system-ui,sans-serif;
  --cjk:'Noto Sans SC','PingFang SC',system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--txt);font-family:var(--cjk);
  font-weight:300;font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased;
  background-image:
    radial-gradient(120% 65% at 50% -8%,rgba(86,182,255,.07),transparent 55%),
    radial-gradient(90% 50% at 92% 4%,rgba(154,230,110,.04),transparent 60%);
  background-attachment:fixed}
.app{max-width:1320px;margin:0 auto;padding:clamp(1rem,3vw,2rem) clamp(1rem,3vw,2.2rem) 3rem}

/* topbar */
.topbar{display:flex;flex-direction:column;gap:1.1rem;
  border:1px solid var(--hair2);border-radius:14px;
  background:linear-gradient(180deg,var(--panel2),var(--panel));
  padding:1.3rem 1.5rem;margin-bottom:1.2rem;position:relative;overflow:hidden}
.topbar::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.012) 39px 40px);
  mask-image:linear-gradient(90deg,#000,transparent 70%)}
.brand{display:flex;align-items:center;gap:.95rem}
.logo{width:34px;height:34px;border-radius:9px;flex:none;position:relative;
  background:radial-gradient(circle at 35% 30%,var(--az),var(--azd));
  box-shadow:0 0 0 1px rgba(86,182,255,.4),0 0 22px -4px var(--azglow)}
.logo::after{content:"";position:absolute;inset:9px;border-radius:50%;
  border:2px solid rgba(8,11,16,.85)}
.kicker{font-family:var(--mono);font-size:10.5px;letter-spacing:.28em;
  text-transform:uppercase;color:var(--az);margin:0 0 .25rem}
h1{font-family:var(--disp);font-weight:800;font-size:clamp(1.4rem,3.4vw,2.05rem);
  margin:0;letter-spacing:-.02em;line-height:1.05;color:#f6f9fc}
.question{font-family:var(--disp);font-weight:500;color:var(--txt2);
  font-size:clamp(.98rem,2vw,1.12rem);margin:0;letter-spacing:-.005em;
  border-left:3px solid var(--az);padding-left:.85rem;line-height:1.45}
.filters{display:flex;gap:.7rem;flex-wrap:wrap;align-items:flex-end;
  border-top:1px solid var(--hair);padding-top:1.05rem}
.fg{display:flex;flex-direction:column;gap:.34rem}
.fg label{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--txt3)}
.fg select{appearance:none;font:inherit;font-size:13px;color:var(--txt);
  background:var(--bg2);border:1px solid var(--hair2);border-radius:8px;
  padding:.5rem 2rem .5rem .8rem;min-width:148px;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--txt3) 50%),
    linear-gradient(135deg,var(--txt3) 50%,transparent 50%);
  background-position:right 1rem center,right .72rem center;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;transition:.16s}
.fg select:hover{border-color:var(--hair3)}
.fg select:focus{outline:none;border-color:var(--az);
  box-shadow:0 0 0 3px rgba(86,182,255,.14)}
#reset{font:inherit;font-size:12px;font-family:var(--mono);letter-spacing:.05em;
  color:var(--txt2);background:transparent;border:1px solid var(--hair2);
  border-radius:8px;padding:.56rem .9rem;cursor:pointer;transition:.16s}
#reset:hover{border-color:var(--az);color:var(--az)}
.spacer{flex:1}
.stamp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  color:var(--lime);display:flex;align-items:center;gap:.45rem;align-self:flex-end;
  padding-bottom:.5rem}
.stamp::before{content:"";width:6px;height:6px;border-radius:50%;
  background:var(--lime);box-shadow:0 0 8px rgba(154,230,110,.6)}

/* kpi */
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:.85rem;margin-bottom:1.05rem}
@media(max-width:920px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{border:1px solid var(--hair2);border-radius:13px;padding:1.05rem 1.15rem;
  background:linear-gradient(180deg,var(--panel2),var(--panel));position:relative;
  overflow:hidden}
.kpi::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
  background:linear-gradient(90deg,var(--az),transparent 75%);opacity:.5}
.kpi.lime::after{background:linear-gradient(90deg,var(--lime),transparent 75%)}
.kpi .l{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--txt3);margin:0 0 .55rem}
.kpi .n{font-family:var(--disp);font-weight:800;font-size:2.05rem;
  line-height:1;color:#f6f9fc;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums}
.kpi .s{font-size:11.5px;color:var(--txt3);margin:.5rem 0 0;font-family:var(--mono)}
.kpi .n .u{font-family:var(--mono);font-size:.9rem;font-weight:500;
  color:var(--txt3);margin-left:.3rem}
.kpi.lime .n{color:var(--lime)}

/* charts */
.charts{display:grid;grid-template-columns:1fr 1fr;gap:.85rem;margin-bottom:1.05rem}
@media(max-width:920px){.charts{grid-template-columns:1fr}}
.card{border:1px solid var(--hair2);border-radius:13px;
  background:linear-gradient(180deg,var(--panel2),var(--panel));
  padding:1.1rem 1.2rem 1.15rem;display:flex;flex-direction:column}
.card h3{font-family:var(--disp);font-weight:600;font-size:13px;
  letter-spacing:.02em;color:var(--txt);margin:0 0 .15rem;
  display:flex;align-items:center;gap:.5rem}
.card h3::before{content:"";width:7px;height:7px;border-radius:2px;
  background:var(--az);box-shadow:0 0 7px var(--azglow)}
.card .sub{font-family:var(--mono);font-size:10px;letter-spacing:.04em;
  color:var(--txt3);margin:0 0 .85rem;padding-left:1rem}
.cv{position:relative;flex:1;min-height:208px}
.cv canvas{position:absolute;inset:0}

/* table */
.tablewrap{border:1px solid var(--hair2);border-radius:13px;overflow:hidden;
  background:linear-gradient(180deg,var(--panel2),var(--panel))}
.tablehead{display:flex;align-items:baseline;gap:.7rem;
  padding:1rem 1.25rem .85rem;border-bottom:1px solid var(--hair)}
.tablehead h3{font-family:var(--disp);font-weight:600;font-size:13px;margin:0;color:var(--txt)}
.tablehead .c{font-family:var(--mono);font-size:11px;color:var(--txt3)}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--txt3);text-align:left;
  padding:.7rem 1rem;background:var(--bg2);border-bottom:1px solid var(--hair2);
  white-space:nowrap;position:sticky;top:0}
thead th.sortable{cursor:pointer;user-select:none;transition:.15s}
thead th.sortable:hover{color:var(--az)}
thead th .ar{color:var(--az);margin-left:.3rem;font-size:8px}
tbody td{padding:.7rem 1rem;border-bottom:1px solid var(--hair);
  vertical-align:top;color:var(--txt2)}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:rgba(86,182,255,.04)}
td .uname{font-family:var(--disp);font-weight:600;color:var(--txt);font-size:13px}
td .urole{font-family:var(--mono);font-size:10px;color:var(--txt3)}
td.id{font-family:var(--mono);font-size:11.5px;color:var(--az);white-space:nowrap}
td.ts{font-family:var(--mono);font-size:11px;color:var(--txt3);white-space:nowrap}
td .intent{color:var(--txt);font-weight:500}
.sig{display:inline-block;font-family:var(--mono);font-size:10px;
  color:var(--txt2);border:1px solid var(--hair2);border-radius:999px;
  padding:.12rem .5rem;margin:.12rem .22rem .12rem 0;white-space:nowrap}
.pr{display:inline-flex;align-items:center;gap:.32rem;font-family:var(--mono);
  font-size:10.5px;color:var(--lime);border:1px solid rgba(154,230,110,.28);
  background:rgba(154,230,110,.06);border-radius:6px;
  padding:.16rem .5rem;margin:.13rem .25rem .13rem 0;white-space:nowrap}
.pr.none{color:var(--txt4);border-color:var(--hair);background:transparent}
.empty{padding:2.4rem 1.25rem;text-align:center;color:var(--txt3);
  font-family:var(--mono);font-size:12px}

footer{margin-top:1.4rem;font-family:var(--mono);font-size:10.5px;
  color:var(--txt3);letter-spacing:.03em;line-height:1.9;
  border-top:1px solid var(--hair);padding-top:1rem}
footer code{color:var(--az);background:rgba(86,182,255,.06);
  border:1px solid var(--hair2);border-radius:4px;padding:1px 6px;font-size:.92em}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        <p class="kicker">PROOF CONSOLE · 用量分析 · ${featureId}</p>
        <h1>${featureName}</h1>
      </div>
    </div>
    <p class="question">${featureQuestion}</p>
    <div class="filters">
      <div class="fg"><label>用户</label><select id="f-user"></select></div>
      <div class="fg"><label>仓库</label><select id="f-repo"></select></div>
      <div class="fg"><label>信号</label><select id="f-signal"></select></div>
      <button id="reset">重置筛选</button>
      <span class="spacer"></span>
      <span class="stamp">仅已合并 PR 计为证据</span>
    </div>
  </header>

  <section class="kpis" id="kpis"></section>

  <section class="charts">
    <div class="card"><h3>各仓库已合并 PR 证据</h3><p class="sub">distinct merged PRs / repo</p><div class="cv"><canvas id="c-repo"></canvas></div></div>
    <div class="card"><h3>各用户 UserSubmitPrompt</h3><p class="sub">prompt rows / user</p><div class="cv"><canvas id="c-user"></canvas></div></div>
    <div class="card"><h3>Top 信号</h3><p class="sub">signal frequency across prompts</p><div class="cv"><canvas id="c-signal"></canvas></div></div>
    <div class="card"><h3>已合并 PR 时间线（累计）</h3><p class="sub">cumulative merged PRs by merge date</p><div class="cv"><canvas id="c-time"></canvas></div></div>
  </section>

  <div class="tablewrap">
    <div class="tablehead">
      <h3>证据明细</h3>
      <span class="c" id="rowcount"></span>
    </div>
    <div class="scroll"><table id="tbl"></table></div>
  </div>

  <footer>
    数据时点 <b>${generatedAt}</b> · 模式 <b>${dataMode}</b> · 复现：<code>node docs/proof-console-tui/proof-console-tui.mjs --dashboard out.html</code><br>
    单文件自包含 · Chart.js 4.5.1 (CDN) · <code>--html</code> 静态预览契约未改动，本视图是新增的 <code>--dashboard</code> 出口。
  </footer>
</div>

<script>
"use strict";
var DATA = ${json};
var PAL = ["#56b6ff","#9ae66e","#ff8a6b","#f5c451","#a98bff","#4fd1c5"];
var GRID = "rgba(255,255,255,0.05)";
var TICK = "#6c7a8a";

if (window.Chart) {
  Chart.defaults.color = TICK;
  Chart.defaults.font.family = "IBM Plex Mono, ui-monospace, monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.borderColor = GRID;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    Chart.defaults.animation = false;
  } else {
    Chart.defaults.animation = { duration: 480, easing: "easeOutQuart" };
  }
}

function prById() {
  var m = {};
  DATA.prs.forEach(function (p) { m[p.id] = p; });
  return m;
}
var PRMAP = prById();

// flat prompt rows with resolved merged PRs
function flatPrompts() {
  var rows = [];
  DATA.users.forEach(function (u) {
    u.prompts.forEach(function (pr) {
      var merged = (pr.linked_prs || []).map(function (id) { return PRMAP[id]; }).filter(Boolean);
      rows.push({
        userId: u.id, userName: u.name, role: u.role,
        promptId: pr.id, ts: pr.timestamp, intent: pr.intent,
        text: pr.text, signals: pr.signals || [], outcome: pr.outcome,
        merged: merged
      });
    });
  });
  return rows;
}
var ALL = flatPrompts();
var ALL_SIGNALS = (function () {
  var s = {};
  ALL.forEach(function (r) { r.signals.forEach(function (x) { s[x] = 1; }); });
  return Object.keys(s).sort();
})();
var ALL_REPOS = (function () {
  var s = {};
  DATA.prs.forEach(function (p) { s[p.repo] = 1; });
  return Object.keys(s).sort();
})();

var state = { user: "all", repo: "all", signal: "all", sortKey: "ts", sortDir: "asc" };

// prompt passes user + signal; repo filter requires >=1 merged pr in that repo
function viewRows() {
  return ALL.filter(function (r) {
    if (state.user !== "all" && r.userId !== state.user) return false;
    if (state.signal !== "all" && r.signals.indexOf(state.signal) < 0) return false;
    if (state.repo !== "all") {
      var hit = r.merged.some(function (p) { return p.repo === state.repo; });
      if (!hit) return false;
    }
    return true;
  });
}
// merged PRs visible for a row, repo-scoped when a repo filter is on
function rowPrs(r) {
  if (state.repo === "all") return r.merged;
  return r.merged.filter(function (p) { return p.repo === state.repo; });
}
function distinctPrs(rows) {
  var seen = {}, out = [];
  rows.forEach(function (r) {
    rowPrs(r).forEach(function (p) {
      if (!seen[p.id]) { seen[p.id] = 1; out.push(p); }
    });
  });
  return out;
}

function el(id) { return document.getElementById(id); }

function fillSelect(id, label, values, current) {
  var sel = el(id);
  var html = '<option value="all">' + label + '</option>';
  values.forEach(function (v) {
    var lbl = v.label !== undefined ? v.label : v;
    var val = v.value !== undefined ? v.value : v;
    html += '<option value="' + val + '"' + (val === current ? " selected" : "") + ">" + lbl + "</option>";
  });
  sel.innerHTML = html;
}

function setupFilters() {
  fillSelect("f-user", "全部用户 (" + DATA.users.length + ")",
    DATA.users.map(function (u) { return { value: u.id, label: u.name }; }), state.user);
  fillSelect("f-repo", "全部仓库 (" + ALL_REPOS.length + ")", ALL_REPOS, state.repo);
  fillSelect("f-signal", "全部信号 (" + ALL_SIGNALS.length + ")", ALL_SIGNALS, state.signal);
  el("f-user").onchange = function () { state.user = this.value; apply(); };
  el("f-repo").onchange = function () { state.repo = this.value; apply(); };
  el("f-signal").onchange = function () { state.signal = this.value; apply(); };
  el("reset").onclick = function () {
    state.user = "all"; state.repo = "all"; state.signal = "all";
    el("f-user").value = "all"; el("f-repo").value = "all"; el("f-signal").value = "all";
    apply();
  };
}

function kpi(label, value, unit, sub, lime) {
  return '<div class="kpi' + (lime ? " lime" : "") + '"><p class="l">' + label +
    '</p><div class="n">' + value + (unit ? '<span class="u">' + unit + "</span>" : "") +
    '</div><p class="s">' + sub + "</p></div>";
}

function renderKPIs(rows) {
  var users = {};
  rows.forEach(function (r) { users[r.userId] = 1; });
  var prs = distinctPrs(rows);
  var repos = {};
  prs.forEach(function (p) { repos[p.repo] = 1; });
  var proven = rows.filter(function (r) { return rowPrs(r).length > 0; }).length;
  var rate = rows.length ? Math.round((proven / rows.length) * 100) : 0;
  el("kpis").innerHTML =
    kpi("Claude Code 用户", Object.keys(users).length, "", "在当前筛选内", false) +
    kpi("UserSubmitPrompt 行", rows.length, "", "用户提交的原始请求", false) +
    kpi("已合并 PR 证据", prs.length, "", "去重后的真实合并 PR", true) +
    kpi("覆盖仓库", Object.keys(repos).length, "/ " + ALL_REPOS.length, "有合并证据的仓库", false) +
    kpi("证明率", rate, "%", proven + " / " + rows.length + " 个 prompt 有合并 PR", true);
}

function countBy(arr) {
  var m = {};
  arr.forEach(function (v) { m[v] = (m[v] || 0) + 1; });
  return m;
}

var charts = {};
function axis(showGrid) {
  return {
    grid: { color: GRID, display: showGrid !== false },
    border: { color: "rgba(255,255,255,0.08)" },
    ticks: { color: TICK }
  };
}

function buildCharts(rows) {
  var repoCount = {};
  ALL_REPOS.forEach(function (r) { repoCount[r] = 0; });
  distinctPrs(rows).forEach(function (p) { repoCount[p.repo] = (repoCount[p.repo] || 0) + 1; });
  charts.repo = new Chart(el("c-repo"), {
    type: "bar",
    data: {
      labels: Object.keys(repoCount),
      datasets: [{
        data: Object.values(repoCount), backgroundColor: PAL[0] + "cc",
        borderColor: PAL[0], borderWidth: 1, borderRadius: 6, maxBarThickness: 64
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: axis(false), y: { beginAtZero: true, ticks: { color: TICK, precision: 0 }, grid: { color: GRID } } }
    }
  });

  var perUser = DATA.users.map(function (u) {
    return rows.filter(function (r) { return r.userId === u.id; }).length;
  });
  charts.user = new Chart(el("c-user"), {
    type: "doughnut",
    data: {
      labels: DATA.users.map(function (u) { return u.name; }),
      datasets: [{
        data: perUser,
        backgroundColor: DATA.users.map(function (_, i) { return PAL[i % PAL.length] + "cc"; }),
        borderColor: "#10161f", borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "62%",
      plugins: { legend: { position: "right", labels: { usePointStyle: true, padding: 14, color: "#a4b1c0" } } }
    }
  });

  var sc = countBy(rows.reduce(function (a, r) { return a.concat(r.signals); }, []));
  var sorted = Object.keys(sc).map(function (k) { return [k, sc[k]]; })
    .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, 8);
  charts.signal = new Chart(el("c-signal"), {
    type: "bar",
    data: {
      labels: sorted.map(function (x) { return x[0]; }),
      datasets: [{
        data: sorted.map(function (x) { return x[1]; }),
        backgroundColor: PAL[2] + "cc", borderColor: PAL[2], borderWidth: 1,
        borderRadius: 5, maxBarThickness: 22
      }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { color: TICK, precision: 0 }, grid: { color: GRID } }, y: axis(false) }
    }
  });

  charts.time = new Chart(el("c-time"), {
    type: "line",
    data: timeSeries(rows),
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      elements: { line: { tension: 0.32, borderColor: PAL[0], borderWidth: 2,
        backgroundColor: "rgba(86,182,255,0.12)", fill: true },
        point: { radius: 3, backgroundColor: PAL[0] } },
      scales: { x: axis(false), y: { beginAtZero: true, ticks: { color: TICK, precision: 0 }, grid: { color: GRID } } }
    }
  });
}

function timeSeries(rows) {
  var prs = distinctPrs(rows).slice().sort(function (a, b) {
    return a.merged_at < b.merged_at ? -1 : a.merged_at > b.merged_at ? 1 : 0;
  });
  var labels = [], data = [], n = 0;
  prs.forEach(function (p) { n += 1; labels.push(p.merged_at.slice(0, 10)); data.push(n); });
  if (!labels.length) { labels = ["—"]; data = [0]; }
  return { labels: labels, datasets: [{ data: data }] };
}

function updateCharts(rows) {
  var repoCount = {};
  ALL_REPOS.forEach(function (r) { repoCount[r] = 0; });
  distinctPrs(rows).forEach(function (p) { repoCount[p.repo] = (repoCount[p.repo] || 0) + 1; });
  charts.repo.data.labels = Object.keys(repoCount);
  charts.repo.data.datasets[0].data = Object.values(repoCount);
  charts.repo.update("none");

  charts.user.data.datasets[0].data = DATA.users.map(function (u) {
    return rows.filter(function (r) { return r.userId === u.id; }).length;
  });
  charts.user.update("none");

  var sc = countBy(rows.reduce(function (a, r) { return a.concat(r.signals); }, []));
  var sorted = Object.keys(sc).map(function (k) { return [k, sc[k]]; })
    .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, 8);
  charts.signal.data.labels = sorted.map(function (x) { return x[0]; });
  charts.signal.data.datasets[0].data = sorted.map(function (x) { return x[1]; });
  charts.signal.update("none");

  var ts = timeSeries(rows);
  charts.time.data.labels = ts.labels;
  charts.time.data.datasets[0].data = ts.datasets[0].data;
  charts.time.update("none");
}

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var COLS = [
  { key: "userName", label: "用户", sortable: true },
  { key: "promptId", label: "Prompt", sortable: true },
  { key: "ts", label: "时间", sortable: true },
  { key: "intent", label: "意图", sortable: true },
  { key: "signals", label: "信号", sortable: false },
  { key: "prs", label: "已合并 PR 证据", sortable: false }
];

function renderTable(rows) {
  var sorted = rows.slice().sort(function (a, b) {
    var av, bv;
    if (state.sortKey === "userName") { av = a.userName; bv = b.userName; }
    else if (state.sortKey === "promptId") { av = a.promptId; bv = b.promptId; }
    else if (state.sortKey === "intent") { av = a.intent; bv = b.intent; }
    else { av = a.ts; bv = b.ts; }
    var c = av < bv ? -1 : av > bv ? 1 : 0;
    return state.sortDir === "asc" ? c : -c;
  });
  var h = "<thead><tr>";
  COLS.forEach(function (c) {
    var ar = "";
    if (c.sortable && state.sortKey === c.key) ar = '<span class="ar">' + (state.sortDir === "asc" ? "\\u25B2" : "\\u25BC") + "</span>";
    h += '<th class="' + (c.sortable ? "sortable" : "") + '" data-k="' + c.key + '">' + c.label + ar + "</th>";
  });
  h += "</tr></thead><tbody>";
  if (!sorted.length) {
    h += '<tr><td colspan="6"><div class="empty">当前筛选下没有匹配的 UserSubmitPrompt 行。</div></td></tr>';
  } else {
    sorted.forEach(function (r) {
      var sigs = r.signals.map(function (s) { return '<span class="sig">' + esc(s) + "</span>"; }).join("");
      var prs = rowPrs(r);
      var prc = prs.length
        ? prs.map(function (p) { return '<span class="pr">' + esc(p.repo) + " #" + p.number + "</span>"; }).join("")
        : '<span class="pr none">无合并证据</span>';
      h += "<tr><td><span class=\\"uname\\">" + esc(r.userName) + '</span><br><span class="urole">' + esc(r.role) +
        '</span></td><td class="id">' + esc(r.promptId) + '</td><td class="ts">' + esc(r.ts.slice(0, 16).replace("T", " ")) +
        '</td><td><span class="intent">' + esc(r.intent) + "</span></td><td>" + sigs + "</td><td>" + prc + "</td></tr>";
    });
  }
  h += "</tbody>";
  var t = el("tbl");
  t.innerHTML = h;
  t.querySelectorAll("th.sortable").forEach(function (th) {
    th.onclick = function () {
      var k = th.getAttribute("data-k");
      if (state.sortKey === k) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = k; state.sortDir = "asc"; }
      renderTable(viewRows());
    };
  });
  el("rowcount").textContent = sorted.length + " 行 · 已合并 PR 证据 " + distinctPrs(rows).length + " 个";
}

function apply() {
  var rows = viewRows();
  renderKPIs(rows);
  updateCharts(rows);
  renderTable(rows);
}

function init() {
  setupFilters();
  var rows = viewRows();
  renderKPIs(rows);
  buildCharts(rows);
  renderTable(rows);
}
init();
</script>
</body>
</html>
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
