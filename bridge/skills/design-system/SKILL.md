---
name: design-system
description: Apply, audit or enforce the file's design system — find hardcoded colors, font sizes, spacing, radii and detached elements, and map them to the right variables, styles and component variants. Use for "套用設計系統", "對齊規範", "改成用 token", or whenever choosing which token/variant fits a situation.
---

> If the system prompt contains **Team rules**, they win over anything in this guide (naming, sizes, structure).

# Design system: choosing and applying tokens

## Source of truth, in order
1. Variables (tokens) in the file or enabled libraries — `designSystem.variables`, `libraryVariableCollections`.
2. Color / text / effect styles.
3. Components and their variants — local first, then library components already used in the file.
4. Patterns already used on sibling screens (what the team actually does).
Never invent a new token, style or component when a fitting one exists. If nothing fits, use the closest one and say so in one line of the reply.

## Reading token names
- Semantic tokens beat primitives: prefer `text/primary`, `bg/surface`, `border/subtle`, `action/primary` over `blue/500` or `gray/100`. Use a primitive only if no semantic token covers the role.
- Match by role, not by hex: a dark gray on body text is `text/secondary`, even if a primitive has the identical hex.
- Respect modes: bind the variable, never paste its current value — light/dark modes then keep working.
- Spacing/radius tokens: snap to the nearest step of the scale (e.g. 4/8/12/16/24/32). Off-scale values (13, 18, 22) are almost always mistakes; round to the nearest step that preserves the visual intent.

## Choosing components & variants
- Use the component the team uses for that role elsewhere in the file (look at sibling screens' instances first).
- Variant by intent: one primary action per view; secondary/tertiary/ghost for the rest; destructive only for destructive actions; disabled only when the UI state is disabled.
- Size by context: match the size used by siblings in the same container.
- Prefer swapping an instance's variant (`h.setProps` / `h.component`) over restyling it. Never detach an instance to restyle it.
- A raw frame that duplicates an existing component (a hand-built button, a hand-built input) should be replaced by an instance with the same label/content.
- When no existing component fits the situation, building it from frames is fine — still use DS components for the small parts inside (buttons, icons, dividers) and bind tokens/styles. Mention in one line which part was hand-built because the DS has no match.

## Audit procedure ("套用設計系統 / 檢查")
1. Collect candidates in one `figma_execute`: walk the selection and return, per node, hardcoded fills/strokes (no bound variable, no style), text without a text style, auto-layout gaps/paddings/radii not bound to tokens and off-scale, and frames that look like existing components (name or structure match).
2. Map each to a token/style/variant using the rules above. Group identical fixes.
3. Apply all fixes in one call with `h.fill`, `h.stroke`, `h.num`, `textStyle` via `node.setTextStyleIdAsync`, and instance replacement via `h.component` (copy over label text, keep position/size/parent index).
4. Reply with counts: e.g. "綁定 12 個顏色、3 個字級、5 個間距；把 2 個自製按鈕換成 Button/Secondary。" If something had no match, name it in one line.

## Quick action playbook ("Apply design system")
1. Scope: the selection; if nothing is selected, the current page. Skip hidden and locked layers.
2. Audit in one `figma_execute` (procedure above) and return a compact list grouped by kind: colors, text styles, spacing/padding, radii, raw frames that duplicate components.
3. Fix everything that has a clear match in one call. Do not redesign.
4. **Self-check**: run the same audit again on the scope. Anything still hardcoded must be in your "no match" list — otherwise fix it.
5. Report in this format (user's language):
   - "顏色：綁定 N 個 token" / "字級：套用 N 個文字樣式" / "間距與圓角：N 個" / "元件：把 N 個自製元素換成 instance（列名稱）"
   - "找不到對應：…（每項一行，寫值與位置）" — or "全部都有對應" if none.

## Don'ts
- Don't change visual design while "applying the design system" beyond snapping to the scale; this is a mapping job, not a redesign.
- Don't bind text color on instances where the component already controls it unless it was overridden.
- Don't touch hidden layers or locked layers unless asked.
