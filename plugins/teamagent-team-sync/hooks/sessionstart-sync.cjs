#!/usr/bin/env node
// teamagent-team-sync: SessionStart importer.
// Pulls new rule cards from the team store into the user store.
// - team store path: $TEAMAGENT_TEAM_STORE or ~/.teamagent/team/rules.jsonl
// - user store path: ~/.teamagent/rules.jsonl
// Conflict policy: if an inbound rule shares trigger.pattern with a local
// rule but has different `correct`, DO NOT overwrite. Write the conflict
// pair into ~/.teamagent/conflicts.jsonl and emit additionalContext warning.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = process.env.HOME || os.homedir();
const STORE_DIR = path.join(HOME, ".teamagent");
const USER_RULES = path.join(STORE_DIR, "rules.jsonl");
const CONFLICTS = path.join(STORE_DIR, "conflicts.jsonl");
const EVENTS = path.join(STORE_DIR, "events.jsonl");

function expandTilde(p) {
  if (!p) return p;
  if (p === "~") return HOME;
  if (p.startsWith("~/")) return path.join(HOME, p.slice(2));
  return p;
}

const TEAM_STORE = expandTilde(
  process.env.TEAMAGENT_TEAM_STORE || path.join(STORE_DIR, "team", "rules.jsonl")
);

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

function loadJsonl(p) {
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf8");
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const obj = safeParseJSON(t);
    if (obj) out.push(obj);
  }
  return out;
}

function ruleKey(rule) {
  const pat = rule && rule.trigger && rule.trigger.pattern;
  return typeof pat === "string" ? pat : null;
}

function emitOutput(additionalContext) {
  const payload = additionalContext
    ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: additionalContext } }
    : {};
  process.stdout.write(JSON.stringify(payload));
}

function main() {
  // Drain stdin even if unused — keeps hook protocol happy.
  readStdinSync();

  if (!fs.existsSync(TEAM_STORE)) {
    emitOutput("");
    process.exit(0);
  }

  ensureStoreDir();
  const teamRules = loadJsonl(TEAM_STORE);
  if (teamRules.length === 0) {
    emitOutput("");
    process.exit(0);
  }

  const localRules = loadJsonl(USER_RULES);
  const localById = new Map();
  const localByPattern = new Map();
  for (const r of localRules) {
    if (r.id) localById.set(r.id, r);
    const k = ruleKey(r);
    if (k) localByPattern.set(k, r);
  }

  const imported = [];
  const conflicts = [];

  for (const team of teamRules) {
    if (!team || !team.trigger || !team.trigger.pattern) continue;
    if (team.id && localById.has(team.id)) continue;

    const k = ruleKey(team);
    const localMatch = k ? localByPattern.get(k) : null;
    if (localMatch && localMatch.correct !== team.correct) {
      conflicts.push({
        ts: new Date().toISOString(),
        pattern: k,
        local: localMatch,
        team: team,
      });
      continue;
    }

    imported.push(team);
  }

  for (const r of imported) {
    try {
      fs.appendFileSync(USER_RULES, JSON.stringify(r) + "\n");
    } catch (_e) {}
  }

  for (const c of conflicts) {
    try {
      fs.appendFileSync(CONFLICTS, JSON.stringify(c) + "\n");
    } catch (_e) {}
  }

  logEvent({
    ts: new Date().toISOString(),
    kind: "team_sync",
    imported: imported.length,
    conflicts: conflicts.length,
    team_store: TEAM_STORE,
  });

  if (imported.length === 0 && conflicts.length === 0) {
    emitOutput("");
    process.exit(0);
  }

  const parts = [];
  if (imported.length > 0) {
    parts.push("teamagent-team-sync imported " + imported.length + " rule(s) from the team store.");
  }
  if (conflicts.length > 0) {
    parts.push(
      "teamagent-team-sync detected " + conflicts.length + " conflict(s); " +
      "local rules were NOT overwritten. Inspect " + CONFLICTS +
      " and run /teamagent-team-sync:resolve-rule-conflict to resolve."
    );
  }
  emitOutput(parts.join(" "));
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write("teamagent-team-sync sessionstart error: " + (err && err.message) + "\n"); } catch (_e) {}
  // Never break the session.
  process.stdout.write("{}");
  process.exit(0);
}
