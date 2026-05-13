#!/usr/bin/env node
// teamagent-team-sync: UserPromptSubmit publish-intent detector.
// If the user message looks like a publish intent ("publish this rule",
// "share with team", "publish rule <id>"), emit additionalContext that
// reminds the assistant to invoke the publish-team-rule skill. Otherwise
// stay silent so unrelated prompts pay zero overhead.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = process.env.HOME || os.homedir();
const STORE_DIR = path.join(HOME, ".teamagent");
const EVENTS = path.join(STORE_DIR, "events.jsonl");

function readStdinSync() {
  try { return fs.readFileSync(0, "utf8"); } catch (_e) { return ""; }
}

function safeParseJSON(s) {
  try { return JSON.parse(s); } catch (_e) { return null; }
}

function ensureStoreDir() {
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (_e) {}
}

function logEvent(evt) {
  try {
    ensureStoreDir();
    fs.appendFileSync(EVENTS, JSON.stringify(evt) + "\n");
  } catch (_e) {}
}

function emitOutput(additionalContext) {
  const payload = additionalContext
    ? { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: additionalContext } }
    : {};
  process.stdout.write(JSON.stringify(payload));
}

function detectIntent(prompt) {
  if (typeof prompt !== "string" || !prompt) return null;
  const lower = prompt.toLowerCase();
  const phrases = [
    "publish this rule",
    "publish that rule",
    "publish rule ",
    "share with team",
    "share with the team",
    "share this rule with team",
    "push to team",
    "promote to team",
    "publish to team store",
    "publish to the team store",
    "publish to team",
  ];
  for (const p of phrases) {
    if (lower.includes(p)) return p;
  }
  const m = lower.match(/publish\s+rule\s+([a-z0-9_\-:.]+)/);
  if (m) return "publish rule " + m[1];
  return null;
}

function main() {
  const raw = readStdinSync();
  const event = safeParseJSON(raw) || {};
  const prompt = event.prompt || event.user_message || "";
  const hit = detectIntent(prompt);
  if (!hit) {
    emitOutput("");
    process.exit(0);
  }

  logEvent({
    ts: new Date().toISOString(),
    kind: "publish_intent",
    matched: hit,
  });

  emitOutput(
    "teamagent-team-sync detected a publish intent (\"" + hit + "\"). " +
    "Invoke the /teamagent-team-sync:publish-team-rule skill to copy the " +
    "rule from ~/.teamagent/rules.jsonl into the team store with attribution."
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write("teamagent-team-sync userprompt error: " + (err && err.message) + "\n"); } catch (_e) {}
  process.stdout.write("{}");
  process.exit(0);
}
