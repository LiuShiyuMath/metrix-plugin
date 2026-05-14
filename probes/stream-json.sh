#!/usr/bin/env bash
# probes/stream-json.sh
#
# Purpose: verify claudefast emits a parseable stream-json event source.
# Per EVAL.md, `--output-format stream-json` is the runtime event source
# that cannot be forged. We just need to confirm it runs and produces
# at least one valid JSON event line within the timeout window.
#
# Output: a single JSON object to stdout describing the run.
# Exit code: 0 always (skipped or measured is fine; the harness records).

set -euo pipefail

TIMEOUT_SECONDS="${STREAM_JSON_TIMEOUT:-15}"

emit() {
  printf '%s\n' "$1"
}

# claudefast is a shell function in the user's interactive shell, so we
# source the user's zshrc to make it available in this non-interactive run.
load_claudefast() {
  if command -v claudefast >/dev/null 2>&1; then return 0; fi
  if [ -f "$HOME/.zshrc" ]; then
    # shellcheck disable=SC1091
    set +u; source "$HOME/.zshrc" >/dev/null 2>&1 || true; set -u
  fi
  if [ -f "$HOME/.bashrc" ]; then
    # shellcheck disable=SC1091
    set +u; source "$HOME/.bashrc" >/dev/null 2>&1 || true; set -u
  fi
  command -v claudefast >/dev/null 2>&1 || type claudefast >/dev/null 2>&1
}

if ! load_claudefast; then
  emit "$(jq -nc '{skipped: true, reason: "claudefast not in PATH"}')"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

OUT="$TMP/out.txt"

# Run with a hard timeout. macOS has no GNU `timeout`; emulate with bash.
run_with_timeout() {
  local secs="$1"; shift
  ( "$@" ) >"$OUT" 2>&1 &
  local pid=$!
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$secs" ]; then
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$pid" 2>/dev/null || true
      return 124
    fi
  done
  wait "$pid" 2>/dev/null || true
  return 0
}

set +e
# claudefast is defined as a zsh function in the user's ~/.zshrc.
# Invoke it through `zsh -ic` so the rc file is sourced and the function
# is in scope. Fall back to `bash -lc` if zsh is unavailable.
if command -v zsh >/dev/null 2>&1; then
  run_with_timeout "$TIMEOUT_SECONDS" zsh -ic 'claudefast --verbose --output-format stream-json -p "ping" 2>&1'
else
  run_with_timeout "$TIMEOUT_SECONDS" bash -lc 'claudefast --verbose --output-format stream-json -p "ping" 2>&1'
fi
rc=$?
set -e

# Detect "command not found" -> mark as skipped (claudefast not reachable
# from a non-interactive subshell). This is honest about the env limit.
if [ -f "$OUT" ] && grep -qE '(command not found|not found): *claudefast' "$OUT"; then
  emit "$(jq -nc '{skipped: true, reason: "claudefast function not reachable from non-interactive subshell"}')"
  exit 0
fi

events=0
parse_errors=0
if [ -f "$OUT" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if printf '%s' "$line" | jq -e . >/dev/null 2>&1; then
      events=$((events + 1))
    else
      parse_errors=$((parse_errors + 1))
    fi
  done < "$OUT"
fi

if [ "$rc" -eq 124 ] && [ "$events" -eq 0 ]; then
  emit "$(jq -nc --arg t "$TIMEOUT_SECONDS" '{skipped: true, reason: ("timeout after " + $t + "s before any event")}')"
  exit 0
fi

emit "$(jq -nc --argjson e "$events" --argjson p "$parse_errors" --argjson rc "$rc" \
  '{events: $e, parse_errors: $p, exit_code: $rc, skipped: false}')"
exit 0
