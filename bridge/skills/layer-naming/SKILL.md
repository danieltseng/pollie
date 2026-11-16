---
name: layer-naming
description: Rename layers, instances and screens to the team naming rules without changing anything else. Use for "Rename layers", "整理命名", "照命名規則改名", or before handing a file to developers.
---

> The naming rules in **Team rules** (system prompt) are the source of truth and win over the defaults below. This guide is how to apply them quickly and safely.

# Layer naming

## What to rename (defaults when Team rules don't say otherwise)
- Default or generic names: `Frame 12`, `Group 3`, `Rectangle 5`, `Vector`, `Container`, `Stack`, `Item text`.
- Text layers named after their content: name by role (`Title`, `Store name`, `Price`).
- Instances: `Component - Purpose`, last segment of the component name only, no variant/state/device; no data-driven suffix for data-driven components.
- Icons: `Icon - Purpose`, by function not shape.
- Screens (top-level frames): `Feature_State`.
- Separators only ` - `; sentence case; no leading/trailing spaces or typos.

## Quick action playbook ("Rename layers")
1. Scope: the selection (all descendants); nothing selected → current page. Skip hidden/locked layers and anything inside instances (their inner layers belong to the component).
2. Collect in one `figma_execute`: id, type, current name, parent name, text content (for TEXT), main component name (for INSTANCE). Return only layers that break a rule.
3. Decide each new name from its role in context (what it is for in this screen), then rename everything in one call. **Only change names** — never move, resize, restyle or delete.
4. **Self-check**: re-collect; no default names, no text layer equal to its content, no ` / ` or `·` separators, instances follow `Component - Purpose`. Fix leftovers once.
5. Report (user's language): "改了 N 個名稱（畫面 a、instance b、文字 c、其他 d）"; then "不確定的：…" one line each with old → new and why (e.g. unclear purpose), or "沒有不確定的".
