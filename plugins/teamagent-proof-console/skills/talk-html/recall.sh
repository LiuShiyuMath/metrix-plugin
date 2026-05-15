#!/usr/bin/env bash
# recall.sh — list or open talk-html artifacts.
# usage:
#   recall.sh                  → list latest 20 (most recent first)
#   recall.sh <substring>      → open the most recent artifact whose slug or prompt contains <substring>
#   recall.sh --all            → list all entries

set -euo pipefail

INDEX="$HOME/.claude/talk-html/index.jsonl"
[[ -f "$INDEX" ]] || { echo "no talk-html artifacts yet (index missing: $INDEX)"; exit 0; }

# reverse the file (macOS-friendly: tail -r; gnu: tac)
reverse() {
  if command -v tac >/dev/null 2>&1; then tac "$1"
  else tail -r "$1"
  fi
}

if [[ $# -eq 0 ]]; then
  echo "recent talk-html artifacts (most recent first, top 20):"
  reverse "$INDEX" | head -n 20 | jq -r '"\(.created_at)  \(.slug)\n            → \(.rendered_url)"'
  exit 0
fi

if [[ "$1" == "--all" ]]; then
  reverse "$INDEX" | jq -r '"\(.created_at)  \(.slug)\n            → \(.rendered_url)"'
  exit 0
fi

QUERY="$1"
# match against slug or prompt_summary in meta, most recent wins
MATCH="$(reverse "$INDEX" | jq -c --arg q "$QUERY" 'select((.slug | ascii_downcase | contains($q | ascii_downcase)) or ((.meta.prompt_summary // "") | ascii_downcase | contains($q | ascii_downcase)))' | head -n 1)"

[[ -n "$MATCH" ]] || { echo "no match for: $QUERY"; exit 1; }

URL="$(echo "$MATCH" | jq -r .rendered_url)"
SLUG="$(echo "$MATCH" | jq -r .slug)"
echo "opening: $SLUG"
echo "         $URL"
open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || echo "(could not auto-open; copy the URL above)"
