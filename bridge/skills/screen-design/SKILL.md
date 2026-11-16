---
name: screen-design
description: Design or restructure a screen or section using the file's components and tokens — information hierarchy, layout, spacing rhythm, component choice, realistic English copy, placement on canvas. Use for "做一個新畫面 / 新頁面 / 新區塊", "幫我排版", "重新設計這塊", or adding a sizeable section to an existing screen.
---

> If the system prompt contains **Team rules**, they win over anything in this guide (naming, sizes, structure).

# Screen design

## 1. Decide before building (think, don't call tools yet)
- Purpose: what single job does this screen do? What is the one primary action?
- Content inventory: list the sections top-to-bottom (e.g. Nav bar → Title + subtitle → Form fields → Primary button → Secondary link → Footer note). Cut anything that does not serve the job.
- Reuse: for every section, which existing component or sibling-screen pattern covers it? Look at the selection and sibling screens first; copy their structure (nav, headers, paddings, frame size).
- Platform & size: same frame width/height and safe areas as sibling screens. If none: mobile 390×844, desktop 1440×1024.

## 2. Hierarchy & layout rules
- One focal point: the primary heading and the primary action are the strongest elements; everything else is quieter (smaller text style, secondary color, secondary variants).
- Grouping by spacing: related items close (8–12), groups apart (24–32), major sections further (40–48). Use the file's spacing tokens; keep the rhythm consistent on the whole screen.
- Alignment: one left edge for content; consistent horizontal padding (match siblings, usually 16–24 mobile, 32–80 desktop).
- Build everything with auto layout: screen frame VERTICAL → section frames → rows (HORIZONTAL). Children that should stretch use `fill: "h"`. No absolute positioning except overlays.
- Primary button full-width on mobile forms; on desktop, buttons hug their label.
- Respect reading order and states: empty/error/loading only when asked or obviously needed.

## 3. Copy (always English, realistic)
- Titles: short and specific ("Create your account", "Payment methods"), sentence case unless the file uses Title Case.
- Buttons: verb-first, 1–3 words ("Continue", "Add card", "Send invite").
- Helper/body text: one sentence, plain words.
- Data: believable names (e.g. "Maya Chen", "Sam Park"), real-looking emails, prices with currency ("$24.00"), dates like "Mar 12, 2026". Vary list items — never repeat the same row.
- No lorem ipsum, no "Text", no "Button".

## 4. Build (one `figma_execute` when possible)
```js
const ref = await h.node(selectionId);               // sibling screen to match
const screen = await h.frame({ name: "Sign up", dir: "V", w: ref.width, h: ref.height, fill: "bg/default", padding: "spacing/xl", gap: "spacing/lg" });
await h.placeRight(screen, ref);
const header = await h.frame({ name: "Header", dir: "V", gap: "spacing/xs", parent: screen, sizing: { fill: "h" } });
await h.text("Create your account", { style: "Heading/L", color: "text/primary", parent: header, width: "fill" });
await h.text("It takes less than a minute.", { style: "Body/M", color: "text/secondary", parent: header, width: "fill" });
await h.component("Input", { Label: "Email", Placeholder: "maya.chen@example.com" }, { parent: screen, fill: "h" });
await h.component("Button", { Variant: "Primary", Label: "Continue" }, { parent: screen, fill: "h" });
await h.select(screen);
return { id: screen.id };
```
Adapt names to the actual tokens/components in `designSystem` — never guess names that aren't listed.

## 5. Check
- If layout correctness is uncertain (many nested auto layouts, long text), take one `figma_screenshot` and fix obvious issues (overflow, clipped text, misaligned edges) in one more call. Otherwise skip it — speed matters.
- Name every layer by its role (never "Frame 12"); follow the team naming rules when present.

## Quick action playbook ("New screen")
1. Reference: the selected screen(s) are the style reference; place the new screen to the right of them (`h.placeRight`, gap 200). Nothing selected → use the most similar screen on the page as reference and say which.
2. Decide content and hierarchy (section 1) from the user's description; if the description is empty, infer the most likely next screen in the flow and say so.
3. Build with components and tokens only (section 4), name every layer by the team naming rules, screen name `Feature_State`.
4. **Self-check** (one `figma_execute` + one `figma_screenshot`): no hardcoded colors/text without style, no default layer names, nothing overflowing the frame; fix and re-check once.
5. Report: screen name, what sections it has (one line), which components were reused, and anything hand-built because the DS had no match.
