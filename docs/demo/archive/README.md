<!--
   v1 mock (kept for diff)         v2 real (replaces it)
   ===============                 ================
   synthesized JSON  -> hook .cjs  claudefast TUI -> hook .cjs
   bash ANSI banners               real Claude code blocks
   21 s, deterministic             ~60 s, real LLM round-trip
-->

# demo/archive

Older demo recordings kept for diff. Do **not** edit these — they are evidence of how the demo evolved.

| File | Description |
|---|---|
| `teamagent-demo-v1-mock.cast` | First recording. Drove the hook `.cjs` files directly with synthesized hook events under an isolated `HOME`. Deterministic but not a real Claude Code session. |
| `teamagent-demo-v1-mock.gif`  | Rendered with `agg` from the v1 cast. 688×490, 21.5 s, 562 KB. |

The current production demo at `docs/demo/teamagent-demo.{cast,gif}` is a real interactive `claudefast` session driven inside tmux.
