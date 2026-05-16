#!/usr/bin/env node
// teamagent-team-sync: SessionStart importer.
// Pulls new rule cards from the team store into the user store.
// - team store path: $TEAMAGENT_TEAM_STORE or ~/.teamagent/team/rules.jsonl
// - user store path: ~/.teamagent/rules.jsonl
// Conflict policy: if an inbound rule shares trigger.pattern with a local
// rule but has different `correct`, DO NOT overwrite. Write the conflict
// pair into ~/.teamagent/conflicts.jsonl and emit additionalContext warning.
//
// Idempotency contract (the bug this file used to have): a conflict is
// keyed by (pattern, local.correct, team.correct), encoded as a JSON array
// string so the key is printable, grep-able, and trivially reproducible by
// the resolve-rule-conflict skill. The same unresolved conflict is written
// to conflicts.jsonl AT MOST ONCE no matter how many sessions start. A
// conflict whose key appears in ~/.teamagent/resolved.jsonl is skipped
// entirely -- no re-log, no warning. "Re-running sync never re-prompts" is
// now true for real, not just after the user mutates local `correct`.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = process.env.HOME || os.homedir();
const STORE_DIR = path.join(HOME, ".teamagent");
const USER_RULES = path.join(STORE_DIR, "rules.jsonl");
const CONFLICTS = path.join(STORE_DIR, "conflicts.jsonl");
const RESOLVED = path.join(STORE_DIR, "resolved.jsonl");
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

// Stable identity of a conflict. Independent of timestamp so the same
// disagreement maps to the same key across every session. Encoded as a
// JSON array string: printable, no delimiter-collision risk, and the
// resolve-rule-conflict skill can reproduce it with one JSON.stringify.
function conflictKey(pattern, localCorrect, teamCorrect) {
  return JSON.stringify([
    pattern == null ? "" : String(pattern),
    localCorrect == null ? "" : String(localCorrect),
    teamCorrect == null ? "" : String(teamCorrect),
  ]);
}

// A resolved marker matches a conflict if it carries the same `key`, OR
// (back-compat with older resolve-rule-conflict writes) the same pattern
// with no key field. Either form silences the conflict permanently.
function loadResolvedKeys() {
  const keys = new Set();
  const patternsOnly = new Set();
  for (const row of loadJsonl(RESOLVED)) {
    if (row && typeof row.key === "string") keys.add(row.key);
    else if (row && typeof row.pattern === "string") patternsOnly.add(row.pattern);
  }
  return { keys, patternsOnly };
}

function emitOutput(additionalContext) {
  const payload = additionalContext
    ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: additionalContext } }
    : {};
  process.stdout.write(JSON.stringify(payload));
}

function main() {
  // Drain stdin even if unused -- keeps hook protocol happy.
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

  // Keys already written to the conflicts ledger (any previous session).
  // Back-compat: rows written before this fix have no `key` field, so
  // recompute it from their stored {pattern, local, team}.
  const loggedKeys = new Set();
  for (const row of loadJsonl(CONFLICTS)) {
    if (!row) continue;
    if (typeof row.key === "string") {
      loggedKeys.add(row.key);
    } else if (typeof row.pattern === "string") {
      loggedKeys.add(
        conflictKey(
          row.pattern,
          row.local && row.local.correct,
          row.team && row.team.correct
        )
      );
    }
  }

  const resolved = loadResolvedKeys();
  const isResolved = (ck, pattern) =>
    resolved.keys.has(ck) || resolved.patternsOnly.has(pattern);

  const imported = [];
  const newConflicts = []; // not yet in the ledger -> append exactly once
  const unresolvedKeys = new Set(); // distinct outstanding conflicts this run

  for (const team of teamRules) {
    if (!team || !team.trigger || !team.trigger.pattern) continue;
    if (team.id && localById.has(team.id)) continue;

    const k = ruleKey(team);
    const localMatch = k ? localByPattern.get(k) : null;
    if (localMatch && localMatch.correct !== team.correct) {
      const ck = conflictKey(k, localMatch.correct, team.correct);
      // Resolved earlier -> silent. No import, no ledger row, no warning.
      if (isResolved(ck, k)) continue;
      unresolvedKeys.add(ck);
      // Append to the ledger only the first time we ever see this key.
      if (!loggedKeys.has(ck)) {
        loggedKeys.add(ck);
        newConflicts.push({
          ts: new Date().toISOString(),
          key: ck,
          pattern: k,
          local: localMatch,
          team: team,
        });
      }
      continue;
    }

    imported.push(team);
  }

  for (const r of imported) {
    try {
      fs.appendFileSync(USER_RULES, JSON.stringify(r) + "\n");
    } catch (_e) {}
  }

  for (const c of newConflicts) {
    try {
      fs.appendFileSync(CONFLICTS, JSON.stringify(c) + "\n");
    } catch (_e) {}
  }

  const outstanding = unresolvedKeys.size;

  logEvent({
    ts: new Date().toISOString(),
    kind: "team_sync",
    imported: imported.length,
    conflicts_new: newConflicts.length,
    conflicts_outstanding: outstanding,
    team_store: TEAM_STORE,
  });

  if (imported.length === 0 && outstanding === 0) {
    emitOutput("");
    process.exit(0);
  }

  const parts = [];
  if (imported.length > 0) {
    parts.push("teamagent-team-sync imported " + imported.length + " rule(s) from the team store.");
  }
  if (outstanding > 0) {
    // `outstanding` is deterministic given the same stores, so this warning
    // text is identical every session until the user resolves -- it does
    // NOT keep growing the way the old conflicts.jsonl did.
    parts.push(
      "teamagent-team-sync has " + outstanding + " unresolved conflict(s)" +
      (newConflicts.length > 0 ? " (" + newConflicts.length + " new)" : "") +
      "; local rules were NOT overwritten. Inspect " + CONFLICTS +
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
