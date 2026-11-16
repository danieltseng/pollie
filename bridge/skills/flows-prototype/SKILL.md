---
name: flows-prototype
description: Turn several selected screens into a user-flow diagram or a clickable prototype — infer order and branches, lay screens out, draw labelled arrows, add prototype links. Use for "連成流程圖", "串成 flow", "做成 prototype / 可以點", "user flow".
---

> If the system prompt contains **Team rules**, they win over anything in this guide (naming, sizes, structure).

# Flows & prototypes

## 1. Infer the flow (think first)
- Read each screen's name, title text and button/link labels from the context. Match actions to destinations: a "Sign in" button → the screen whose title/name is the signed-in state; "Forgot password?" → the reset screen; "Back"/"Cancel" → previous step.
- Order: entry point first (splash/landing/login), then the happy path left → right, then outcomes (success, error).
- Branches: alternate paths (error, forgot password, empty state, optional step) go on a separate row below the step they branch from, aligned under it.
- If two orderings are equally plausible and it matters, pick the most conventional one and mention the assumption in one short line instead of asking.

## 2. Diagram (design file)
- Layout: `h.layoutRow([[main1, main2, main3], [null, branchA]], { gapX: 200, gapY: 240 })` — `null` keeps a branch under its parent column. gapX ≥ 160 so labels fit.
- Arrows: one per transition, `h.arrow(from, to, label)`. Label = the user action in English, short ("Tap Sign in", "Submit form", "Payment fails"). Back-links only if the user asked.
- **Start the arrow at the trigger**: pass the button/link inside the source screen as `from` (the instance whose label matches the action), not the whole screen, whenever such a layer exists. The line then starts on that button.
- Keep arrows and labels in one place: group them at the end into "Flow arrows" with `figma.group(nodes, figma.currentPage)`.

### House style for flow arrows (always)
- **Color**: blue-violet `#5F6FF0` for every line and its label (the default of `h.arrow`; don't override it with grey tokens). Error/failure paths may use the file's danger token if the user asks for a distinction.
- **Start / end**: a filled circle where the line starts, an arrow head at the destination (both set by `h.arrow`).
- **Routing**: right-angle lines with 20px rounded corners. Corners must sit in the empty space between screens, never inside a screen. `h.arrow` does this: same row → leaves from the side and turns in the gap; different rows → turns in the gap between the rows; screens in the way → goes over the top of the row. Lay screens out first (`h.layoutRow`) so the gaps exist (gapX ≥ 160, gapY ≥ 200).
- If several lines leave the same screen edge and still touch, pass `{ lane: 1 }`, `{ lane: 2 }` to the later ones.
- **Labels**: an auto-layout chip centred on the line, outside the screens: 8px padding, white fill, 1px outline in the same blue-violet as the text (made by `h.arrow`). Keep them to 1–3 words.
- Optional: a small title text above the row ("Onboarding flow") using a heading style.
- Finish with `h.select([...screens])`.

## 3. Prototype (when asked for 可以點 / prototype / clickable)
- Find the actual trigger layer inside the source screen (the button/link instance whose label matches the action) and link it: `h.link(button, destination)`. Link the whole frame only if no trigger exists.
- Transitions: forward navigation `SMART_ANIMATE` (or `DISSOLVE` if layouts differ a lot), back navigation the same; modals: `DISSOLVE`.
- Set the flow starting point if appropriate: `figma.currentPage.flowStartingPoints = [{ nodeId: first.id, name: "Main flow" }]`.
- Both diagram and prototype can be done together if the user wants both.

## 4. FigJam
If `editor` is `figjam`, use native connectors instead of vectors:
```js
const c = figma.createConnector();
c.connectorStart = { endpointNodeId: a.id, magnet: "AUTO" };
c.connectorEnd = { endpointNodeId: b.id, magnet: "AUTO" };
c.connectorEndStrokeCap = "ARROW_LINES";
await figma.loadFontAsync(c.text.fontName); c.text.characters = "Tap Sign in";
```

## Quick action playbook ("Connect as flow")
1. Read the selected screens (names, titles, button labels) and decide order + branches (section 1). Need at least 2 screens; if fewer are selected, say so in one line and stop.
2. Lay them out with `h.layoutRow` (main path in one row, branches below).
3. For each transition find the trigger layer and call `h.arrow(trigger || screen, destination, "Action label")`.
4. Group arrows + labels as "Flow arrows"; `h.select` the screens.
5. **Self-check** (one `figma_execute` returning the facts, fix and re-check once if needed): every screen except the entry point has at least one incoming arrow; no arrow corner is inside a screen; no two labels overlap.
6. Report in the format below.

## Reply
Short summary in the user's language:
- Order used and branches, e.g. "Login → Home → Profile；Forgot password 是 Login 下方的分支"
- Counts: "加了 5 條箭頭（4 條從按鈕出發）"
- Anything assumed or not found (e.g. "Settings 找不到對應的按鈕，箭頭從畫面邊緣出發").
