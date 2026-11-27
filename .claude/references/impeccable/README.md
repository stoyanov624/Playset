# Impeccable design references (vendored)

From https://github.com/pbakaus/impeccable, commit `2fc5e1459efbbf06d92c7306517c286bf12490cf`, Apache-2.0 (LICENSE, NOTICE.md here). Copied unchanged; only text, no scripts, no hooks — the Impeccable plugin itself is deliberately not installed (it runs a downloaded binary on every edit, sends telemetry, and its live mode can launch an agent with permissions bypassed).

- `craft-floor.md` — the quality floor and the **Refuse** list of generic-AI patterns. Used by the design pass and `design-review`.
- `critique-rubric.md` — cognitive load, heuristics, personas for design critique.

Where these files say to run `"<skill-base-dir>/scripts/impeccable" …` (shot, detect, font-fetch), ignore it: in Playset, screenshots come from Playwright MCP and fonts are chosen in `docs/design.md`.
