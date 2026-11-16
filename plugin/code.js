// Pollie — plugin main thread.
// Runs inside Figma's sandbox: reads the document, serializes context and
// executes Plugin API code sent by Claude Code (via ui.html <-> local bridge).

var MIN_W = 320, MIN_H = 420, MAX_W = 1200, MAX_H = 1600;
figma.showUI(__html__, { width: 380, height: 600, themeColors: true });
figma.clientStorage.getAsync("panelSize").then(function (sz) {
  if (sz && sz.w && sz.h) figma.ui.resize(sz.w, sz.h);
}).catch(function () {});

function clampSize(w, h) {
  return { w: Math.round(Math.min(MAX_W, Math.max(MIN_W, w))), h: Math.round(Math.min(MAX_H, Math.max(MIN_H, h))) };
}

// ---------------------------------------------------------------- helpers

var MAX_NODES = 350;
var varNameCache = {};
var styleNameCache = {};

function round(n) {
  return typeof n === "number" ? Math.round(n * 10) / 10 : n;
}

function toHex(c) {
  function h(v) {
    var s = Math.round(v * 255).toString(16);
    return s.length === 1 ? "0" + s : s;
  }
  return "#" + h(c.r) + h(c.g) + h(c.b);
}

var annCats = null;
async function annotationCategory(id) {
  try {
    if (!annCats) {
      annCats = {};
      var cats = await figma.annotations.getAnnotationCategoriesAsync();
      cats.forEach(function (c) { annCats[c.id] = c.label; });
    }
    return annCats[id] || id;
  } catch (e) { return id; }
}

function fileKey() {
  try { if (figma.fileKey) return figma.fileKey; } catch (e) {}
  return figma.root.getPluginData("fileKey") || null;
}

async function varName(id) {
  if (!id) return null;
  if (varNameCache[id] !== undefined) return varNameCache[id];
  var name = id;
  try {
    var v = await figma.variables.getVariableByIdAsync(id);
    if (v) name = v.name;
  } catch (e) {}
  varNameCache[id] = name;
  return name;
}

async function styleName(id) {
  if (!id || typeof id !== "string") return null;
  if (styleNameCache[id] !== undefined) return styleNameCache[id];
  var name = id;
  try {
    var s = await figma.getStyleByIdAsync(id);
    if (s) name = s.name;
  } catch (e) {}
  styleNameCache[id] = name;
  return name;
}

async function paints(list) {
  if (!list || list === figma.mixed || !list.length) return undefined;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (p.visible === false) continue;
    if (p.type === "SOLID") {
      var item = { hex: toHex(p.color) };
      if (p.opacity !== undefined && p.opacity < 1) item.opacity = round(p.opacity);
      if (p.boundVariables && p.boundVariables.color) {
        item.var = await varName(p.boundVariables.color.id);
      }
      out.push(item);
    } else {
      out.push({ type: p.type });
    }
  }
  return out.length ? out : undefined;
}

async function boundVars(node) {
  var bv = node.boundVariables;
  if (!bv) return undefined;
  var out = {};
  var any = false;
  for (var key in bv) {
    if (key === "fills" || key === "strokes") continue;
    var val = bv[key];
    var alias = Array.isArray(val) ? val[0] : val;
    if (alias && alias.id) {
      out[key] = await varName(alias.id);
      any = true;
    }
  }
  return any ? out : undefined;
}

// Compact, token-friendly snapshot of a node tree.
async function serialize(node, depth, state) {
  state = state || { count: 0 };
  if (depth === undefined) depth = 3;
  state.count++;
  var o = { id: node.id, name: node.name, type: node.type };
  if (state.count > MAX_NODES) {
    o.truncated = true;
    return o;
  }
  if ("x" in node) {
    o.x = round(node.x);
    o.y = round(node.y);
    o.w = round(node.width);
    o.h = round(node.height);
  }
  if (node.visible === false) o.hidden = true;

  if ("layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE") {
    o.layout = {
      mode: node.layoutMode,
      gap: node.itemSpacing,
      pad: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
      main: node.primaryAxisAlignItems,
      cross: node.counterAxisAlignItems,
    };
    if (node.layoutWrap === "WRAP") o.layout.wrap = true;
  }
  if ("layoutSizingHorizontal" in node && node.parent && "layoutMode" in node.parent) {
    o.sizing = [node.layoutSizingHorizontal, node.layoutSizingVertical];
  }
  if ("fills" in node) {
    var f = await paints(node.fills);
    if (f) o.fills = f;
    if (node.fillStyleId && node.fillStyleId !== figma.mixed && node.fillStyleId !== "") {
      o.fillStyle = await styleName(node.fillStyleId);
    }
  }
  if ("strokes" in node && node.strokes && node.strokes.length) {
    o.strokes = await paints(node.strokes);
  }
  if ("cornerRadius" in node && node.cornerRadius && node.cornerRadius !== figma.mixed) {
    o.radius = node.cornerRadius;
  }
  if ("effects" in node && node.effects && node.effects.length && node.effectStyleId) {
    o.effectStyle = await styleName(node.effectStyleId);
  }
  var bv = await boundVars(node);
  if (bv) o.vars = bv;

  // Dev Mode annotations on this layer
  if ("annotations" in node && node.annotations && node.annotations.length) {
    o.annotations = [];
    for (var ai = 0; ai < node.annotations.length; ai++) {
      var an = node.annotations[ai], item = {};
      var lbl = an.labelMarkdown || an.label;
      if (lbl) item.note = lbl.length > 400 ? lbl.slice(0, 400) + "…" : lbl;
      if (an.properties && an.properties.length) item.pins = an.properties.map(function (pp) { return pp.type; });
      if (an.categoryId) item.category = await annotationCategory(an.categoryId);
      o.annotations.push(item);
    }
  }

  if (node.type === "TEXT") {
    o.text = node.characters.length > 300 ? node.characters.slice(0, 300) + "…" : node.characters;
    if (node.fontSize !== figma.mixed) o.fontSize = node.fontSize;
    if (node.fontName !== figma.mixed) o.font = node.fontName.family + " " + node.fontName.style;
    if (node.textStyleId && node.textStyleId !== figma.mixed && node.textStyleId !== "") {
      o.textStyle = await styleName(node.textStyleId);
    }
  }

  if (node.type === "INSTANCE") {
    try {
      var main = await node.getMainComponentAsync();
      if (main) {
        o.component = main.name;
        if (main.parent && main.parent.type === "COMPONENT_SET") o.componentSet = main.parent.name;
        o.componentKey = main.key;
        if (main.remote) o.library = true;
      }
    } catch (e) {}
    try {
      var props = node.componentProperties;
      var p = {};
      for (var k in props) p[k.split("#")[0]] = props[k].value;
      o.props = p;
    } catch (e) {}
    // Instances: do not descend unless explicitly asked (keeps output small).
    if (depth < 99) depth = Math.min(depth, 1);
  }

  if ("children" in node && node.children.length) {
    if (depth > 0) {
      o.children = [];
      for (var i = 0; i < node.children.length; i++) {
        if (state.count > MAX_NODES) {
          o.children.push({ truncated: node.children.length - i + " more" });
          break;
        }
        o.children.push(await serialize(node.children[i], depth - 1, state));
      }
    } else {
      o.childCount = node.children.length;
    }
  }
  return o;
}

// Make any value JSON-safe (nodes -> summaries, cycles cut).
function toPlain(v, d) {
  d = d || 0;
  if (v === null || v === undefined) return v;
  if (v === figma.mixed) return "mixed";
  if (typeof v !== "object") return v;
  if (d > 6) return "[…]";
  if (v.id && v.type && typeof v.type === "string" && "name" in v) {
    return { id: v.id, name: v.name, type: v.type };
  }
  if (Array.isArray(v)) return v.slice(0, 200).map(function (x) { return toPlain(x, d + 1); });
  var out = {};
  for (var k in v) {
    try { out[k] = toPlain(v[k], d + 1); } catch (e) {}
  }
  return out;
}

// ---------------------------------------------------------------- design system index

var dsCache = null;

async function designSystem(force) {
  if (dsCache && !force) return dsCache;
  var ds = { file: figma.root.name, editor: figma.editorType };

  // Variables
  try {
    var cols = await figma.variables.getLocalVariableCollectionsAsync();
    var colName = {};
    ds.variableCollections = cols.map(function (c) {
      colName[c.id] = c.name;
      return { name: c.name, modes: c.modes.map(function (m) { return m.name; }) };
    });
    var vars = await figma.variables.getLocalVariablesAsync();
    ds.variables = [];
    for (var i = 0; i < vars.length && i < 600; i++) {
      var v = vars[i];
      var col = cols.find(function (c) { return c.id === v.variableCollectionId; });
      var raw = col ? v.valuesByMode[col.defaultModeId] : undefined;
      var value = raw;
      if (raw && raw.type === "VARIABLE_ALIAS") value = "→" + (await varName(raw.id));
      else if (raw && typeof raw === "object" && "r" in raw) value = toHex(raw);
      ds.variables.push({ id: v.id, name: v.name, type: v.resolvedType, collection: colName[v.variableCollectionId], value: value });
    }
  } catch (e) {
    ds.variablesError = String(e);
  }

  // Styles
  try {
    var ps = await figma.getLocalPaintStylesAsync();
    ds.colorStyles = ps.map(function (s) {
      var p = s.paints[0];
      return { id: s.id, name: s.name, hex: p && p.type === "SOLID" ? toHex(p.color) : p && p.type };
    });
    var ts = await figma.getLocalTextStylesAsync();
    ds.textStyles = ts.map(function (s) {
      return { id: s.id, name: s.name, font: s.fontName.family + " " + s.fontName.style, size: s.fontSize };
    });
    var es = await figma.getLocalEffectStylesAsync();
    ds.effectStyles = es.map(function (s) { return { id: s.id, name: s.name }; });
  } catch (e) {
    ds.stylesError = String(e);
  }

  // Local components
  try {
    await figma.loadAllPagesAsync();
    var comps = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] });
    ds.components = [];
    for (var j = 0; j < comps.length && ds.components.length < 400; j++) {
      var c = comps[j];
      if (c.type === "COMPONENT" && c.parent && c.parent.type === "COMPONENT_SET") continue;
      var entry = { id: c.id, name: c.name, key: c.key, type: c.type };
      if (c.type === "COMPONENT_SET") {
        try {
          var defs = c.componentPropertyDefinitions;
          var d = {};
          for (var k in defs) {
            d[k.split("#")[0]] = defs[k].type === "VARIANT" ? defs[k].variantOptions : defs[k].type;
          }
          entry.props = d;
        } catch (e) {}
      }
      if (c.description) entry.desc = c.description.slice(0, 120);
      ds.components.push(entry);
    }
  } catch (e) {
    ds.componentsError = String(e);
  }

  // Library components already used in this file (current page)
  try {
    var seen = {};
    ds.libraryComponents = [];
    var inst = figma.currentPage.findAllWithCriteria({ types: ["INSTANCE"] });
    for (var n = 0; n < inst.length && n < 1500; n++) {
      var m = await inst[n].getMainComponentAsync();
      if (!m || !m.remote) continue;
      var setNode = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : null;
      var key = setNode ? setNode.key : m.key;
      if (seen[key]) continue;
      seen[key] = true;
      ds.libraryComponents.push({
        name: setNode ? setNode.name : m.name,
        key: key,
        kind: setNode ? "COMPONENT_SET" : "COMPONENT",
        exampleVariantKey: m.key,
      });
      if (ds.libraryComponents.length >= 200) break;
    }
  } catch (e) {
    ds.libraryError = String(e);
  }

  // Enabled team-library variable collections
  try {
    var libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    ds.libraryVariableCollections = libCols.map(function (c) {
      return { name: c.name, library: c.libraryName, key: c.key };
    });
  } catch (e) {}

  dsCache = ds;
  return ds;
}

// ---------------------------------------------------------------- context for a prompt


// ---------- Pollie data stored in the Figma file itself (follows the file to any computer; shared by everyone
// who opens this file with Pollie). Plugin data is private to this plugin id.
var FS_SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
var FS_SKILL_MAX = 50 * 1024;  // UTF-8 bytes; Figma caps plugin data, and CJK text is 3 bytes a character
function fsBytes(t) { return unescape(encodeURIComponent(t)).length; }
function fsRead(key, fallback) {
  try { var v = figma.root.getPluginData(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function fsWrite(key, value) {
  try { figma.root.setPluginData(key, value == null ? "" : JSON.stringify(value)); }
  catch (e) { throw new Error("You need edit access to this file to change what Pollie keeps in it."); }
}
function fsWho() { try { return (figma.currentUser && figma.currentUser.name) || ""; } catch (e) { return ""; } }
// anyone who can edit the file can write this data (even with a modified plugin): keep only well-formed items
function fsMemory() {
  var m = fsRead("pollie.memory", []);
  return (Array.isArray(m) ? m : []).filter(function (x) { return x && typeof x.text === "string" && typeof x.id === "string"; }).slice(0, 60)
    .map(function (x) { return { id: x.id.slice(0, 20), text: x.text.slice(0, 300), src: String(x.src || "").slice(0, 80), at: +x.at || 0, by: String(x.by || "").slice(0, 80) }; });
}
function fsSkills() {
  var s = fsRead("pollie.skills", []);
  return (Array.isArray(s) ? s : []).filter(function (x) { return x && typeof x.name === "string" && FS_SKILL_NAME.test(x.name); }).slice(0, 20)
    .map(function (x) { return { name: x.name, description: String(x.description || "").slice(0, 400), enabled: !!x.enabled, by: String(x.by || "").slice(0, 80), at: +x.at || 0 }; });
}
function fsState() {
  return { memory: fsMemory(), skills: fsSkills(), canEdit: figma.editorType !== "dev" };
}
function fsUid() { return Math.random().toString(36).slice(2, 12); }
function fsMemoryAdd(text, src) {
  text = String(text || "").trim().slice(0, 300);
  if (!text) throw new Error("empty");
  var m = fsMemory();
  if (m.some(function (x) { return x.text.trim().toLowerCase() === text.toLowerCase(); })) return null;
  var item = { id: fsUid(), text: text, src: String(src || "").slice(0, 80), at: Date.now(), by: fsWho() };
  m.push(item); while (m.length > 60) m.shift();
  fsWrite("pollie.memory", m);
  return item;
}
function fsApply(msg) {  // panel edits to file memory / file skills
  var m, s, i;
  if (msg.op === "mem-add") fsMemoryAdd(msg.text, msg.src);
  else if (msg.op === "mem-import") {  // move this file's memories that older versions kept on the Mac
    m = fsMemory();
    var moved = [];  // ids (from the Mac) now safely in the file; the panel deletes only these from the Mac
    (msg.items || []).forEach(function (x) {
      var t = String(x.text || "").trim().slice(0, 300);
      if (!t) return;
      if (m.some(function (y) { return y.text.trim().toLowerCase() === t.toLowerCase(); })) { moved.push(x.id); return; }
      if (m.length >= 60) return;  // full: leave the rest on the Mac rather than drop anything
      m.push({ id: fsUid(), text: t, src: String(x.src || "").slice(0, 80), at: x.at || Date.now(), by: fsWho() });
      moved.push(x.id);
    });
    fsWrite("pollie.memory", m);
    return { moved: moved };
  }
  else if (msg.op === "mem-update") { m = fsMemory(); m.forEach(function (x) { if (x.id === msg.id && String(msg.text || "").trim()) x.text = String(msg.text).trim().slice(0, 300); }); fsWrite("pollie.memory", m); }
  else if (msg.op === "mem-delete") { fsWrite("pollie.memory", fsMemory().filter(function (x) { return x.id !== msg.id; })); }
  else if (msg.op === "skill-add") {
    var name = String(msg.name || ""), text = String(msg.text || "");
    if (!FS_SKILL_NAME.test(name)) throw new Error("Invalid skill name");
    if (fsBytes(text) > FS_SKILL_MAX) throw new Error("The skill is too large to store in the file (max 50 KB).");
    s = fsSkills().filter(function (x) { return x.name !== name; });
    if (s.length >= 20) throw new Error("A file can hold at most 20 skills.");
    s.push({ name: name, description: String(msg.description || "").slice(0, 400), enabled: true, by: fsWho(), at: Date.now() });
    try { figma.root.setPluginData("pollie.skill:" + name, text); }  // text first: a failed write leaves no orphan entry
    catch (e) { throw new Error("Couldn't save the skill in this file (it may be too large, or you need edit access)."); }
    fsWrite("pollie.skills", s);
  }
  else if (msg.op === "skill-toggle") { s = fsSkills(); s.forEach(function (x) { if (x.name === msg.name) x.enabled = !!msg.enabled; }); fsWrite("pollie.skills", s); }
  else if (msg.op === "skill-delete") {
    if (!FS_SKILL_NAME.test(String(msg.name || ""))) throw new Error("Invalid skill name");
    fsWrite("pollie.skills", fsSkills().filter(function (x) { return x.name !== msg.name; }));
    figma.root.setPluginData("pollie.skill:" + msg.name, "");
  }
}

async function selectionContext() {
  var sel = figma.currentPage.selection;
  var state = { count: 0 };
  var nodes = [];
  var depth = sel.length > 3 ? 2 : 4;
  for (var i = 0; i < sel.length; i++) nodes.push(await serialize(sel[i], depth, state));
  var vp = figma.viewport.bounds;
  return {
    file: figma.root.name,
    fileKey: fileKey(),
    editor: figma.editorType,
    page: { id: figma.currentPage.id, name: figma.currentPage.name },
    viewport: { x: round(vp.x), y: round(vp.y), w: round(vp.width), h: round(vp.height) },
    selection: nodes,
    selectionIds: subtreeIds(sel, 3000),
    scopeKeys: scopeKeys(sel),
    fileMemory: fsMemory().map(function (x) { return { text: x.text }; }),
    fileSkills: fsSkills().map(function (x) { return { name: x.name, description: x.description, enabled: !!x.enabled }; }),
  };
}

// Which top-level screens a task touches ("<pageId>/<frameId>"), used to queue tasks on the same screen.
function scopeKeys(sel) {
  var keys = {};
  for (var i = 0; i < sel.length; i++) {
    var n = sel[i];
    while (n.parent && n.parent.type !== "PAGE") n = n.parent;
    keys[figma.currentPage.id + "/" + n.id] = true;
  }
  return Object.keys(keys);
}

// ids of the selection and everything inside it (used to match comments pinned to inner layers)
function subtreeIds(roots, cap) {
  var out = [];
  for (var i = 0; i < roots.length && out.length < cap; i++) {
    out.push(roots[i].id);
    if ("findAll" in roots[i]) {
      var all = roots[i].findAll(function () { return true; });
      for (var j = 0; j < all.length && out.length < cap; j++) out.push(all[j].id);
    }
  }
  return out;
}

// page id for each node id (null if the node no longer exists)
async function pagesOf(ids) {
  var out = {};
  for (var i = 0; i < ids.length; i++) {
    var n = null;
    try { n = await figma.getNodeByIdAsync(ids[i]); } catch (e) {}
    while (n && n.type !== "PAGE") n = n.parent;
    out[ids[i]] = n ? n.id : null;
  }
  return out;
}

function selectionSummary() {
  return figma.currentPage.selection.map(function (n) {
    return { id: n.id, name: n.name, type: n.type };
  });
}

// ---------------------------------------------------------------- helpers (`h`) for figma_execute
// Mechanical, always-the-same operations, so the agent spends its effort on design decisions.
// Every helper accepts node ids or nodes, and token/style/component names (case-insensitive).

var h = (function () {
  var cache = { vars: null, comps: null, textStyles: null, paintStyles: null, effectStyles: null };

  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }

  // Exact (normalized) match first, then "ends with /name", then contains. Throws with suggestions.
  function pick(list, name, getName, what) {
    var n = norm(name);
    var exact = list.filter(function (x) { return norm(getName(x)) === n; });
    if (exact.length) return exact[0];
    var tail = list.filter(function (x) { var v = norm(getName(x)); return v.slice(-n.length - 1) === "/" + n; });
    if (tail.length) return tail[0];
    var part = list.filter(function (x) { return norm(getName(x)).indexOf(n) >= 0; });
    if (part.length) return part[0];
    var sugg = list.slice(0, 400).map(getName).filter(function (v) {
      return n.split("/").some(function (seg) { return seg && norm(v).indexOf(seg.slice(0, 3)) >= 0; });
    }).slice(0, 12);
    throw new Error(what + ' "' + name + '" not found.' + (sugg.length ? " Similar: " + sugg.join(", ") : ""));
  }

  async function node(ref) {
    if (!ref) throw new Error("node is required");
    if (typeof ref === "object") return ref;
    var n = await figma.getNodeByIdAsync(ref);
    if (n) return n;
    var byName = figma.currentPage.findOne(function (x) { return x.name === ref; });
    if (byName) return byName;
    throw new Error('Node "' + ref + '" not found (use an id or exact layer name on the current page)');
  }

  // ------------------------------------------------ tokens & styles
  async function variables() {
    if (!cache.vars) cache.vars = await figma.variables.getLocalVariablesAsync();
    return cache.vars;
  }
  async function variable(name, type) {
    if (name && typeof name === "object") return name;
    var list = await variables();
    if (type) list = list.filter(function (v) { return v.resolvedType === type; });
    try {
      return pick(list, name, function (v) { return v.name; }, "Variable");
    } catch (e) {
      // fall back to enabled team libraries
      try {
        var cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        for (var i = 0; i < cols.length; i++) {
          var lv = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(cols[i].key);
          var hit = lv.filter(function (v) { return (!type || v.resolvedType === type) && (norm(v.name) === norm(name) || norm(v.name).slice(-norm(name).length - 1) === "/" + norm(name)); })[0];
          if (hit) return await figma.variables.importVariableByKeyAsync(hit.key);
        }
      } catch (e2) {}
      throw e;
    }
  }
  async function textStyle(name) {
    if (!cache.textStyles) cache.textStyles = await figma.getLocalTextStylesAsync();
    return pick(cache.textStyles, name, function (s) { return s.name; }, "Text style");
  }
  async function paintStyle(name) {
    if (!cache.paintStyles) cache.paintStyles = await figma.getLocalPaintStylesAsync();
    return pick(cache.paintStyles, name, function (s) { return s.name; }, "Color style");
  }
  async function effectStyle(name) {
    if (!cache.effectStyles) cache.effectStyles = await figma.getLocalEffectStylesAsync();
    return pick(cache.effectStyles, name, function (s) { return s.name; }, "Effect style");
  }

  function solid(hex) {
    var m = String(hex).replace("#", "");
    if (m.length === 3) m = m.split("").map(function (c) { return c + c; }).join("");
    return { type: "SOLID", color: { r: parseInt(m.slice(0, 2), 16) / 255, g: parseInt(m.slice(2, 4), 16) / 255, b: parseInt(m.slice(4, 6), 16) / 255 } };
  }

  // Color token name, color style name, or "#hex" (hex only as a last resort).
  async function paintFor(ref) {
    if (typeof ref === "string" && ref.charAt(0) === "#") return { paint: solid(ref) };
    try {
      var v = await variable(ref, "COLOR");
      return { paint: figma.variables.setBoundVariableForPaint(solid("#000000"), "color", v) };
    } catch (e) {
      try { return { style: await paintStyle(ref) }; } catch (e2) { throw e; }
    }
  }
  async function fill(n, ref) {
    n = await node(n);
    if (ref === null || ref === "none") { n.fills = []; return n; }
    var p = await paintFor(ref);
    if (p.style) await n.setFillStyleIdAsync(p.style.id); else n.fills = [p.paint];
    return n;
  }
  async function stroke(n, ref, weight) {
    n = await node(n);
    var p = await paintFor(ref);
    if (p.style) await n.setStrokeStyleIdAsync(p.style.id); else n.strokes = [p.paint];
    if (weight !== undefined) await num(n, "strokeWeight", weight);
    return n;
  }

  var FIELD_ALIASES = {
    padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    px: ["paddingLeft", "paddingRight"], py: ["paddingTop", "paddingBottom"],
    radius: ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"],
    gap: ["itemSpacing"], w: ["width"], h: ["height"],
  };
  // Number field(s) from a FLOAT token name, or a raw number.
  async function num(n, field, ref) {
    n = await node(n);
    var fields = FIELD_ALIASES[field] || [field];
    if (typeof ref === "number") {
      fields.forEach(function (f) {
        if (f === "width") n.resize(ref, n.height);
        else if (f === "height") n.resize(n.width, ref);
        else if (f === "strokeWeight") n.strokeWeight = ref;
        else n[f] = ref;
      });
      return n;
    }
    var v = await variable(ref, "FLOAT");
    fields.forEach(function (f) { n.setBoundVariable(f, v); });
    return n;
  }

  // ------------------------------------------------ text
  async function loadFontsOf(t) {
    if (t.characters.length && t.fontName === figma.mixed) {
      var fonts = t.getRangeAllFontNames(0, t.characters.length);
      for (var i = 0; i < fonts.length; i++) await figma.loadFontAsync(fonts[i]);
    } else {
      await figma.loadFontAsync(t.fontName);
    }
  }
  async function setText(n, content) {
    n = await node(n);
    if (n.type !== "TEXT") n = n.findOne(function (x) { return x.type === "TEXT"; });
    if (!n) throw new Error("no text layer found");
    await loadFontsOf(n);
    n.characters = String(content);
    return n;
  }
  var defaultFont = null;
  async function fileFont() {
    if (defaultFont) return defaultFont;
    var t = figma.currentPage.findOne(function (x) { return x.type === "TEXT" && x.fontName !== figma.mixed; });
    defaultFont = t ? t.fontName : { family: "Inter", style: "Regular" };
    return defaultFont;
  }
  // h.text("Sign in", { style: "Heading/L", color: "text/primary", parent, name, width })
  async function text(content, o) {
    o = o || {};
    var t = figma.createText();
    if (o.style) {
      var s = await textStyle(o.style);
      await figma.loadFontAsync(s.fontName);
      await t.setTextStyleIdAsync(s.id);
    } else {
      var f = await fileFont();
      await figma.loadFontAsync(f);
      t.fontName = f;
      if (o.size) t.fontSize = o.size;
    }
    t.characters = String(content);
    t.name = o.name || "Text";
    if (o.color) await fill(t, o.color);
    if (o.parent) await append(o.parent, t, o.width === "fill" ? { fill: "h" } : {});
    if (typeof o.width === "number") { t.textAutoResize = "HEIGHT"; t.resize(o.width, t.height); }
    if (o.align) t.textAlignHorizontal = o.align.toUpperCase();
    return t;
  }

  // ------------------------------------------------ layout
  // h.frame({ name, dir: "V"|"H", gap, padding, px, py, radius, fill, stroke, w, h, parent, align, justify, wrap })
  // Numeric props accept a number or a FLOAT token name.
  async function frame(o) {
    o = o || {};
    var f = figma.createFrame();
    f.name = o.name || "Frame";
    f.layoutMode = (o.dir || "V").toUpperCase().charAt(0) === "H" ? "HORIZONTAL" : "VERTICAL";
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    f.fills = [];
    if (o.wrap) f.layoutWrap = "WRAP";
    if (o.align) f.counterAxisAlignItems = { start: "MIN", center: "CENTER", end: "MAX", baseline: "BASELINE" }[o.align] || o.align;
    if (o.justify) f.primaryAxisAlignItems = { start: "MIN", center: "CENTER", end: "MAX", between: "SPACE_BETWEEN" }[o.justify] || o.justify;
    var keys = ["gap", "padding", "px", "py", "radius"];
    for (var i = 0; i < keys.length; i++) if (o[keys[i]] !== undefined) await num(f, keys[i], o[keys[i]]);
    if (o.fill) await fill(f, o.fill);
    if (o.stroke) await stroke(f, o.stroke, o.strokeWeight || 1);
    if (o.w !== undefined) { f.counterAxisSizingMode = f.layoutMode === "VERTICAL" ? "FIXED" : f.counterAxisSizingMode; if (f.layoutMode === "HORIZONTAL") f.primaryAxisSizingMode = "FIXED"; await num(f, "width", o.w); }
    if (o.h !== undefined) { if (f.layoutMode === "VERTICAL") f.primaryAxisSizingMode = "FIXED"; else f.counterAxisSizingMode = "FIXED"; await num(f, "height", o.h); }
    if (o.parent) await append(o.parent, f, o.sizing || {});
    return f;
  }
  // Append, then set sizing (must happen after appending to an auto-layout parent).
  // sizing: { fill: "h"|"v"|true, hug: "h"|"v"|true, index }
  async function append(parent, child, sizing) {
    parent = await node(parent); child = await node(child);
    sizing = sizing || {};
    if (sizing.index !== undefined) parent.insertChild(sizing.index, child); else parent.appendChild(child);
    if (parent.layoutMode && parent.layoutMode !== "NONE" && "layoutSizingHorizontal" in child) {
      if (sizing.fill === true || sizing.fill === "h") child.layoutSizingHorizontal = "FILL";
      if (sizing.fill === true || sizing.fill === "v") child.layoutSizingVertical = "FILL";
      if (sizing.hug === true || sizing.hug === "h") child.layoutSizingHorizontal = "HUG";
      if (sizing.hug === true || sizing.hug === "v") child.layoutSizingVertical = "HUG";
    }
    return child;
  }

  // ------------------------------------------------ components
  async function componentIndex() {
    if (cache.comps) return cache.comps;
    await figma.loadAllPagesAsync();
    var local = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] }).filter(function (c) {
      return !(c.type === "COMPONENT" && c.parent && c.parent.type === "COMPONENT_SET");
    });
    // library components already used in this file
    var seen = {}, remote = [];
    var inst = figma.currentPage.findAllWithCriteria({ types: ["INSTANCE"] });
    for (var i = 0; i < inst.length && i < 1500; i++) {
      var m = await inst[i].getMainComponentAsync();
      if (!m || !m.remote) continue;
      var top = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : m;
      if (!seen[top.key]) { seen[top.key] = true; remote.push(top); }
    }
    cache.comps = local.concat(remote);
    return cache.comps;
  }
  function splitProps(props) {
    var variant = {}, other = {};
    for (var k in props) {
      if (typeof props[k] === "string" && !/[#]/.test(k)) variant[k] = props[k]; else other[k] = props[k];
    }
    return { variant: variant, other: other };
  }
  // h.component("Button", { Variant: "Secondary", Size: "M", Label: "Sign in" }, { parent, fill: "h" })
  // name: component(-set) name or a library key. String props are matched to variant options first;
  // remaining props (text/boolean/instance-swap) are set by their short name.
  async function component(name, props, place) {
    props = props || {};
    var src;
    if (/^[0-9a-f]{20,}$/i.test(name)) {
      try { src = await figma.importComponentSetByKeyAsync(name); } catch (e) { src = await figma.importComponentByKeyAsync(name); }
    } else {
      src = pick(await componentIndex(), name, function (c) { return c.name; }, "Component");
    }
    var comp = src;
    if (src.type === "COMPONENT_SET") {
      var defs = src.componentPropertyDefinitions, want = {};
      for (var key in props) {
        var def = defs[key] || defs[Object.keys(defs).filter(function (d) { return norm(d.split("#")[0]) === norm(key); })[0]];
        if (def && def.type === "VARIANT") {
          var opt = def.variantOptions.filter(function (o) { return norm(o) === norm(props[key]); })[0];
          if (!opt) throw new Error('Variant "' + key + "=" + props[key] + '" not in ' + src.name + ". Options: " + def.variantOptions.join(", "));
          want[Object.keys(defs).filter(function (d) { return defs[d] === def; })[0]] = opt;
        }
      }
      comp = src.children.filter(function (c) {
        var vp = c.variantProperties || {};
        return Object.keys(want).every(function (k) { return vp[k] === want[k]; });
      })[0] || src.defaultVariant;
    }
    var inst = comp.createInstance();
    await setProps(inst, props, true);
    if (place && place.parent) await append(place.parent, inst, place);
    return inst;
  }
  // Set instance props by short name ("Label" instead of "Label#12:3"); text props load fonts automatically.
  async function setProps(inst, props, skipVariants) {
    inst = await node(inst);
    var cp = inst.componentProperties, out = {};
    for (var k in props) {
      var full = Object.keys(cp).filter(function (c) { return norm(c.split("#")[0]) === norm(k); })[0];
      if (!full) continue;
      if (skipVariants && cp[full].type === "VARIANT") continue;
      out[full] = props[k];
    }
    if (Object.keys(out).some(function (k) { return cp[k].type === "TEXT"; })) {
      var texts = inst.findAll(function (x) { return x.type === "TEXT"; });
      for (var i = 0; i < texts.length; i++) await loadFontsOf(texts[i]);
    }
    if (Object.keys(out).length) inst.setProperties(out);
    return inst;
  }

  // ------------------------------------------------ placement & selection
  function bounds(n) { return n.absoluteBoundingBox || { x: n.x, y: n.y, width: n.width, height: n.height }; }
  // Place node to the right of ref (or of the right-most of several refs), top-aligned.
  async function placeRight(n, ref, gap) {
    n = await node(n);
    var refs = Array.isArray(ref) ? ref : [ref];
    var right = -Infinity, top = Infinity;
    for (var i = 0; i < refs.length; i++) {
      var b = bounds(await node(refs[i]));
      right = Math.max(right, b.x + b.width); top = Math.min(top, b.y);
    }
    n.x = right + (gap === undefined ? 80 : gap); n.y = top;
    return n;
  }
  async function select(nodes, zoom) {
    nodes = Array.isArray(nodes) ? nodes : [nodes];
    var list = [];
    for (var i = 0; i < nodes.length; i++) list.push(await node(nodes[i]));
    figma.currentPage.selection = list;
    if (zoom !== false) figma.viewport.scrollAndZoomIntoView(list);
    return list.map(function (x) { return x.id; });
  }

  // ------------------------------------------------ flows
  // h.arrow(from, to, "Tap Sign in", { color, parent, lane }) — flow arrow between screens + label.
  // House style: blue-violet line, a filled circle where it starts, arrow head at the destination, rounded
  // elbows that sit in the gaps between screens (never inside one); routes over the row when screens are in the way.
  // `from` may be the trigger inside a screen (a button): the line then starts at that button.
  var FLOW_COLOR = "#5F6FF0";
  function screenOf(n) {  // the top-level screen a node belongs to (child of the page or of a section)
    while (n.parent && n.parent.type !== "PAGE" && n.parent.type !== "SECTION") n = n.parent;
    return n;
  }
  function hitsBox(p, q, r, pad) {  // axis-aligned segment p→q crosses rect r (grown by pad)?
    var x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
    return x2 > r.x - pad && x1 < r.x + r.width + pad && y2 > r.y - pad && y1 < r.y + r.height + pad;
  }
  async function arrow(from, to, label, o) {
    o = o || {};
    from = await node(from); to = await node(to);
    var fromScreen = screenOf(from), toScreen = screenOf(to);
    var A = bounds(fromScreen), B = bounds(toScreen), trig = from !== fromScreen ? bounds(from) : null;
    var others = (fromScreen.parent ? fromScreen.parent.children : []).filter(function (n) {
      return n !== fromScreen && n !== toScreen && n.visible !== false && /FRAME|COMPONENT|INSTANCE|GROUP|SECTION/.test(n.type) && n.name !== "Flow arrows";
    }).map(bounds);
    var pts = flowRoute(A, B, trig, others, o.lane);
    return drawFlow(pts, A, B, label, o);
  }
  // pure routing: screen boxes in, polyline out (kept separate so it can be tested outside Figma)
  function flowRoute(A, B, trig, others, lane) {
    var o = { lane: lane };
    var cxA = A.x + A.width / 2, cyA = A.y + A.height / 2, cxB = B.x + B.width / 2, cyB = B.y + B.height / 2;
    // same row (the screens overlap vertically) → leave sideways; different rows → leave through the gap between rows
    var sameRow = B.y < A.y + A.height && B.y + B.height > A.y;
    var horizontal = sameRow;
    var pts, gap = 40 + 16 * (o.lane || 0);
    function clear(path) {
      for (var i = 0; i < path.length - 1; i++) for (var j = 0; j < others.length; j++) if (hitsBox(path[i], path[i + 1], others[j], 6)) return false;
      return true;
    }
    if (horizontal) {
      var ltr = cxB >= cxA;
      var sy = trig ? trig.y + trig.height / 2 : cyA;
      var start = trig ? { x: ltr ? trig.x + trig.width : trig.x, y: sy } : { x: ltr ? A.x + A.width : A.x, y: sy };
      var exitX = ltr ? A.x + A.width : A.x;              // leave the source screen before any turn
      var endP = { x: ltr ? B.x : B.x + B.width, y: Math.max(B.y + 24, Math.min(B.y + B.height - 24, sy)) };
      var gutter = ltr ? (exitX + endP.x) / 2 : (exitX + endP.x) / 2;
      pts = [start, { x: exitX, y: sy }];
      if (Math.abs(endP.y - sy) > 1) pts.push({ x: gutter, y: sy }, { x: gutter, y: endP.y });
      pts.push(endP);
      if (!clear(pts)) {  // something in between: go over the top of everything the line spans
        var span = [A, B].concat(others.filter(function (r) { return r.x < Math.max(A.x + A.width, B.x + B.width) && r.x + r.width > Math.min(A.x, B.x); }));
        var topY = Math.min.apply(null, span.map(function (r) { return r.y; })) - gap;
        var out1 = ltr ? A.x + A.width + 40 : A.x - 40, in2 = ltr ? B.x - 40 : B.x + B.width + 40;
        // over-the-top lines use the upper part of both screens so they don't share ports with direct arrows
        var sy2 = trig ? sy : A.y + A.height * 0.3, ey2 = B.y + B.height * 0.3;
        start = trig ? start : { x: ltr ? A.x + A.width : A.x, y: sy2 };
        var endTop = { x: endP.x, y: ey2 };
        pts = [start, { x: out1, y: sy2 }, { x: out1, y: topY }, { x: in2, y: topY }, { x: in2, y: ey2 }, endTop];
        if (trig) pts.splice(1, 0, { x: exitX, y: sy });
      }
    } else {
      var down = cyB >= cyA, dirx = cxB > cxA + 1 ? 1 : cxB < cxA - 1 ? -1 : 0;
      // lean the ports toward each other so several lines leaving the same edge don't overlap
      var sx = trig ? trig.x + trig.width / 2 : cxA + dirx * A.width * 0.25;
      var start2 = trig ? { x: sx, y: down ? trig.y + trig.height : trig.y } : { x: sx, y: down ? A.y + A.height : A.y };
      var exitY = down ? A.y + A.height : A.y;
      var ex = dirx ? cxB - dirx * B.width * 0.25 : sx;
      var endP2 = { x: Math.max(B.x + 24, Math.min(B.x + B.width - 24, ex)), y: down ? B.y : B.y + B.height };
      var midY = (exitY + endP2.y) / 2;
      pts = [start2, { x: sx, y: exitY }];
      if (Math.abs(endP2.x - sx) > 1) pts.push({ x: sx, y: midY }, { x: endP2.x, y: midY });
      pts.push(endP2);
    }
    // drop zero-length / collinear points so corners only appear where the line turns
    var clean = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], q = clean[clean.length - 1];
      if (Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) continue;
      if (clean.length >= 2) {
        var r0 = clean[clean.length - 2];
        if ((Math.abs(r0.x - q.x) < 0.5 && Math.abs(q.x - p.x) < 0.5) || (Math.abs(r0.y - q.y) < 0.5 && Math.abs(q.y - p.y) < 0.5)) { clean[clean.length - 1] = p; continue; }
      }
      clean.push(p);
    }
    return clean;
  }
  async function drawFlow(pts, A, B, label, o) {
    var minX = Math.min.apply(null, pts.map(function (p) { return p.x; }));
    var minY = Math.min.apply(null, pts.map(function (p) { return p.y; }));
    var v = figma.createVector();
    v.name = "Flow arrow" + (label ? " / " + label : "");
    await v.setVectorNetworkAsync({
      vertices: pts.map(function (p, i) {
        var vx = { x: p.x - minX, y: p.y - minY };
        if (i === 0) vx.strokeCap = "CIRCLE_FILLED";
        if (i === pts.length - 1) vx.strokeCap = "ARROW_LINES";
        if (i > 0 && i < pts.length - 1) vx.cornerRadius = 20;
        return vx;
      }),
      segments: pts.slice(1).map(function (_, i) { return { start: i, end: i + 1 }; }),
      regions: [],
    });
    v.x = minX; v.y = minY;
    v.strokeWeight = o.weight || 2;
    try { await stroke(v, o.color || FLOW_COLOR); } catch (e) { v.strokes = [solid(FLOW_COLOR)]; }
    var parent = o.parent ? await node(o.parent) : figma.currentPage;
    parent.appendChild(v);
    var out = { arrow: v, points: pts };
    if (label) {  // on the longest stretch that lies outside the screens
      var best = null, bestLen = -1;
      for (var k = 0; k < pts.length - 1; k++) {
        var s0 = pts[k], s1 = pts[k + 1];
        var inside = hitsBox(s0, s1, A, -1) || hitsBox(s0, s1, B, -1);
        var len = Math.abs(s1.x - s0.x) + Math.abs(s1.y - s0.y);
        if (!inside && len > bestLen) { best = [s0, s1]; bestLen = len; }
      }
      best = best || [pts[0], pts[pts.length - 1]];
      // label = auto-layout chip sitting on the line: 8px padding, white fill, outline in the label colour
      var lc = o.labelColor || o.color || FLOW_COLOR;
      var chip = figma.createFrame();
      chip.name = o.labelName || "Flow label";
      chip.layoutMode = "HORIZONTAL";
      chip.primaryAxisSizingMode = "AUTO"; chip.counterAxisSizingMode = "AUTO";
      chip.paddingLeft = chip.paddingRight = chip.paddingTop = chip.paddingBottom = 8;
      chip.cornerRadius = 6;
      chip.fills = [solid("#FFFFFF")];
      chip.strokeWeight = 1; chip.strokeAlign = "INSIDE";
      try { await stroke(chip, lc); } catch (e) { chip.strokes = [solid(FLOW_COLOR)]; }
      var t = await text(label, { size: 12, color: lc, name: "Label" });
      chip.appendChild(t);
      parent.appendChild(chip);
      chip.x = Math.round((best[0].x + best[1].x) / 2 - chip.width / 2);
      chip.y = Math.round((best[0].y + best[1].y) / 2 - chip.height / 2);
      out.label = chip;
    }
    return out;
  }
  // h.link(buttonOrFrame, destinationFrame, { trigger: "ON_CLICK", animation: "SMART_ANIMATE"|"DISSOLVE"|"INSTANT" })
  async function link(src, dest, o) {
    o = o || {};
    src = await node(src); dest = await node(dest);
    var transition = o.animation === "INSTANT" ? null : { type: o.animation || "SMART_ANIMATE", easing: { type: "EASE_OUT" }, duration: 0.3 };
    var reactions = (src.reactions || []).filter(function (r) { return !(r.trigger && r.trigger.type === (o.trigger || "ON_CLICK")); });
    reactions.push({ trigger: { type: o.trigger || "ON_CLICK" }, actions: [{ type: "NODE", destinationId: dest.id, navigation: "NAVIGATE", transition: transition, preserveScrollPosition: false }] });
    await src.setReactionsAsync(reactions);
    return src;
  }
  // Lay frames out left-to-right (rows: [[a,b,c],[d,e]] for branches), consistent gaps.
  async function layoutRow(rows, o) {
    o = o || {};
    if (!Array.isArray(rows[0])) rows = [rows];
    var gapX = o.gapX || 200, gapY = o.gapY || 240;
    var first = await node(rows[0][0]);
    var x0 = o.x !== undefined ? o.x : first.x, y = o.y !== undefined ? o.y : first.y;
    for (var r = 0; r < rows.length; r++) {
      var x = x0, rowH = 0;
      for (var c = 0; c < rows[r].length; c++) {
        if (!rows[r][c]) { x += (first.width + gapX); continue; }
        var n = await node(rows[r][c]);
        n.x = x; n.y = y; x += n.width + gapX; rowH = Math.max(rowH, n.height);
      }
      y += rowH + gapY;
    }
    return true;
  }

  return {
    node: node, variable: variable, textStyle: textStyle, paintStyle: paintStyle, effectStyle: effectStyle,
    fill: fill, stroke: stroke, num: num, text: text, setText: setText, frame: frame, append: append,
    component: component, setProps: setProps, placeRight: placeRight, select: select,
    arrow: arrow, link: link, layoutRow: layoutRow, solid: solid,
  };
})();

// ---------------------------------------------------------------- operations

var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// The `figma` that agent-written code sees: everything except clientStorage, where the bridge key is kept.
var _agentFigma = null;
function agentFigma() {
  if (_agentFigma) return _agentFigma;
  try {
    var p = new Proxy(figma, {
      get: function (t, k) { if (k === "clientStorage") return undefined; var v = t[k]; return typeof v === "function" ? v.bind(t) : v; },
      set: function (t, k, v) { t[k] = v; return true; },
      has: function (t, k) { return k !== "clientStorage" && k in t; }
    });
    if (!p.root || p.clientStorage) throw new Error("proxy");
    _agentFigma = p;
  } catch (e) { _agentFigma = figma; }
  return _agentFigma;
}

async function runOp(op, args) {
  args = args || {};
  if (op === "execute") {
    var logs = [];
    var log = function () {
      logs.push(Array.prototype.map.call(arguments, function (a) {
        return typeof a === "string" ? a : JSON.stringify(toPlain(a));
      }).join(" "));
    };
    var fn = new AsyncFunction("figma", "log", "serialize", "designSystem", "h", args.code);
    var result = await fn(agentFigma(), log, serialize, designSystem, h);
    return { result: toPlain(result), logs: logs.length ? logs : undefined };
  }
  if (op === "file_memory_add") {
    var it = fsMemoryAdd(args.text, args.src);
    return { saved: !!it };
  }
  if (op === "file_skill_text") {
    var meta = fsSkills().filter(function (x) { return x.name === args.name && x.enabled; })[0];
    if (!meta) throw new Error("No enabled skill named " + args.name + " in this file.");
    return { name: meta.name, text: figma.root.getPluginData("pollie.skill:" + meta.name).slice(0, 100000) };
  }
  if (op === "read") {
    var ids = args.ids || [];
    var depth = args.depth === undefined ? 3 : args.depth;
    var out = [];
    var state = { count: 0 };
    for (var i = 0; i < ids.length; i++) {
      var node = await figma.getNodeByIdAsync(ids[i]);
      out.push(node ? await serialize(node, depth, state) : { id: ids[i], error: "not found" });
    }
    return out;
  }
  if (op === "design_system") {
    return await designSystem(!!args.refresh);
  }
  if (op === "page_overview") {
    var page = figma.currentPage;
    return {
      pages: figma.root.children.map(function (p) { return { id: p.id, name: p.name }; }),
      current: page.name,
      topLevel: page.children.slice(0, 300).map(function (n) {
        return { id: n.id, name: n.name, type: n.type, x: round(n.x), y: round(n.y), w: round(n.width), h: round(n.height) };
      }),
    };
  }
  if (op === "page_of") {
    return await pagesOf(args.ids || []);
  }
  if (op === "set_file_key") {
    figma.root.setPluginData("fileKey", String(args.key || ""));
    return { ok: true };
  }
  if (op === "annotated") {
    // every layer with annotations under the given roots (or the current page)
    var roots = [];
    if (args.ids && args.ids.length) { for (var r = 0; r < args.ids.length; r++) { var rn = await figma.getNodeByIdAsync(args.ids[r]); if (rn) roots.push(rn); } }
    else roots = [figma.currentPage];
    var found = [];
    for (var q = 0; q < roots.length; q++) {
      var list = [roots[q]].concat("findAll" in roots[q] ? roots[q].findAll(function (x) { return "annotations" in x && x.annotations && x.annotations.length > 0; }) : []);
      for (var w = 0; w < list.length && found.length < 300; w++) {
        var nd = list[w];
        if (!("annotations" in nd) || !nd.annotations || !nd.annotations.length) continue;
        var anns = [];
        for (var z = 0; z < nd.annotations.length; z++) {
          var A = nd.annotations[z];
          anns.push({ note: A.labelMarkdown || A.label || "", pins: (A.properties || []).map(function (pp) { return pp.type; }), category: A.categoryId ? await annotationCategory(A.categoryId) : undefined });
        }
        found.push({ id: nd.id, name: nd.name, type: nd.type, annotations: anns });
      }
    }
    return found;
  }
  if (op === "screenshot") {
    var target = await figma.getNodeByIdAsync(args.id);
    if (!target || !("exportAsync" in target)) throw new Error("node not exportable");
    var scale = Math.min(2, 1200 / Math.max(target.width, target.height, 1));
    var bytes = await target.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
    return { pngBase64: figma.base64Encode(bytes), w: Math.round(target.width * scale), h: Math.round(target.height * scale) };
  }
  throw new Error("unknown op: " + op);
}

// ---------------------------------------------------------------- messaging

figma.on("selectionchange", function () {
  figma.ui.postMessage({ type: "selection", items: selectionSummary(), file: figma.root.name, fileKey: fileKey() });
});
figma.on("currentpagechange", function () {
  figma.ui.postMessage({ type: "selection", items: selectionSummary(), file: figma.root.name, fileKey: fileKey() });
});

figma.ui.onmessage = async function (msg) {
  if (msg.type === "init") {
    figma.ui.postMessage({ type: "selection", items: selectionSummary(), file: figma.root.name, fileKey: fileKey() });
    // first-run onboarding: the panel only connects to the local agent after the user clicks Connect once
    // the pairing key for the local bridge (approved once on this Mac); without it the panel shows onboarding
    figma.clientStorage.getAsync("agentToken").then(function (t) {
      figma.ui.postMessage({ type: "onboarded", value: !!t, token: t || null });
    }).catch(function () { figma.ui.postMessage({ type: "onboarded", value: false, token: null }); });
    figma.clientStorage.getAsync("gardenColors").then(function (v) {  // personal look-and-feel, kept per user
      if (v) figma.ui.postMessage({ type: "pref", key: "gardenColors", value: v });
    }).catch(function () {});
    // Warm the design-system cache in the background so the first prompt is fast.
    designSystem(false).catch(function () {});
    return;
  }
  if (msg.type === "set-pref" && msg.key === "gardenColors") {
    figma.clientStorage.setAsync("gardenColors", { mode: msg.value && msg.value.mode === "single" ? "single" : "colorful", color: String(msg.value && msg.value.color || "").slice(0, 20) }).catch(function () {});
    return;
  }
  if (msg.type === "set-token") {
    (msg.token ? figma.clientStorage.setAsync("agentToken", String(msg.token)) : figma.clientStorage.deleteAsync("agentToken"))
      .catch(function () {});
    return;
  }
  if (msg.type === "get-context") {
    var ctx;
    try {
      ctx = await selectionContext();
      if (msg.withDesignSystem) {
        try { ctx.designSystem = await designSystem(false); } catch (e) { ctx.designSystemError = String(e && e.message || e); }
      }
    } catch (e) {  // never leave the panel waiting: send what we can
      ctx = { file: figma.root.name, fileKey: fileKey(), page: { id: figma.currentPage.id, name: figma.currentPage.name },
              selection: [], contextError: String(e && e.message || e) };
    }
    figma.ui.postMessage({ type: "context", reqId: msg.reqId, context: ctx });
    return;
  }
  if (msg.type === "comment-scope") {
    // classify comment pins: which are on the current page / inside the selection
    var pages = await pagesOf(msg.nodeIds || []);
    var inSel = {};
    subtreeIds(figma.currentPage.selection, 5000).forEach(function (id) { inSel[id] = true; });
    var onPage = 0, onSel = 0, pageIds = [], selIds = [], names = {};
    for (var ci = 0; ci < (msg.nodeIds || []).length; ci++) {
      var id = msg.nodeIds[ci];
      if (pages[id] === figma.currentPage.id) { onPage++; pageIds.push(id); }
      if (inSel[id]) { onSel++; selIds.push(id); }
      if (pages[id]) { try { var nn = await figma.getNodeByIdAsync(id); if (nn) names[id] = nn.name; } catch (e) {} }
    }
    figma.ui.postMessage({ type: "comment-scope", reqId: msg.reqId, onPage: onPage, onSelection: onSel, pageIds: pageIds, selectionIds: selIds, names: names, hasSelection: figma.currentPage.selection.length > 0 });
    return;
  }
  if (msg.type === "fs-get" || msg.type === "fs-edit") {
    var err = null;
    var res = null;
    if (msg.type === "fs-edit") { try { res = fsApply(msg); } catch (e) { err = String(e && e.message || e); } }
    var st = fsState(); st.error = err; st.result = res || null; st.type = "fs"; st.reqId = msg.reqId;
    figma.ui.postMessage(st);
    return;
  }
  if (msg.type === "peek-node") {  // show a layer without changing the selection (hovering an ask option)
    var n = null;
    try { n = await figma.getNodeByIdAsync(msg.id); } catch (e) {}
    if (n && n.type !== "PAGE" && n.type !== "DOCUMENT") {
      var pp = n; while (pp && pp.type !== "PAGE") pp = pp.parent;
      if (pp === figma.currentPage) figma.viewport.scrollAndZoomIntoView([n]);
    }
    return;
  }
  if (msg.type === "focus-node") {
    var target = null;
    try { target = await figma.getNodeByIdAsync(msg.id); } catch (e) {}
    if (target) {
      var pg = target; while (pg && pg.type !== "PAGE") pg = pg.parent;
      if (pg && pg !== figma.currentPage) await figma.setCurrentPageAsync(pg);
      if (target.type !== "PAGE") { figma.currentPage.selection = [target]; figma.viewport.scrollAndZoomIntoView([target]); }
    }
    return;
  }
  if (msg.type === "turn-boundary") {
    // Group everything the agent does in one turn into a single undo step.
    figma.commitUndo();
    return;
  }
  if (msg.type === "exec") {
    try {
      var data = await runOp(msg.op, msg.args);
      figma.ui.postMessage({ type: "exec-result", id: msg.id, ok: true, data: data });
    } catch (e) {
      figma.ui.postMessage({ type: "exec-result", id: msg.id, ok: false, error: String(e && e.stack ? e.message + "\n" + e.stack : e) });
    }
    return;
  }
  if (msg.type === "minimize") {
    figma.ui.resize(64, 40);
    return;
  }
  if (msg.type === "restore") {
    var saved = await figma.clientStorage.getAsync("panelSize");
    var sz = saved && saved.w ? saved : { w: 380, h: 600 };
    figma.ui.resize(sz.w, sz.h);
    return;
  }
  if (msg.type === "resize") {
    var sz = clampSize(msg.w, msg.h);
    figma.ui.resize(sz.w, sz.h);
    if (msg.done) figma.clientStorage.setAsync("panelSize", sz).catch(function () {});
    return;
  }
  if (msg.type === "notify") {
    figma.notify(msg.text, { timeout: 2000 });
  }
};
