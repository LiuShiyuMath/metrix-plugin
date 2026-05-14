#!/usr/bin/env node
// Local browser console for a real tmux TeamAgent sandbox.
// No npm install required. Start with:
//   node demo/teamagent-sandbox-server.cjs

"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 4177);
const SESSION = process.env.TEAMAGENT_SESSION || "teamagent-sandbox-console";
const BASE = process.env.TEAMAGENT_BASE || path.join(os.tmpdir(), "teamagent-sandbox-console");
const ACTORS = {
  leader: { pane: 0, label: "Leader Dashboard" },
  alice: { pane: 1, label: "Alice" },
  bob: { pane: 2, label: "Bob" },
  carol: { pane: 3, label: "Carol" },
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: "utf8",
  });
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function tmux(args) {
  return run("tmux", args);
}

function exists() {
  return tmux(["has-session", "-t", SESSION]).status === 0;
}

function send(actor, command) {
  if (!exists()) startSession();
  return tmux(["send-keys", "-t", `${SESSION}:0.${ACTORS[actor].pane}`, command, "C-m"]);
}

function actorHome(actor) {
  return path.join(BASE, actor);
}

function actorClaude(actor) {
  return path.join(actorHome(actor), ".claude");
}

function initCommand(actor) {
  const label = ACTORS[actor].label;
  return [
    "clear",
    `export ROOT=${shellQuote(ROOT)}`,
    `export HOME=${shellQuote(actorHome(actor))}`,
    `export CLAUDE_HOME=${shellQuote(actorClaude(actor))}`,
    `export PATH=${shellQuote(path.join(ROOT, "plugins/teamagent-memory/bin"))}:"$PATH"`,
    'mkdir -p "$HOME" "$CLAUDE_HOME"',
    `echo ${shellQuote(`${label} sandbox connected`)}`,
    'echo "HOME=$HOME"',
    'echo "CLAUDE_HOME=$CLAUDE_HOME"',
  ].join("; ");
}

function startSession() {
  tmux(["kill-session", "-t", SESSION]);
  fs.mkdirSync(BASE, { recursive: true });
  for (const actor of Object.keys(ACTORS)) fs.mkdirSync(actorClaude(actor), { recursive: true });

  let res = tmux(["new-session", "-d", "-s", SESSION, "-x", "132", "-y", "38", "bash", "--noprofile", "--norc"]);
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "tmux new-session failed");
  tmux(["split-window", "-h", "-t", `${SESSION}:0`]);
  tmux(["split-window", "-v", "-t", `${SESSION}:0.0`]);
  tmux(["split-window", "-v", "-t", `${SESSION}:0.1`]);
  tmux(["select-layout", "-t", `${SESSION}:0`, "tiled"]);
  tmux(["set-option", "-t", SESSION, "status-left", " TeamAgent browser console "]);
  tmux(["set-option", "-t", SESSION, "status-right", " real HOME / CLAUDE_HOME "]);

  for (const actor of Object.keys(ACTORS)) send(actor, initCommand(actor));
  send("leader", leaderWatchCommand());
}

function leaderWatchCommand() {
  return [
    "while :; do",
    "clear",
    "echo 'Leader Frontend Dashboard'",
    "echo 'real machine: browser buttons -> Node API -> tmux panes'",
    `echo ${shellQuote(`base: ${BASE}`)}`,
    "date '+%H:%M:%S'",
    "echo",
    "for r in alice bob carol; do",
    "echo === $r ===",
    `if [ -s ${shellQuote(BASE)}/$r/.teamagent/rules.jsonl ]; then tail -n 2 ${shellQuote(BASE)}/$r/.teamagent/rules.jsonl | jq -C .; else echo '(no rules)'; fi`,
    `if [ -s ${shellQuote(BASE)}/$r/.teamagent/events.jsonl ]; then tail -n 3 ${shellQuote(BASE)}/$r/.teamagent/events.jsonl | jq -C .; fi`,
    "echo",
    "done",
    "sleep 2",
    "done",
  ].join(" ");
}

function connectClaudefast() {
  send("alice", "claudefast -p 'reply exactly ALICE_READY'");
  send("bob", "claudefast -p 'reply exactly BOB_READY'");
  send("carol", "claudefast -p 'reply exactly CAROL_READY'");
}

function aliceMistake() {
  send("alice", "echo \"$ claudefast -p 'add date helper with moment'\"; claudefast -p 'reply in one sentence: I will install moment for a date helper'");
}

function aliceCorrect() {
  const transcript = [
    `printf '%s\\n'`,
    `'{"type":"user","content":"please add a date helper"}'`,
    `'{"type":"assistant","content":"sure, let me npm install moment"}'`,
    `'{"type":"user","content":"no, don'\\''t use moment, use dayjs"}'`,
    '> "$HOME/alice-transcript.jsonl"',
  ].join(" ");
  send("alice", transcript);
  send("alice", `printf '%s' '{"hook_event_name":"Stop","transcript_path":"'"$HOME"'/alice-transcript.jsonl","session_id":"alice-browser"}' | node "$ROOT/plugins/teamagent-memory/hooks/stop-capture.cjs"; teamagent list | jq -C .`);
  send("alice", `for r in bob carol; do mkdir -p ${shellQuote(BASE)}/$r/.teamagent; cp "$HOME/.teamagent/rules.jsonl" ${shellQuote(BASE)}/$r/.teamagent/rules.jsonl; done; echo 'team sync copied Alice rule to Bob/Carol homes'`);
}

function bobMoment() {
  send("bob", `printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm install moment"},"session_id":"bob-browser"}' | node "$ROOT/plugins/teamagent-memory/hooks/pretooluse-enforce.cjs" | jq -C .`);
}

function bobDayjs() {
  send("bob", `printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm install dayjs"},"session_id":"bob-browser"}' | node "$ROOT/plugins/teamagent-memory/hooks/pretooluse-enforce.cjs"; echo 'Bob dayjs path passed'`);
}

function carolAudit() {
  send("carol", "claudefast --output-format stream-json -p 'reply exactly STREAM_READY' | head -n 20");
}

function customAlice(body) {
  const text = String(body.command || "").trim();
  if (!text) return;
  send("alice", text);
}

function capture(actor) {
  if (!exists()) return "";
  const res = tmux(["capture-pane", "-p", "-t", `${SESSION}:0.${ACTORS[actor].pane}`, "-S", "-180"]);
  return res.stdout || "";
}

function state() {
  const panes = {};
  for (const actor of Object.keys(ACTORS)) panes[actor] = capture(actor);
  return {
    session: SESSION,
    base: BASE,
    exists: exists(),
    homes: Object.fromEntries(Object.keys(ACTORS).map((a) => [a, { HOME: actorHome(a), CLAUDE_HOME: actorClaude(a) }])),
    panes,
  };
}

function html() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>TeamAgent Real Sandbox Console</title>
<style>
:root{--bg:#07090d;--panel:#10151d;--panel2:#151b25;--ink:#edf5f7;--muted:#8b98a8;--line:#263241;--accent:#62d39f;--warn:#ffcc66;--bad:#ff6b6b;--blue:#75a8ff;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft Yahei",sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,rgba(98,211,159,.14),transparent 34rem),linear-gradient(180deg,#07090d,#0b0f14);color:var(--ink);font-family:var(--sans)}button,input{font:inherit}.top{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 22px;background:rgba(7,9,13,.9);border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}h1{margin:0;font-size:18px}.sub{margin:4px 0 0;color:var(--muted);font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:8px 10px;border-radius:7px;cursor:pointer}.btn:hover{border-color:#42546a;background:#18212c}.btn.primary{border-color:rgba(98,211,159,.7);background:#10231b}.btn.warn{border-color:rgba(255,204,102,.7);background:#251d0d}.wrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;padding:18px}.tmux{border:1px solid var(--line);background:#080b10}.bar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);background:#0d1219;font:12px/1 var(--mono);color:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;min-height:calc(100svh - 150px)}.pane{display:grid;grid-template-rows:auto 1fr auto;min-width:0;border-right:1px solid #1d2632;border-bottom:1px solid #1d2632}.pane:nth-child(2n){border-right:0}.pane:nth-child(n+3){border-bottom:0}.ph{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;background:#111821;border-bottom:1px solid #1d2632}.name{font-weight:700}.role{font:11px/1.2 var(--mono);color:var(--muted);margin-top:3px}.dot{width:8px;height:8px;border-radius:99px;background:var(--accent);box-shadow:0 0 0 4px rgba(98,211,159,.13)}pre{margin:0;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.45 var(--mono);color:#dce7ee}.pa{display:flex;gap:8px;flex-wrap:wrap;padding:9px 10px;background:#0d1219;border-top:1px solid #1d2632}.mini{border:1px solid var(--line);background:#141b25;color:var(--ink);border-radius:6px;padding:6px 8px;font-size:12px;cursor:pointer}.mini:hover{border-color:#435469}.side{display:grid;gap:14px;align-content:start}.mod{border:1px solid var(--line);background:rgba(16,21,29,.88);padding:14px}.mod h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px}.mod p,.home{color:var(--muted);font-size:12px;line-height:1.5}.home{border-top:1px solid #1d2632;padding-top:8px;margin-top:8px;font-family:var(--mono)}.alice-line{display:flex;gap:8px;margin-top:8px}.alice-line input{min-width:0;flex:1;background:#080c11;border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:7px;font:12px/1.2 var(--mono)}.gif{width:100%;border:1px solid #1d2632;background:#07090d}a{color:#cce7ff}@media(max-width:1050px){.wrap{grid-template-columns:1fr}.grid{min-height:auto}.mod{min-width:0}}@media(max-width:720px){.top{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr;grid-template-rows:repeat(4,minmax(280px,auto))}.pane{border-right:0}.pane:nth-child(n+3){border-bottom:1px solid #1d2632}.pane:last-child{border-bottom:0}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header class="top"><div><h1>TeamAgent Real Sandbox Console</h1><p class="sub">点击按钮会操作本机 tmux，不是浏览器假终端。Alice 可控，Leader pane 只读观察真实文件变化。</p></div><div class="actions"><button class="btn primary" data-api="start">启动 tmux</button><button class="btn" data-api="connect">连接 claudefast</button><button class="btn warn" data-api="stop">停止</button></div></header>
<main class="wrap">
<section class="tmux"><div class="bar"><span id="sess">session: ${SESSION}</span><span>base: ${BASE}</span></div><div class="grid">${["leader","alice","bob","carol"].map((a)=>`<article class="pane"><div class="ph"><div><div class="name">${ACTORS[a].label}</div><div class="role">${a === "leader" ? "frontend dashboard pane" : a === "alice" ? "user-controlled claudefast teammate" : "real claudefast teammate"}</div></div><span class="dot"></span></div><pre id="pane-${a}"></pre><div class="pa">${actionsFor(a)}</div></article>`).join("")}</div></section>
<aside class="side"><section class="mod"><h2>Real-machine proof</h2><p>先录制的 GIF 来自 <code>demo/teamagent-tmux-wild.sh</code>，用 asciinema + agg 生成。</p><img class="gif" src="/docs/demo/teamagent-wild.gif" alt="TeamAgent wild tmux recording" onerror="this.style.display='none'"><p><a href="/docs/demo/teamagent-wild.gif">打开 GIF</a></p></section><section class="mod"><h2>Sandbox homes</h2><div id="homes"></div></section><section class="mod"><h2>Alice custom command</h2><p>这里直接 send-keys 到 Alice teammate pane。</p><div class="alice-line"><input id="alice-cmd" value="echo hello from Alice"><button class="mini" id="send-alice">发送</button></div></section></aside>
</main>
<script>
async function post(name, body){await fetch('/api/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});await refresh();}
function esc(s){return String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
async function refresh(){const r=await fetch('/api/state');const s=await r.json();for(const [k,v] of Object.entries(s.panes||{})){document.getElementById('pane-'+k).innerHTML=esc(v);}document.getElementById('homes').innerHTML=Object.entries(s.homes||{}).map(([k,v])=>'<div class="home"><strong>'+k.toUpperCase()+'</strong><br>HOME='+esc(v.HOME)+'<br>CLAUDE_HOME='+esc(v.CLAUDE_HOME)+'</div>').join('');}
document.addEventListener('click',e=>{const b=e.target.closest('[data-api]');if(b)post(b.dataset.api);});
document.getElementById('send-alice').onclick=()=>post('alice/custom',{command:document.getElementById('alice-cmd').value});
setInterval(refresh,1200);refresh();
</script>
</body>
</html>`;
}

function actionsFor(actor) {
  if (actor === "alice") return `<button class="mini" data-api="alice/mistake">Alice 让 Claude 用 moment</button><button class="mini" data-api="alice/correct">Alice 纠正 dayjs</button>`;
  if (actor === "bob") return `<button class="mini" data-api="bob/moment">Bob 再试 moment</button><button class="mini" data-api="bob/dayjs">Bob 用 dayjs</button>`;
  if (actor === "carol") return `<button class="mini" data-api="carol/audit">stream-json audit</button>`;
  return `<button class="mini" data-api="leader/proof">刷新 dashboard</button>`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (_e) { resolve({}); }
    });
  });
}

async function route(req, res) {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html());
      return;
    }
    if (req.method === "GET" && req.url === "/docs/demo/teamagent-wild.gif") {
      const gif = path.join(ROOT, "docs/demo/teamagent-wild.gif");
      if (!fs.existsSync(gif)) {
        res.writeHead(404); res.end("record docs/demo/teamagent-wild.gif first"); return;
      }
      res.writeHead(200, { "content-type": "image/gif" });
      fs.createReadStream(gif).pipe(res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/state") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(state()));
      return;
    }
    if (req.method !== "POST" || !req.url.startsWith("/api/")) {
      res.writeHead(404); res.end("not found"); return;
    }
    const name = req.url.slice("/api/".length);
    const body = await readBody(req);
    if (name === "start") startSession();
    else if (name === "stop") tmux(["kill-session", "-t", SESSION]);
    else if (name === "connect") connectClaudefast();
    else if (name === "alice/mistake") aliceMistake();
    else if (name === "alice/correct") aliceCorrect();
    else if (name === "alice/custom") customAlice(body);
    else if (name === "bob/moment") bobMoment();
    else if (name === "bob/dayjs") bobDayjs();
    else if (name === "carol/audit") carolAudit();
    else if (name === "leader/proof") send("leader", "true");
    else { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

http.createServer(route).listen(PORT, () => {
  console.log(`TeamAgent sandbox console: http://127.0.0.1:${PORT}`);
  console.log(`tmux session: ${SESSION}`);
  console.log(`sandbox base: ${BASE}`);
});
