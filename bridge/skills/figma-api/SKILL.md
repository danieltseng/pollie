---
name: figma-api
description: Figma Plugin API pitfalls and raw-API patterns — use when the `h` helpers don't cover what you need (effects, constraints, grids, boolean ops, images, vectors, variables/modes, pages, component authoring) or when a figma_execute call fails with an error you don't understand.
---

# Figma Plugin API — pitfalls & patterns

The file uses `documentAccess: dynamic-page`. Sync getters that touch other pages throw; always use the `…Async` variants.

## Errors you will see, and the fix
| Error contains | Cause → fix |
|---|---|
| `Cannot unwrap symbol` / `fontName` / `unloaded font` | Text edited before its font loaded → `await figma.loadFontAsync(node.fontName)`; for mixed fonts load every `node.getRangeAllFontNames(0, node.characters.length)`. New text: load font **before** setting `characters`. (`h.text` / `h.setText` do this.) |
| `in documentAccess: dynamic-page, use …Async` | Use `getNodeByIdAsync`, `getMainComponentAsync`, `getLocalVariablesAsync`, `getStyleByIdAsync`, `setTextStyleIdAsync`, `setFillStyleIdAsync`, `setVectorNetworkAsync`, `setReactionsAsync`, `figma.loadAllPagesAsync()` before `figma.root.findAll…`. |
| `layoutSizingHorizontal … can only be set on children of auto-layout` | Set `FILL`/`HUG` **after** `appendChild` into an auto-layout parent. (`h.append(parent, child, { fill: "h" })`.) |
| `Cannot set width/height … auto` / resize ignored | The axis is `AUTO`/`HUG`; set `primaryAxisSizingMode`/`counterAxisSizingMode = "FIXED"` (or `layoutSizing… = "FIXED"`) first, then `resize`. |
| `Cannot move node. New parent is an instance` / `read-only` | You can't add/remove children inside an instance. Change it via component props, or `instance.detachInstance()` only if the user explicitly asked. |
| `setProperties … property not found` | Text/boolean/instance-swap keys carry an id suffix: use the full key from `instance.componentProperties` (e.g. `Label#12:3`). `h.setProps` resolves short names. |
| `Invalid variant property` | Variant values must match an existing option exactly; read `componentSet.componentPropertyDefinitions[k].variantOptions`. |
| `setBoundVariable … not a valid field` / type mismatch | Bind FLOAT variables only to numeric fields; COLOR variables go through `figma.variables.setBoundVariableForPaint(paint, "color", v)` and then `node.fills = [paint]`. |
| `object is not extensible` / changes don't stick on fills/effects | Arrays are immutable copies: clone, edit, reassign — `const f = JSON.parse(JSON.stringify(node.fills)); f[0].opacity = .5; node.fills = f;` |
| `node does not exist` after creating many nodes | You held a stale reference after `remove()`/`detachInstance()`/`flatten`; re-fetch by id. |

## Patterns not covered by `h`
- Effects: `node.effects = [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: .12 }, offset: { x: 0, y: 4 }, radius: 16, spread: 0, visible: true, blendMode: "NORMAL" }]` — prefer an effect style: `await node.setEffectStyleIdAsync((await h.effectStyle("Shadow/M")).id)`.
- Images: `const img = figma.createImage(bytes)` needs bytes; from a URL: `const img = await figma.createImageAsync(url); node.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }]`. For placeholders without a URL use a neutral fill rectangle named "Image".
- Constraints (non-auto-layout parents): `node.constraints = { horizontal: "STRETCH", vertical: "MIN" }`.
- Absolute child inside auto layout (badges, overlays): `child.layoutPositioning = "ABSOLUTE"` after appending.
- Grids: `frame.layoutGrids = [{ pattern: "COLUMNS", alignment: "STRETCH", count: 4, gutterSize: 16, offset: 16 }]`.
- Variable modes on a frame: `frame.setExplicitVariableModeForCollection(collection, modeId)` (e.g. preview dark mode).
- Pages: `await figma.setCurrentPageAsync(page)`; create with `figma.createPage()`.
- Duplicate a screen: `const copy = src.clone(); await h.placeRight(copy, src);` — clones keep bindings and instances.
- Grouping: `figma.group(nodes, parent)`; frames from selection: wrap with `h.frame` and `h.append` each node.
- Create a component from a frame (only when asked): `const c = figma.createComponentFromNode(frame)`; component set: `figma.combineAsVariants(components, parent)`.
- Text ranges: `t.setRangeFontName(start, end, font)`, `t.setRangeFills(...)`, `t.setRangeTextStyleIdAsync(start, end, id)`; load the font first.
- Find things fast: `node.findAllWithCriteria({ types: ["TEXT"] })` is much faster than `findAll(fn)` on big trees.

## Performance
- Batch: one `figma_execute` doing 50 edits beats 50 calls.
- Avoid `figma.root.findAll` on huge files; scope to the selection or current page.
- Return ids/counts, not serialized trees; use `figma_read` with low depth when you need structure.
