#!/usr/bin/env bash
# plugins/teamagent-workflow/bin/gen-grill-urls.sh
#
# Deterministic grill-me session-URL generator (workflow Stage 2).
#
# Takes ONE public GitHub issue URL and emits a single JSON object with a
# prefilled grill-me prompt plus the chatgpt.com and claude.ai URLs that
# open a browser session already running that prompt.
#
# This is a FIXED TOOL on purpose: no LLM is in the URL path. The judge
# harness can run it, diff its JSON, and prove the URLs are produced
# mechanically — not narrated by a model. Per metrixMarkets EVAL.md the
# LLM may only read the JSON this script prints; it never authors it.
#
# Contract:
#   - Input: $1 = https://github.com/<owner>/<repo>/issues/<n>
#   - Output: one JSON object on stdout, last line, always.
#   - Exit 0 always (probe-safe). Validity is carried in .valid, not the
#     exit code, so callers/judge read the field.
#   - Dependency: jq (already a hard dep in this repo per EVAL.md), used
#     for RFC-3986 encoding via `@uri` and safe JSON assembly.
#
# Canonical example (matches the user-approved status page):
#   gen-grill-urls.sh https://github.com/LiuShiyuMath/metrix-plugin/issues/2

set -euo pipefail

emit_invalid() {
  # $1 = reason
  jq -nc --arg reason "$1" --arg issue "${1:+}" \
    '{valid:false, reason:$reason, issue_url:null, prompt:null, chatgpt_url:null, claude_url:null}'
  exit 0
}

if ! command -v jq >/dev/null 2>&1; then
  # No jq: stay probe-safe with a hand-built JSON object.
  printf '%s\n' '{"valid":false,"reason":"jq not found","issue_url":null,"prompt":null,"chatgpt_url":null,"claude_url":null}'
  exit 0
fi

ISSUE_URL="${1:-}"

if [ -z "$ISSUE_URL" ]; then
  emit_invalid "missing issue url argument"
fi

# v1 scope: GitHub issues only. Strict shape check.
if ! printf '%s' "$ISSUE_URL" | grep -Eq '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/[0-9]+$'; then
  emit_invalid "not a github issue url (v1 supports github issues only): $ISSUE_URL"
fi

# Prompt template. The grill-me skill is fetched by the web LLM itself;
# we only prefill the instruction. Override with $GRILL_PROMPT_TEMPLATE
# if needed ({{ISSUE_URL}} is substituted).
DEFAULT_TEMPLATE='Follow this instructions https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md and grill me with the issue {{ISSUE_URL}} . ONLY ANSWER IN CHINESE. LAST STEP BEFORE FINISH , please inform the users to copy-paste the detailed grilled results into the issue.'
TEMPLATE="${GRILL_PROMPT_TEMPLATE:-$DEFAULT_TEMPLATE}"

PROMPT="${TEMPLATE//\{\{ISSUE_URL\}\}/$ISSUE_URL}"

# RFC-3986 component encoding via jq @uri (encodes spaces, ?, /, :, etc.).
ENC="$(printf '%s' "$PROMPT" | jq -sRr @uri)"

CHATGPT_URL="https://chatgpt.com/?prompt=${ENC}"
CLAUDE_URL="https://claude.ai/new?q=${ENC}"

jq -nc \
  --arg issue "$ISSUE_URL" \
  --arg prompt "$PROMPT" \
  --arg cg "$CHATGPT_URL" \
  --arg cl "$CLAUDE_URL" \
  '{valid:true, reason:"ok", issue_url:$issue, prompt:$prompt, chatgpt_url:$cg, claude_url:$cl}'
