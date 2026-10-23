// Save viewer UI. Data: data/*.js, texts: js/i18n.js, save parsing: js/save.js, graphics: icons/ (local, see tools/import_icons.py).
// Views: Overview (save summary and every category on one page), Story Progression / 100 % Route, Builds, Rules.
// Everything the save reveals is checked and locked; the rest can be ticked by hand (localStorage "ffr-tool").

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const norm = s => String(s).replace(/[’`]/g, "'");
const fmt = n => Number(n || 0).toLocaleString(T.locale);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

let state = Object.assign({ checked: {}, counts: {} }, store.get("ffr-tool") || {});
let SAVE = store.get("ffr-save");
// Edition: "public" (Overview, Story Progression, Rules) or "personal" (Overview, 100 % Route, Builds, Rules)
const EDITION = window.EDITION === "public" ? "public" : "personal";
const VIEWS = EDITION === "public" ? ["overview", "quest", "rules"] : ["overview", "quest", "builds", "rules"];
const viewName = v => v === "quest" && EDITION === "public" ? T.views.story : T.views[v];
const ui = { view: VIEWS.includes(store.get("ffr-view-" + EDITION)) ? store.get("ffr-view-" + EDITION) : "overview", tlMode: "next", achFilter: "all", invFilter: "all", invChar: "all",
  only100: !!store.get("ffr-only100"), sel: {}, collapsed: new Set(store.get("ffr-collapsed-" + EDITION) || ["gear"]) };
const persist = () => store.set("ffr-tool", { checked: state.checked, counts: state.counts });

// Guide data in the selected language; German mode swaps in the official German game names
const { ACH, ROAD, STEPS, COUNTERS } = LANG === "de" ? localizeDeep(GUIDE.de) : GUIDE.en;
// Achievements: official in-game name and description
for (const a of ACH) { const n = a[0].slice(1); a[1] = gameName("trophy:" + n, a[1]); a[2] = gameName("trophysum:" + n, a[2]); }
const ACHMAP = Object.fromEntries(ACH.map(a => [a[0], a]));

// ---------- Grafiken ----------
const ICONS = window.FFR_ICONS || null;
const hasIcon = (kind, key) => !!(ICONS && ICONS[kind] && ICONS[kind].includes(String(key)));
function img(kind, key, label = "", cls = "") {
  if (hasIcon(kind, key)) return `<img class="${cls}" src="icons/${kind}/${key}.png" alt="${esc(label)}" loading="lazy">`;
  return `<span class="ph ${cls}" aria-hidden="true">${esc((label || "?").replace(/^The /, "").slice(0, 1))}</span>`;
}
const TYPE_ICON = { "Great Sword": "ICON_Item_Brade", Katana: "ICON_Item_Katana", Bow: "ICON_Item_Bow", Hammer: "ICON_Item_Hummer", Grimoire: "ICON_Item_Book",
  Whip: "ICON_Item_Whip", Gun: "ICON_Item_Gun", Rod: "ICON_Item_Rod", "Light Armor": "ICON_Item_LightArmor", "Heavy Armor": "ICON_Item_HeavyArmor",
  Robe: "ICON_Item_Dress", Accessory: "ICON_Item_Ling", Valuable: "ICON_Item_Key", Consumable: "ICON_Item_Bug" };
const typeName = t => T.types[t] || t;

// ---------- Lookup tables (names in the selected language) ----------
const CHARS = CATALOG.characters.map(c => ({ ...c, name: gameName("unit:" + c.objectId, c.name) }));
const CHAR = Object.fromEntries(CHARS.map(c => [c.objectId, c]));
const VISIONS = CATALOG.visions.map(v => ({ ...v, name: norm(gameName("vis:" + v.objectId, v.name)), en: norm(v.name) }));
const VIS = Object.fromEntries(VISIONS.map(v => [v.objectId, v]));
const ITEMS = Object.fromEntries(CATALOG.items.map(([id, name, type]) => [id, { id, name: norm(gameName("item:" + id, name)), type }]));
const ITEM_BY_NAME = {};
for (const it of Object.values(ITEMS)) ITEM_BY_NAME[it.name] = ITEM_BY_NAME[it.name] || it;
const OWNER_BY_TYPE = Object.fromEntries(CHARS.map(c => [c.weapon, c.name]));
const areaName = a => localize(a.name) + (a.note ? ` (${a.note[LANG]})` : "");

const ITEM = {};
for (const p of ROAD) for (const x of p.items) if (x[0] !== "#" && x.length > 1) ITEM[x[0]] = Object.assign([...x], { ch: p.ch });
for (const n of STEPS) for (const x of n.extra || []) ITEM[x[0]] = Object.assign([...x], { ch: n.ch });
const STEP_IDX = Object.fromEntries(STEPS.map((n, i) => [n.id, i]));
const STEP_OF = {};
STEPS.forEach((n, i) => { for (const id of [...n.items, ...(n.extra || []).map(x => x[0])]) if (!(id in STEP_OF)) STEP_OF[id] = i; });

// English entries: matching against game IDs always uses the English names
const EN_ITEM = {};
for (const p of GUIDE.en.ROAD) for (const x of p.items) if (x.length > 1) EN_ITEM[x[0]] = x;
for (const n of GUIDE.en.STEPS) for (const x of n.extra || []) EN_ITEM[x[0]] = x;
const keyName = s => norm(s).replace(/[“”"]/g, "").trim().toLowerCase();

// Guide entry → Vision(s)
const ENTRY_VISIONS = {}, VISION_ENTRY = {};
{
  const byEn = Object.fromEntries(VISIONS.map(v => [v.en.toLowerCase(), v.objectId]));
  for (const x of Object.values(EN_ITEM)) {
    let ids = [];
    if (x[0] === "v-tronn") ids = [13024, 13045];
    else if (x[3] === "vis") { const m = /^Vision: ([^(]+)/.exec(x[4] || ""); const id = m && byEn[norm(m[1]).trim().toLowerCase()]; if (id) ids = [id]; }
    else { const m = /([A-Z][\w']+) Vision/.exec(x[4] || ""); const id = m && byEn[m[1].toLowerCase()]; if (id && !VISION_ENTRY[id]) { VISION_ENTRY[id] = x[0]; continue; } }
    if (!ids.length) continue;
    ENTRY_VISIONS[x[0]] = ids;
    for (const id of ids) VISION_ENTRY[id] = x[0];
  }
}
// Guide entry → side quest (data/quests.js) by English title
const QUEST_OF = {};
{
  const byTitle = Object.fromEntries(QUESTS.map(q => [keyName(NAMES.ids.en["quest:" + q.q] || ""), q]));
  for (const x of Object.values(EN_ITEM)) if ((x[3] === "side" || x[3] === "sub") && byTitle[keyName(x[1])]) QUEST_OF[x[0]] = byTitle[keyName(x[1])];
}
// Bestiary unit IDs by English name
const unitIds = name => NAMES.units[norm(name).trim()] || [];
// Espers: sprite ID, guide entry, enemy fought to obtain it (if any)
const ESPERS = [[10451, "e-siren", "Siren"], [10454, "e-ramuh", "Ramuh"], [10455, "e-carbuncle", null], [10457, "k-f5", "Titan"], [10452, "e-ifrit", "Ifrit"],
  [10453, "e-shiva", "Shiva"], [10459, "e-leviathan", null], [10456, "q-iron", "Odin's Shadow"], [10458, "e-bahamut", "Bahamut"]]
  .map(([id, entry, foe]) => ({ id, entry, foe, name: gameName("unit:" + id, "") }));
// "Character X equips Vision Y" steps: character ID, Vision ID
const EQUIP_STEP = { "s-core": [1002, 13024], "j-fina": [1003, 13045], "j-cloud": [1001, 13110], "s-lid": [1004, 13100], "j-nichol": [1005, 13120],
  "j-jake": [1007, 13101], "j-sakura": [1008, 13127], "j-archwitch": [1006, 13108] };

// Where each character joins, from the route's "joins"
const JOIN_AT = { 1001: T.joinStart, 1002: T.joinStart };
for (const n of STEPS) for (const j of n.joins || []) {
  const [name, note] = j.split(" (");
  const c = CHARS.find(x => x.name === name);
  if (c && !(note || "").startsWith(T.guest)) JOIN_AT[c.objectId] = `${n.place}, ${n.ch}${note ? " (" + note : ""}`;
}

// Detect equipment names in guide texts (longest first)
const GEAR = [...new Set(Object.values(ITEMS).filter(i => i.type !== "Consumable" && i.type !== "Valuable").map(i => i.name).filter(n => n.length > 3))];
const GEAR_RE = new RegExp("(?<![\\p{L}])(" + GEAR.sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}])", "gu");
const gearIn = text => [...new Set(norm(text).match(GEAR_RE) || [])];
const sentences = t => norm(t).split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„“"])/);
const shopBuyText = x => norm(x[2] || "").split(T.shopSkip)[0];

// Sources per item name: chests (gear), shops, rewards (side quests, Colosseum, …)
const SOURCES = {};
const addSrc = (name, src) => { (SOURCES[name] = SOURCES[name] || []).push(src); };
for (const x of Object.values(ITEM)) {
  const desc = x[2] || "", reward = x[4] || "";
  if (x[3] === "gear") {
    for (const s of sentences(desc)) for (const n of gearIn(s)) addSrc(n, { kind: "chest", where: x[1], text: s.replace(/^[^:]*:\s*/, ""), ch: x.ch });
  } else if (x[3] === "shop") {
    const [buy, skip = ""] = norm(desc).split(T.shopSkip);
    for (const s of sentences(buy)) for (const n of gearIn(s))
      addSrc(n, /pre-?order|vorbesteller/i.test(s) ? { kind: "preorder", where: T.srcPreorder, text: T.srcPreorderText(x[1]), ch: x.ch } : { kind: "shop", where: T.srcShop(x[1]), text: s.replace(T.shopBuy, ""), ch: x.ch });
    for (const n of gearIn(skip)) addSrc(n, { kind: "shop", where: T.srcShop(x[1]), text: T.srcSkip, ch: x.ch });
  } else if (reward) {
    for (const n of gearIn(reward)) addSrc(n, { kind: "quest", where: x[1], text: (T.kind[x[3]] || T.reward) + (desc ? ": " + desc : ""), ch: x.ch });
  }
}
const SRC_ICON = { chest: ["map", "TresureBox"], shop: ["map", "Shop"], quest: ["ui", "ICON_Menu_SubStory"], preorder: ["map", "DLCshop"] };

// Legendary Arms: last equipment name in rewards of the form "Ancient item → Legendary Arm"
const LEGENDARY = Object.values(ITEM).filter(x => (x[4] || "").includes("→")).map(x => gearIn(x[4]).pop()).filter(Boolean);
const COLO_LEAGUE = { "初級": "f", "中級": "b", "上級": "g", "最上級": "x" };
const coloNum = s => +String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, "").slice(-1);

// Does an entry count toward 100 % (achievements)? Gear, shops, chests and regular side quests do not.
const REL_KINDS = new Set(["vis", "esp", "cave", "shard", "arms", "adam", "sub"]);
const isRel = id => {
  const x = EN_ITEM[id];
  if (!x) return !!ACHMAP[id];
  if (REL_KINDS.has(x[3]) || /^k-/.test(id)) return true;
  return x[3] === "side" && (/Vision|Esper|Mechabo/.test(x[4] || "") || id === "q-forger");
};
// Achievements an entry counts toward
const REL_ACH = { vis: ["a32", "a33"], esp: ["a35", "a36"], cave: ["a21", "a22", "a23"], shard: ["a17", "a18"], arms: ["a27", "a28"], adam: ["a25", "a26"], sub: ["a11"] };
function relAchs(id) {
  const x = EN_ITEM[id];
  if (!x || !isRel(id)) return [];
  if (/^k-f/.test(id)) return ["a14", ...(REL_ACH[x[3]] || [])];
  if (/^k-b/.test(id)) return ["a15", ...(REL_ACH[x[3]] || [])];
  if (/^q-mechabo/.test(id)) return ["a39"];
  if (id === "q-forger") return ["a25", "a26", "a33"];
  if (x[3] === "side") return /Esper/.test(x[4] || "") ? ["a35", "a36"] : ["a32", "a33"];
  if (x[3] === "sub" && /Esper/.test(x[4] || "")) return ["a11", "a36"];
  return REL_ACH[x[3]] || [];
}
const relNames = id => relAchs(id).map(a => ACHMAP[a][1]).join(", ");
const relBadge = id => isRel(id) ? `<span class="rel" title="${esc(T.relFor(relNames(id)) || T.relTip)}">${T.rel100}</span>` : "";

// ---------- What the save reveals ----------
const CH_ORDER = [...new Set(STEPS.map(s => s.ch))];

function computeAuto(S) {
  // known[id] = { done, part?, why } for everything readable from the save; steps[id] = route step reached
  const auto = { known: {}, steps: {}, owned: new Set(), visions: new Set(), defeated: new Set(), reached: -1, reachWhy: "", counts: {} };
  if (!S) return auto;
  const K = (id, done, why, part) => { auto.known[id] = { done: !!done, why, part }; };
  for (const id in S.items) if (ITEMS[id]) auto.owned.add(ITEMS[id].name);
  // Owned: has MRP, is awakened or equipped. A Vision that is only listed has been discovered (Sanctum entered) but not obtained yet.
  auto.discovered = new Set();
  for (const v of S.visions) {
    const used = Object.values(v.mrp).some(p => p > 0) || v.awk > 0 || S.units.some(u => u.vision === v.id);
    (used ? auto.visions : auto.discovered).add(v.id);
  }
  for (const id of S.defeated || []) auto.defeated.add(id);
  const beaten = name => unitIds(name).some(id => auto.defeated.has(id));
  const prog = k => (S.progress || [])[k] || 0;

  // Route progress
  const reach = (stepId, why) => { const i = STEP_IDX[stepId]; if (i !== undefined && i > auto.reached) { auto.reached = i; auto.reachWhy = why; } };
  for (const m of S.visited) if (AREAS[m] && AREAS[m].step) reach(AREAS[m].step, T.why.reached(areaName(AREAS[m])));
  if (ISLAND_STEP[S.island]) reach(ISLAND_STEP[S.island], T.why.island(localize(S.island)));
  for (const u of S.units) if (u.join === "Join" && JOIN_STEP[u.id]) reach(JOIN_STEP[u.id], T.why.joined(CHAR[u.id].name));
  for (const [entry, ids] of Object.entries(ENTRY_VISIONS)) if (ids.every(v => auto.visions.has(v)) && STEP_OF[entry] !== undefined) reach(STEPS[STEP_OF[entry]].id, T.why.vision(VIS[ids[0]].name));
  STEPS.forEach((n, i) => { if (i < auto.reached) auto.steps[n.id] = T.why.ahead; });

  // Entries
  const unitById = Object.fromEntries(S.units.map(u => [u.id, u]));
  const colo = {};
  for (const c of S.colosseum) { const l = COLO_LEAGUE[c.key.split("_")[0]]; if (l) colo[l + coloNum(c.key)] = c.clears > 0; }
  for (const [id, x] of Object.entries(ITEM)) {
    const kind = x[3];
    if (ENTRY_VISIONS[id]) { K(id, ENTRY_VISIONS[id].every(v => auto.visions.has(v)), T.why.visionSave); continue; }
    if (QUEST_OF[id]) {
      const q = QUEST_OF[id], v = prog(q.k), n = q.stages.filter(s => v >= s).length;
      if (q.done != null) K(id, v >= q.done, v >= q.done ? T.completed : n > 0 ? T.stage(n, q.stages.length) : T.notStarted, n > 0 && v < q.done ? [n, q.stages.length] : null);
      continue;
    }
    if (EQUIP_STEP[id]) { const [cid, vid] = EQUIP_STEP[id]; const u = unitById[cid]; K(id, u && u.join === "Join" && u.vision === vid, T.fromSaveTip); continue; }
    if (id === "j-wol") { const o = S.visions.find(v => v.id === 13100); K(id, o && o.mrp[1001] > 0, T.fromSaveTip); continue; }
    if (/^k-[fb]\d$/.test(id)) { K(id, colo[id[2] + id[3]], T.fromSaveTip); continue; }
    if (kind === "cave") { const foe = norm(EN_ITEM[id][1]).replace(/\s*\(.*$/, ""); if (unitIds(foe).length) K(id, beaten(foe), beaten(foe) ? T.defeated : T.notDefeated); continue; }
    if (kind === "gear" || kind === "shop" || kind === "arms") {
      const names = kind === "shop" ? gearIn(shopBuyText(x)) : kind === "arms" ? gearIn(x[4] || "").slice(-1) : gearIn((x[2] || "") + " " + (x[4] || ""));
      if (!names.length) continue;
      const have = names.filter(n => auto.owned.has(n)).length;
      K(id, have === names.length, T.owned(have, names.length), names.length > 1 ? [have, names.length] : null);
    }
  }
  // Tablet Shards per area (loose item spots, treasure entries with ID -1)
  const sh = S.shards || {};
  auto.shardTotal = (S.shardsHeld || 0) + (S.shardsHanded || 0);
  for (const [id, maps] of Object.entries(SHARD_ENTRY)) {
    const want = +(/\((\d+)\)\s*$/.exec(EN_ITEM[id][1]) || [0, 0])[1];
    const got = maps.reduce((a, m) => a + (sh[m] ? Math.min(sh[m].open, AREAS[m].shards.en.length) : 0), 0);
    K(id, got >= want, T.collected(got, want), got > 0 && got < want ? [got, want] : null);
  }
  // Espers: by fight (bestiary), story or quest
  for (const e of ESPERS) {
    let done = null;
    if (e.entry === "e-siren") done = beaten("Siren") || auto.reached > STEP_IDX["n-siren"];
    else if (e.entry === "e-leviathan") { const q = QUESTS.find(q => q.q === 5); done = q && prog(q.k) >= q.done; }
    else if (e.foe && unitIds(e.foe).length) done = beaten(e.foe);
    if (done !== null) K(e.entry, done, done ? T.obtained : T.missing);
  }

  // Achievements
  const isK = id => auto.known[id] && auto.known[id].done;
  const caves = Object.values(ITEM).filter(x => x[3] === "cave"), cavesDone = caves.filter(x => isK(x[0])).length;
  const espDone = ESPERS.filter(e => isK(e.entry)).length;
  const subs = QUESTS.filter(q => q.q >= 1 && q.q <= 8), subsDone = subs.filter(q => prog(q.k) >= q.done).length;
  const legDone = LEGENDARY.filter(n => auto.owned.has(n)).length;
  const league = l => [1, 2, 3, 4, 5].filter(n => colo[l + n]).length;
  auto.counts = { a10: [S.units.filter(u => u.join === "Join").length, 8], a11: [subsDone, 8], a14: [league("f"), 5], a15: [league("b"), 5], a16: [league("g"), 5],
    a19: [S.spent, 100000], a20: [S.earned, 1000000], a21: [Math.min(cavesDone, 1), 1], a22: [Math.min(cavesDone, 5), 5], a23: [cavesDone, caves.length],
    a27: [Math.min(legDone, 1), 1], a28: [legDone, 12], a32: [auto.visions.size, 10], a33: [auto.visions.size, 26], a35: [Math.min(espDone, 3), 3], a36: [espDone, 9],
    a37: [S.staggers, 1000], a38: [S.resonances, 400], a39: [Math.min(prog(16), 100), 100] };
  for (const [a, [v, max]] of Object.entries(auto.counts)) K(a, v >= max, `${fmt(v)} / ${fmt(max)}`);
  // Tablet Shards handed in at the Oblivion Palace
  for (const [a, max] of [["a17", 3], ["a18", 60]]) { const v = Math.min(S.shardsHanded || 0, max); auto.counts[a] = [v, max]; K(a, v >= max, `${fmt(v)} / ${fmt(max)}`); }
  const story = prog(0);
  for (let n = 1; n <= 7; n++) K("a" + (n + 1), story >= (n + 1) * 1000, T.why.chapter);
  K("a12", auto.reached > STEP_IDX["n-desert"] || story >= 2000, T.why.chocobo);
  K("a13", story >= 5000, T.fromSaveTip);
  for (const [a, foe] of [["a24", "King Gil Snapper"], ["a29", "Metal Gigantuar"], ["a40", "Ultima Weapon"]]) K(a, beaten(foe), beaten(foe) ? T.defeated : T.notDefeated);
  return auto;
}
let AUTO = computeAuto(SAVE);
const known = id => AUTO.known[id];
const isDone = id => known(id) ? known(id).done : (!!state.checked[id] || !!AUTO.steps[id]);
const doneAch = () => ACH.filter(a => a[0] === "a1" ? ACH.every(b => b[0] === "a1" || isDone(b[0])) : isDone(a[0])).length;
const currentStep = () => STEPS.findIndex(n => !isDone(n.id));

// ---------- Tooltips ----------
let TIPS = [];
const tip = html => `data-tip="${TIPS.push(html) - 1}"`;
const srcList = src => `<ul class="tt-src">${src.map(s => `<li>${img(...SRC_ICON[s.kind], "")}<span><b>${esc(s.where)}</b> <i>${esc(s.ch)}</i><br>${esc(s.text)}</span></li>`).join("")}</ul>`;
function itemTip(name) {
  const it = ITEM_BY_NAME[name], src = SOURCES[name] || [];
  const owned = AUTO.owned.has(name), owner = it && OWNER_BY_TYPE[it.type];
  return `<div class="tt-head">${it ? img("items", TYPE_ICON[it.type], it.type) : ""}<div><b>${esc(name)}</b><span>${it ? esc(typeName(it.type)) : ""}${owner ? " · " + esc(T.forChar(owner)) : ""}</span></div></div>` +
    (SAVE ? `<p class="${owned ? "ok" : "dim"}">${owned ? T.inInv : T.notInv}</p>` : "") +
    (src.length ? srcList(src) : `<p class="dim">${T.whereUnknown}</p>`);
}
const statusLine = id => { const k = known(id); return (isRel(id) ? `<p class="gold small">★ ${esc(relNames(id) ? T.relFor(relNames(id)) : T.relTip)}</p>` : `<p class="dim small">${T.optional}</p>`) + (k ? `<p class="${k.done ? "ok" : "dim"}">${k.done ? "✓" : "○"} ${esc(k.why || "")} <i class="dim">· ${T.fromSaveTip}</i></p>` : `<p class="dim">${T.clickTick}</p>`); };
function entryTip(x, extra = "") {
  return `<div class="tt-head"><div><b>${esc(x[1])}</b><span>${esc(T.kind[x[3]] || "")} · ${esc(x.ch)}</span></div></div>${statusLine(x[0])}${x[2] ? `<p>${esc(x[2])}</p>` : ""}${x[4] ? `<p class="gold">${T.reward}: ${esc(x[4])}</p>` : ""}${extra}`;
}

// ---------- Building blocks ----------
const meter = (v, max) => `<span class="meter"><span class="bar"><i style="width:${Math.min(100, max ? v / max * 100 : 0)}%"></i></span><span class="mono">${fmt(v)} / ${fmt(max)}</span></span>`;
function ownChips(text) {
  if (!SAVE) return "";
  const names = gearIn(text);
  if (!names.length) return "";
  return '<span class="owns">' + names.map(n => {
    const it = ITEM_BY_NAME[n], ic = it ? img("items", TYPE_ICON[it.type], it.type) : "";
    return `<span class="own ${AUTO.owned.has(n) ? "yes" : "no"}" tabindex="0" ${tip(itemTip(n))}>${ic}${AUTO.owned.has(n) ? "✓" : "○"} ${esc(n)}</span>`;
  }).join("") + "</span>";
}
// Card: status ✓/○, partial progress, tooltip; entries without save data can be ticked by click
function card(id, icon, name, sub, tipHtml, extra = "") {
  if (ui.only100 && !isRel(id)) return "";
  const k = known(id), done = isDone(id), part = k && k.part;
  const cls = SAVE || state.checked[id] ? (done ? "have" : part ? "part" : "miss") : "";
  const toggle = k ? "" : ` data-toggle="${id}" role="button" aria-pressed="${done}"`;
  return `<div class="gear ${cls}${k ? " locked" : " tog"}" tabindex="0"${toggle} ${tip(tipHtml)}>${icon}<div><b>${esc(name)}${relBadge(id)}</b><span>${sub}</span>${extra}</div><span class="mark">${done ? "✓" : part ? `${part[0]}/${part[1]}` : "○"}</span></div>`;
}
// Checkbox row for the route view
function checkHTML(id, title, desc, tags = "", extra = "") {
  const k = known(id), why = k ? k.why : AUTO.steps[id];
  const locked = !!k || (AUTO.steps[id] && !state.checked[id]);
  const c = isDone(id), part = k && k.part;
  return `<label class="item${c ? " done" : ""}"><input type="checkbox" data-id="${id}"${c ? " checked" : ""}${locked ? ` disabled title="${esc(why || "")}"` : ""}><span class="txt"><span class="t">${title}${tags}${part ? `<span class="tag gold">${part[0]}/${part[1]}</span>` : ""}${k || AUTO.steps[id] ? `<span class="tag ok" title="${esc(why || "")}">${T.fromSave}</span>` : ""}</span>${desc ? `<span class="d">${desc}</span>` : ""}${extra}</span></label>`;
}
function achTags(a) {
  const k = a[3] || ""; let h = `<span class="tag">${T.achievement}</span>`;
  if (k.includes("gold") || k.includes("plat")) h += `<span class="tag gold">${k.includes("plat") ? T.plat : T.gold}</span>`;
  if (k.includes("silver")) h += `<span class="tag">${T.silver}</span>`;
  if (k.includes("secret")) h += `<span class="tag">${T.secret}</span>`;
  return h;
}
function entryHTML(id) {
  if (ui.only100 && !isRel(id)) return "";
  const x = ITEM[id];
  if (x) {
    const d = esc(x[2] || "") + (x[4] ? (x[2] ? "<br>" : "") + `<span class="reward">${T.reward}: ${esc(x[4])}</span>` : "");
    const chips = ["gear", "shop", "side", "sub", "arms"].includes(x[3]) ? ownChips(x[3] === "shop" ? shopBuyText(x) : (x[2] || "") + " " + (x[4] || "")) : "";
    return checkHTML(x[0], (x[5] ? '<span class="gold">★ </span>' : "") + esc(x[1]), d, `<span class="tag">${T.kind[x[3]] || ""}</span>${relBadge(x[0])}`, chips);
  }
  const a = ACHMAP[id], c = AUTO.counts[id] || (AUTO.hints && AUTO.hints[id]);
  return checkHTML(a[0], esc(a[1]), esc(a[2]), achTags(a), SAVE && c ? `<span class="achprog">${meter(c[0], c[1])}</span>` : "");
}
const ELEMENT_RE = new RegExp(`\\b(${Object.keys(ELEMENT_ICON).join("|")})\\b`, "g");
function weakness(text) {
  return esc(text).replace(ELEMENT_RE, w => hasIcon("elements", ELEMENT_ICON[w]) ? `<span class="el" ${tip(`<b>${esc(T.weakness(w))}</b>`)}>${img("elements", ELEMENT_ICON[w], w)}${w}</span>` : w);
}
const filterBar = (key, opts, cur) => `<div class="filters" role="group">${opts.map(([k, l]) => `<button data-filter="${key}:${k}" aria-pressed="${cur === k}">${esc(l)}</button>`).join("")}</div>`;
const fmtDate = (ms, year = true) => new Date(ms).toLocaleString(T.locale, { timeZone: "UTC", day: "2-digit", month: "2-digit", ...(year ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" });
const subTitle = (icon, label, v, max) => `<h3 class="subhead">${icon}${label}${max != null ? ` <span class="muted mono">${v} / ${max}</span>` : ""}</h3>`;

// ---------- Overview sections ----------
const SECTIONS = {};

SECTIONS.party = () => {
  const itemLine = id => {
    if (!(id > 0)) return "—";
    const it = ITEMS[id];
    return it ? `<span class="inl hov" tabindex="0" ${tip(itemTip(it.name))}>${img("items", TYPE_ICON[it.type], "")}${esc(it.name)}</span>` : "Item " + id;
  };
  const joined = SAVE ? SAVE.units.filter(u => u.join === "Join").length : 0;
  const body = `<div class="cards">${CHARS.map(c => {
    const u = SAVE && SAVE.units.find(x => x.id === c.objectId);
    const on = u && u.join === "Join";
    return `<article class="win pcard${on ? "" : " off"}"><div class="art">${img("portraits", c.objectId, c.name)}</div><div class="body">
      <h3>${img("chars", c.objectId, c.name, "px")}${esc(c.name)}</h3>
      <span class="muted small">${u ? T.join[u.join] || u.join : "—"}${SAVE && SAVE.party.includes(c.objectId) ? " · " + T.inActive : ""}</span>
      ${on ? `<dl class="kv">
        <dt>${T.vision}</dt><dd>${u.vision > 0 && VIS[u.vision] ? `<span class="inl hov" tabindex="0" ${tip(visionTip(u.vision))}>${img("visions", u.vision, "", "px")}${esc(VIS[u.vision].name)}</span>` : "—"}</dd>
        <dt>${T.weapon}</dt><dd>${itemLine(u.weapon)}</dd>
        <dt>${T.armor}</dt><dd>${itemLine(u.armor)}</dd>
        <dt>${T.accessories}</dt><dd>${u.acc.filter(a => a > 0).map(itemLine).join("<br>") || "—"}</dd>
        <dt>${T.hpmp}</dt><dd class="mono">${u.hp} / ${u.mp}</dd>
        <dt>${T.exp}</dt><dd class="mono">${fmt(u.exp)}</dd>
      </dl>` : `<p class="small"><b>${T.joinsAt}</b> ${esc(JOIN_AT[c.objectId] || T.joinStory)}</p>`}
      <p class="small dim">${T.weaponType}: ${esc(typeName(c.weapon))} · ${T.armorType}: ${esc(c.armor.map(typeName).join(", "))}</p>
    </div></article>`;
  }).join("")}</div>`;
  return { icon: img("map", "Town", ""), v: joined, max: 8, body, preview: `<span class="faces">${CHARS.map(c => `<span class="${SAVE && SAVE.units.find(u => u.id === c.objectId && u.join === "Join") ? "" : "dimface"}">${img("chars", c.objectId, c.name, "px")}</span>`).join("")}</span>` };
};

function visionTip(id) {
  const v = VIS[id], e = ITEM[VISION_ENTRY[id]], o = SAVE && AUTO.visions.has(id) && SAVE.visions.find(x => x.id === id), disc = SAVE && AUTO.discovered.has(id);
  const mrp = o ? Object.entries(o.mrp).filter(([, p]) => p > 0).map(([cid, p]) => `${esc(CHAR[cid] ? CHAR[cid].name : cid)} ${fmt(p)}`).join(" · ") : "";
  return `<div class="tt-head">${img("visions", id, v.name, "px")}<div><b>${esc(v.name)}</b><span>${esc(v.type)}</span></div></div>` +
    (SAVE ? `<p class="${o ? "ok" : disc ? "gold" : "dim"}">${o ? `✓ ${T.found} · ${T.awakening(o.awk)}` : disc ? `◐ ${T.discovered}` : `○ ${T.notFound}`}</p>` : "") +
    (mrp ? `<p>MRP: ${mrp}</p>` : "") +
    (e ? `<ul class="tt-src"><li>${img("map", "Shrine", "")}<span><b>${esc(e[1])}</b> <i>${esc(e.ch)}</i><br>${esc(e[2] || "")}</span></li></ul>` : `<p class="dim">${T.whereUnknown}</p>`);
}
function tileGrid(key, list, detail) {
  const sel = ui.sel[key];
  const tiles = list.map(t => `<button class="tile ${t.have ? "have" : t.disc ? "disc" : "miss"}" data-sel="${key}:${t.id}" aria-pressed="${String(sel) === String(t.id)}" ${tip(t.tip)}>${t.icon}<span class="nm">${esc(t.name)}</span><span class="st">${t.sub}</span></button>`).join("");
  const s = list.find(t => String(t.id) === String(sel));
  return (s ? `<div class="win detail">${detail(s)}</div>` : "") + `<div class="grid">${tiles}</div>`;
}

SECTIONS.visions = () => {
  const have = Object.fromEntries((SAVE ? SAVE.visions : []).filter(v => AUTO.visions.has(v.id)).map(v => [v.id, v]));
  const list = VISIONS.map(v => {
    const e = ITEM[VISION_ENTRY[v.objectId]];
    return { id: v.objectId, name: v.name, have: !!have[v.objectId], icon: img("visions", v.objectId, v.name, "px"), tip: visionTip(v.objectId),
      disc: AUTO.discovered && AUTO.discovered.has(v.objectId),
      sub: have[v.objectId] ? T.awakening(have[v.objectId].awk) : AUTO.discovered && AUTO.discovered.has(v.objectId) ? T.discovered : (e ? esc(e[3] === "vis" && (e[2] || "").length <= 32 ? e[2].replace(/\.$/, "") : (T.kind[e[3]] || "") + " · " + e.ch) : esc(v.type)), v, o: have[v.objectId], e };
  });
  const body = tileGrid("vis", list, t => `${img("visions", t.id, t.name, "px")}<div class="txt"><h3>${esc(t.name)}</h3><span class="muted">${esc(t.v.type)} · ${t.o ? T.awakening(t.o.awk) : T.notFound}</span>
      ${t.o ? `<p>${Object.entries(t.o.mrp).filter(([, p]) => p > 0).map(([cid, p]) => `${esc(CHAR[cid] ? CHAR[cid].name : cid)}: ${fmt(p)} MRP`).join(" · ") || T.mrpNone}</p>` : ""}
      ${t.e ? `<p><b>${T.where}:</b> ${esc(t.e[1])} (${esc(t.e.ch)}). ${esc(t.e[2] || "")}</p>` : `<p class="muted">${T.whereUnknown}</p>`}</div>`);
  return { icon: img("ui", "ICON_Result_MRP", ""), v: list.filter(t => t.have).length, max: 26, body, lead: T.visLead };
};

SECTIONS.espers = () => {
  const list = ESPERS.map(es => {
    const e = ITEM[es.entry], have = isDone(es.entry), k = known(es.entry);
    return { id: es.id, name: es.name, entry: es.entry, have, e, icon: img("espers", es.id, es.name, "px"), sub: have ? T.obtained : esc(e ? e.ch : ""),
      tip: `<div class="tt-head">${img("espers", es.id, es.name, "px")}<div><b>${esc(es.name)}</b><span>${T.esper}</span></div></div>${statusLine(es.entry)}${e ? `<ul class="tt-src"><li>${img("map", "Beast", "")}<span><b>${esc(e[1])}</b> <i>${esc(e.ch)}</i><br>${esc(e[2] || "")}</span></li></ul>` : ""}` };
  });
  const body = tileGrid("esp", list, t => `${img("espers", t.id, t.name, "px")}<div class="txt"><h3>${esc(t.name)}</h3>${t.e ? `<p><b>${T.where}:</b> ${esc(t.e[2] || t.e[1])}</p><p class="small muted">${esc(t.e.ch)}${t.e[4] ? " · " + esc(t.e[4]) : ""}</p>` : ""}
      <div class="list">${checkHTML(t.entry, T.obtained, "")}</div></div>`);
  return { icon: img("map", "Beast", ""), v: list.filter(t => t.have).length, max: 9, body };
};

SECTIONS.gear = () => {
  const names = new Set(Object.keys(SOURCES).filter(n => ITEM_BY_NAME[n]));
  if (SAVE) for (const id in SAVE.items) { const it = ITEMS[id]; if (it && it.type !== "Consumable" && it.type !== "Valuable") names.add(it.name); }
  const chars = [["all", T.all], ...CHARS.map(c => [c.weapon, c.name]), ["armor", T.armorF], ["Accessory", T.accF]];
  let list = [...names].map(n => ITEM_BY_NAME[n]);
  if (ui.invChar !== "all") list = list.filter(it => ui.invChar === "armor" ? ["Light Armor", "Heavy Armor", "Robe"].includes(it.type) : it.type === ui.invChar);
  if (SAVE && ui.invFilter !== "all") list = list.filter(it => (ui.invFilter === "have") === AUTO.owned.has(it.name));
  const order = Object.keys(TYPE_ICON);
  list.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name, T.locale));
  const cards = list.map(it => {
    const owned = AUTO.owned.has(it.name), first = (SOURCES[it.name] || [])[0];
    return `<div class="gear ${SAVE ? (owned ? "have" : "miss") : ""}" tabindex="0" ${tip(itemTip(it.name))}>${img("items", TYPE_ICON[it.type], it.type)}<div><b>${esc(it.name)}</b><span>${first ? `${img(...SRC_ICON[first.kind], "")}${esc(first.where)}` : `<span class="dim">${T.unknownSrc}</span>`}</span></div>${SAVE ? `<span class="mark">${owned ? "✓" : "○"}</span>` : ""}</div>`;
  }).join("");
  const other = SAVE ? Object.entries(SAVE.items).map(([id, n]) => [ITEMS[id], n]).filter(([it]) => it && (it.type === "Consumable" || it.type === "Valuable")) : [];
  const body = filterBar("invChar", chars, ui.invChar) + (SAVE ? filterBar("invFilter", [["all", T.all], ["have", T.have], ["miss", T.miss]], ui.invFilter) : "") +
    `<div class="gearlist">${cards || `<p class="muted">${T.nothingFilter}</p>`}</div>` +
    (other.length ? `${subTitle(img("items", "ICON_Item_Bug", ""), T.otherItems)}<ul class="cols">${other.sort((a, b) => a[0].name.localeCompare(b[0].name, T.locale)).map(([it, n]) => `<li>${img("items", TYPE_ICON[it.type], "")}${esc(it.name)} <span class="muted mono">×${n}</span></li>`).join("")}</ul>` : "");
  // Collapsed preview: owned count per character weapon type and armor
  const all = [...names].map(n => ITEM_BY_NAME[n]);
  const per = [...CHARS.map(c => [c.weapon, c.name, TYPE_ICON[c.weapon]]), ["armor", T.armorF, "ICON_Item_LightArmor"], ["Accessory", T.accF, "ICON_Item_Ling"]].map(([t, l, ic]) => {
    const g = all.filter(it => t === "armor" ? ["Light Armor", "Heavy Armor", "Robe"].includes(it.type) : it.type === t);
    return `<button class="chipbtn" data-gearchar="${t}">${img("items", ic, "")}${esc(l)} <i class="mono">${g.filter(it => AUTO.owned.has(it.name)).length}/${g.length}</i></button>`;
  }).join("");
  return { icon: img("items", "ICON_Item_Brade", ""), v: [...names].filter(n => AUTO.owned.has(n)).length, max: names.size, body, lead: T.gearLead + " " + T.notRequired, opt: true, preview: `<div class="chiprow">${per}</div>` };
};

SECTIONS.collect = () => {
  const groups = [["cave", T.caves, "Cave"], ["arms", T.arms, "Weapon"], ["adam", T.adam, "Interact"], ["shard", T.shards, "Shrine"]];
  const counters = COUNTERS.filter(c => ["c-shard", "c-mr9"].includes(c[0]) && !(c[0] === "c-shard" && SAVE)).map(([id, l, max]) => {
    const v = state.counts[id] || 0;
    return `<div class="win thin counter"><span class="mono">${esc(l)}</span><div class="ctl"><button class="step" data-c="${id}" data-d="-1" aria-label="− ${esc(l)}">−</button><span class="val">${v} / ${max}</span><button class="step" data-c="${id}" data-d="1" aria-label="+ ${esc(l)}">+</button></div><span class="bar"><i style="width:${Math.min(100, v / max * 100)}%"></i></span></div>`;
  }).join("");
  let total = 0, done = 0;
  const body = groups.map(([kind, label, icon]) => {
    const entries = Object.values(ITEM).filter(x => x[3] === kind);
    const d = entries.filter(x => isDone(x[0])).length; total += entries.length; done += d;
    const areaInfo = x => !SAVE || !SHARD_ENTRY[x[0]] ? "" : `<ul class="tt-src">${SHARD_ENTRY[x[0]].map(m => { const a = AREAS[m], c = (SAVE.shards || {})[m] || { open: 0, total: a.shards.en.length };
      return `<li>${img("map", c.open >= c.total ? "Check" : "Shrine", "")}<span><b>${esc(areaName(a))}: ${T.collected(c.open, c.total)}</b><br>${esc(a.shards[LANG].join(" · "))}</span></li>`; }).join("")}</ul>`;
    const cards = entries.map(x => card(x[0], img("map", icon, ""), x[1], esc(known(x[0]) ? known(x[0]).why : x.ch), entryTip(x, areaInfo(x)))).join("");
    return cards ? subTitle(img("map", icon, ""), label, d, entries.length) + (kind === "shard" && SAVE ? `<p class="muted small">${T.shardHint} ${T.collected(AUTO.shardTotal, 99)}</p>` : "") + `<div class="gearlist">${cards}</div>` : "";
  }).join("") + (counters ? subTitle(img("map", "Check", ""), T.counters) + `<div class="counters">${counters}</div>` : "");
  return { icon: img("map", "Cave", ""), v: done, max: total, body, lead: T.collectLead };
};

SECTIONS.chests = () => {
  if (!SAVE) return { icon: img("map", "TresureBox", ""), body: `<p class="muted">${T.needSave(T.chestsTitle)}</p>` };
  const rows = Object.entries(SAVE.chests).filter(([id]) => +id !== 1000).sort((a, b) => (AREAS[a[0]] ? 0 : 1) - (AREAS[b[0]] ? 0 : 1) || a[0] - b[0]);
  const w = SAVE.chests[1000];
  const open = rows.reduce((a, [, c]) => a + c.open, 0), all = rows.reduce((a, [, c]) => a + c.total, 0);
  const body = `<div class="table-wrap"><table class="data"><thead><tr><th>${T.area}</th><th>${T.open}</th><th>${T.contents}</th></tr></thead><tbody>${rows.map(([id, c]) => {
    const a = AREAS[id], miss = c.total - c.open;
    const contents = a && a.chests ? a.chests.map(s => { s = localize(s); const nm = gearIn(s)[0]; return nm ? `<span class="hov" tabindex="0" ${tip(itemTip(nm))}>${esc(s)}</span>` : esc(s); }).join(", ") : `<span class="dim">${T.unknown}</span>`;
    return `<tr><td><span class="inl">${img("map", "TresureBox", "")}${a ? esc(areaName(a)) : T.areaN(id)}</span></td><td class="mono ${miss ? "warnc" : "ok"}">${c.open} / ${c.total}</td><td>${contents}</td></tr>`;
  }).join("")}</tbody></table></div>`;
  return { icon: img("map", "TresureBox", ""), v: open, max: all, body, lead: T.chestsLead(w ? `${w.open} / ${w.total}` : "") + " " + T.notRequired, opt: true };
};

SECTIONS.side = () => {
  const byCh = {};
  for (const x of Object.values(ITEM)) if (x[3] === "side" || x[3] === "sub") (byCh[x.ch] = byCh[x.ch] || []).push(x);
  const all = Object.values(byCh).flat(), done = all.filter(x => isDone(x[0])).length;
  const ready = SAVE ? SAVE.board.filter(q => q.state === "ConditionAchievement").length : 0;
  const extra = SAVE ? `<div class="sumgrid">
      <div class="win thin sum"><span class="lbl">${img("map", "QuestBoard", "")}${T.board}</span><span class="mono ${ready ? "gold" : ""}">${ready ? T.boardReady(ready) : T.boardNone}</span></div>
      <div class="win thin sum"><span class="lbl">${img("map", "ColosseumRank", "")}${T.colosseum}</span><span class="mono">${T.colWon(SAVE.colosseum.filter(c => c.clears > 0).length, SAVE.colosseum.length)}</span></div>
    </div>` : "";
  const body = extra + CH_ORDER.filter(c => byCh[c]).map(c => {
    const list = byCh[c];
    return subTitle(img("ui", "ICON_Menu_SubStory", ""), esc(c), list.filter(x => isDone(x[0])).length, list.length) +
      `<div class="gearlist">${list.map(x => card(x[0], img("ui", x[3] === "sub" ? "ICON_Menu_MainStory" : "ICON_Menu_SubStory", ""), x[1], esc(known(x[0]) ? known(x[0]).why : T.kind[x[3]]), entryTip(x, ownChips(x[4] || "")))).join("")}</div>`;
  }).join("");
  return { icon: img("ui", "ICON_Menu_Reauest", ""), v: done, max: all.length, body, lead: T.sideLead(ACHMAP.a11[1]) };
};

SECTIONS.ach = () => {
  const list = ACH.filter(a => ui.achFilter === "all" || (ui.achFilter === "open" ? !isDone(a[0]) : isDone(a[0])));
  const tier = a => (a[3] || "").includes("plat") ? ["ICON_Vision_Rank", T.tierPlat] : (a[3] || "").includes("gold") ? ["ICON_Vision_Rank", T.tierGold] : (a[3] || "").includes("silver") ? ["ICON_Quest_Clear", T.tierSilver] : ["ICON_Quest_Check", T.tierBronze];
  const body = filterBar("achFilter", [["all", T.achAll], ["open", T.achOpen], ["done", T.achDone]], ui.achFilter) +
    `<div class="gearlist">${list.map(a => {
      const c = AUTO.counts[a[0]] || (AUTO.hints && AUTO.hints[a[0]]), [ic, tn] = tier(a);
      const bar = SAVE && c && c[1] > 1 ? `<span class="minibar"><i style="width:${Math.min(100, c[0] / c[1] * 100)}%"></i></span>` : "";
      const t = `<div class="tt-head">${img("ui", ic, "")}<div><b>${esc(a[1])}</b><span>${tn}${(a[3] || "").includes("secret") ? " · " + T.secret : ""}</span></div></div>${statusLine(a[0])}<p>${esc(a[2])}</p>${SAVE && c ? `<p>${meter(c[0], c[1])}</p>` : ""}`;
      return card(a[0], img("ui", ic, ""), a[1], esc(a[2]), t, bar);
    }).join("") || `<p class="muted">${T.nothingFilter}</p>`}</div>`;
  return { icon: img("ui", "ICON_Vision_Rank", ""), v: doneAch(), max: 40, body, lead: T.achLead };
};

// ---------- Views ----------
const SEC_ORDER = ["party", "visions", "espers", "gear", "collect", "chests", "side", "ach"];
const VIEW = {};

VIEW.overview = () => {
  const S = SAVE, cur = currentStep(), n = STEPS[cur];
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const party = S ? `<span class="faces">${S.party.map(id => `<span ${tip(`<b>${esc(CHAR[id].name)}</b>`)}>${img("chars", id, CHAR[id] ? CHAR[id].name : "", "px")}</span>`).join("")}</span>` : "—";
  const bv = S ? T.battlesVal(fmt(S.wins), fmt(S.escapes), fmt(S.encounters)) : null;
  const achDone = doneAch();
  const secs = SEC_ORDER.map(k => [k, SECTIONS[k]()]).filter(([, s]) => !(ui.only100 && s.opt));
  const nav = `<nav class="secnav" aria-label="${T.jump}"><button class="chipbtn${ui.only100 ? " on" : ""}" data-only100 aria-pressed="${ui.only100}">★ ${T.only100}</button>${secs.map(([k, s]) => `<a href="#sec-${k}" data-jump="${k}">${s.icon}<span>${T.secs[k]}</span>${s.max ? `<i class="mono">${s.v}/${s.max}</i>` : ""}</a>`).join("")}</nav>`;
  return `<div class="win info"><table>
      ${row(T.file, S ? `${esc(S.file)} <span class="muted small">(${T.savedAt(S.saved ? fmtDate(S.saved) : "?")})</span>` : "—")}
      ${row(T.completion, `${Math.round(achDone / 40 * 100)} % <span class="muted small">(${T.achOf(achDone)})</span>`)}
      ${row(T.playtime, S ? `${Math.floor(S.playTime / 3600)} h ${String(Math.floor(S.playTime % 3600 / 60)).padStart(2, "0")} min ${String(Math.floor(S.playTime % 60)).padStart(2, "0")} sec` : "0 h 00 min 00 sec")}
      ${row(T.gil, `<span class="inl">${S ? fmt(S.gil) : 0} ${img("ui", "ICON_Menu_GILL", "Gil")}</span>`)}
      ${row(T.location, S ? `${esc(localize(S.island))} <span class="muted small">${AREAS[S.mapId] ? esc(areaName(AREAS[S.mapId])) : T.map + " " + S.mapId}</span>` : "—")}
      ${row(T.activeParty, party)}
      ${row(T.battles, bv ? `${bv[0]} <span class="muted small">· ${bv[1]}</span>` : "—")}
      ${S ? row(T.shardsTitle, meter(AUTO.shardTotal, 99) + `<span class="muted small">${T.shardsHanded(S.shardsHanded || 0)}</span>`) : ""}
      ${S ? row(T.sumStagger, meter(S.staggers, 1000)) + row(T.sumRes, meter(S.resonances, 400)) + row(T.sumSpent, meter(S.spent, 100000)) : ""}
    </table></div>
    ${n ? `<button class="win next" data-view="quest">${img("map", "Check", "", "px")}<span><span class="eyebrow">${EDITION === "public" ? T.nextStory : T.nextRoute} · ${esc(n.ch)}${S && AUTO.reachWhy ? " · " + esc(AUTO.reachWhy) : ""}</span><b>${esc(n.place)}</b><span class="muted small">${T.lv} ${esc(n.lvl)}${(n.joins || []).length ? ` · ${T.newMember}: ` + esc(n.joins.join(", ")) : ""}${(n.boss || []).length ? ` · ${T.boss}: ` + esc(n.boss.map(b => b[0]).join(", ")) : ""}</span></span><span class="go">›</span></button>` : ""}
    ${nav}
    ${secs.map(([k, s]) => {
      const closed = ui.collapsed.has(k);
      return `<section class="win cat${closed ? " closed" : ""}" id="sec-${k}">
        <button class="cat-head" data-collapse="${k}" aria-expanded="${!closed}">${s.icon}<h2>${T.secs[k]}</h2>${s.max ? meter(s.v, s.max) : ""}<span class="chev" aria-hidden="true">${closed ? "▸" : "▾"}</span></button>
        ${closed ? (s.preview ? `<div class="cat-preview">${s.preview}</div>` : "") : `<div class="cat-body">${s.lead ? `<p class="muted small">${s.lead}</p>` : ""}${s.body}</div>`}
      </section>`;
    }).join("")}`;
};

VIEW.quest = () => {
  const cur = currentStep();
  const ORDER = ["step", "shop", "gear", "vis", "esp", "cave", "shard", "arms", "adam", "sub", "side", "ach"];
  const GROUP = { step: "step", shop: "shop", gear: "gear", vis: "vis", esp: "vis", cave: "vis", shard: "vis", arms: "vis", adam: "vis", sub: "sub", side: "sub", ach: "ach" };
  const kind = id => ITEM[id] ? ITEM[id][3] : "ach";
  let lastCh = "";
  const nodes = STEPS.map((n, i) => {
    if (ui.tlMode === "next" && cur >= 0 && i < cur - 1) return "";
    const done = isDone(n.id);
    const ids = [...(n.extra || []).map(x => x[0]), ...n.items].sort((p, q) => ORDER.indexOf(kind(p)) - ORDER.indexOf(kind(q)));
    let g = "", body = "";
    for (const id of ids) { const gg = GROUP[kind(id)]; if (gg !== g) { body += `<div class="grp">${T.groups[gg]}</div>`; g = gg; } body += entryHTML(id); }
    const open = !done && (ui.sel["tl-" + n.id] ?? i === cur);
    const chHead = n.ch !== lastCh ? `<li class="tl-ch">${esc(n.ch)}</li>` : ""; lastCh = n.ch;
    const joins = (n.joins || []).map(j => `<span class="chip join">${T.newMember}: ${esc(j)}</span>`).join("");
    const boss = (n.boss || []).map((b, bi) => {
      const en = norm((GUIDE.en.STEPS[i].boss || [])[bi] ? GUIDE.en.STEPS[i].boss[bi][0] : "").replace(/\s*\(.*$/, "");
      const ids = unitIds(en), won = SAVE && ids.length ? ids.some(id => AUTO.defeated.has(id)) : null;
      return `<li>${won === null ? "" : `<span class="${won ? "ok" : "dim"}" title="${won ? T.defeated : T.notDefeated}">${won ? "✓" : "○"}</span>`}<b>${esc(b[0])}</b> · ${weakness(b[1])}</li>`;
    }).join("");
    const chests = SAVE ? Object.entries(AREAS).filter(([id, a]) => a.step === n.id && SAVE.chests[id]).map(([id, a]) => {
      const c = SAVE.chests[id];
      return `<li>${img("map", "TresureBox", "")}${T.chestsOpen(esc(areaName(a)), c.open, c.total, c.total - c.open)}</li>`;
    }).join("") : "";
    const why = AUTO.steps[n.id], auto = why && !state.checked[n.id];
    return chHead + `<li class="win tl-node${done ? " done" : ""}${i === cur ? " cur" : ""}" id="${n.id}">
      <details data-n="${n.id}"${open ? " open" : ""}><summary>
        <span class="tl-dot" aria-hidden="true"></span>
        <span class="tl-head"><span class="tl-num">${i + 1}</span><span class="tl-place">${esc(n.place)}</span>${i === cur ? `<span class="chip here">${T.hereChip}</span>` : ""}</span>
        <span class="tl-meta"><span class="chip">${T.lv} ${esc(n.lvl)}</span>${joins}${ids.length ? `<span class="chip">${ids.filter(isDone).length}/${ids.length}</span>` : ""}</span>
      </summary>
      <div class="tl-body">
        ${boss ? `<ul class="boss">${boss}</ul>` : ""}
        ${n.tip ? `<p class="tl-tip">${esc(n.tip)}</p>` : ""}
        ${chests ? `<ul class="chestline">${chests}</ul>` : ""}
        ${body ? `<div class="list">${body}</div>` : ""}
        <label class="item tl-done"><input type="checkbox" data-id="${n.id}"${done ? " checked" : ""}${auto ? ` disabled title="${esc(why)}"` : ""}> ${T.stepDone}${auto ? ` <span class="tag ok">${T.fromSave}</span>` : ""}</label>
      </div></details></li>`;
  }).join("");
  return `<div class="route-head win">${img("map", "Check", "", "px")}<div><h2>${EDITION === "public" ? T.storyTitle : T.routeTitle}</h2><p class="muted">${EDITION === "public" ? T.storyLead : T.routeLead} ${SAVE && AUTO.reachWhy ? T.routeSave(esc(AUTO.reachWhy)) : ""}</p></div></div>` +
    `<div class="filters" role="group"><button data-tl="next" aria-pressed="${ui.tlMode === "next"}">${T.fromCurrent}</button><button data-tl="all" aria-pressed="${ui.tlMode === "all"}">${T.allSteps}</button><button data-only100 aria-pressed="${ui.only100}">★ ${T.only100}</button></div>
    <ol class="timeline">${nodes}</ol>`;
};

// ---------- Rendering ----------
function render() {
  TIPS = [];
  $("tabs").innerHTML = VIEWS.map(v => `<button role="tab" data-view="${v}" aria-selected="${ui.view === v}">${viewName(v)}</button>`).join("");
  document.querySelectorAll(".static-panel").forEach(p => p.hidden = p.dataset.tab !== ui.view || p.dataset.for !== LANG);
  $("panel").hidden = !VIEW[ui.view];
  if (VIEW[ui.view]) $("panel").innerHTML = VIEW[ui.view]();
  hideTip();
  $("forgetSave").hidden = !SAVE;
  $("dropText").textContent = SAVE ? T.dropLoaded(SAVE.file, SAVE.saved ? fmtDate(SAVE.saved, false) : "") : T.dropEmpty;
}
function setView(v) { ui.view = v; store.set("ffr-view-" + EDITION, v); render(); $("tabs").scrollIntoView({ block: "nearest" }); }

async function loadFile(file) {
  const msg = $("saveMsg");
  msg.textContent = T.reading; msg.className = "savemsg";
  try {
    SAVE = await readSaveFile(file);
    store.set("ffr-save", SAVE);
    AUTO = computeAuto(SAVE);
    msg.textContent = T.readOk;
    render();

  } catch (e) {
    msg.textContent = T.readErr(e.message); msg.className = "savemsg err";
  }
}

// ---------- Tooltip behaviour ----------
const tipEl = document.createElement("div");
tipEl.className = "tooltip win"; tipEl.setAttribute("role", "tooltip"); tipEl.hidden = true;
document.body.appendChild(tipEl);
let tipFor = null;
function showTip(el) {
  const html = TIPS[+el.dataset.tip]; if (html == null) return;
  tipFor = el; tipEl.innerHTML = html; tipEl.hidden = false;
  const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  let x = r.left + r.width / 2 - t.width / 2, y = r.bottom + 10;
  if (y + t.height > innerHeight - 8) y = r.top - t.height - 10;
  x = Math.max(8, Math.min(x, innerWidth - t.width - 8));
  tipEl.style.left = x + "px"; tipEl.style.top = Math.max(8, y) + "px";
}
function hideTip() { tipFor = null; tipEl.hidden = true; }
document.addEventListener("pointerover", e => { if (e.pointerType === "touch") return; const el = e.target.closest("[data-tip]"); if (el && el !== tipFor) showTip(el); else if (!el && tipFor) hideTip(); });
document.addEventListener("focusin", e => { const el = e.target.closest("[data-tip]"); el ? showTip(el) : hideTip(); });
document.addEventListener("scroll", hideTip, true);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") hideTip();
  const t = e.target.closest && e.target.closest("[data-toggle]");
  if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.click(); }
});

// ---------- Events ----------
const toggleCheck = id => { if (state.checked[id]) delete state.checked[id]; else state.checked[id] = true; persist(); render(); };
document.addEventListener("change", e => {
  if (e.target.id === "saveFile") { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; return; }
  const id = e.target.dataset && e.target.dataset.id; if (!id) return;
  if (e.target.checked) state.checked[id] = true; else delete state.checked[id];
  persist(); render();
});
document.addEventListener("click", e => {
  const lb = e.target.closest(".langbar [data-lang]"); if (lb) { if (lb.dataset.lang !== LANG) { try { localStorage.setItem("ffr-lang", lb.dataset.lang); } catch (x) {} location.reload(); } return; }
  const v = e.target.closest("[data-view]"); if (v) { setView(v.dataset.view); return; }
  if (e.target.closest("[data-only100]")) { ui.only100 = !ui.only100; store.set("ffr-only100", ui.only100); render(); return; }
  const j = e.target.closest("[data-jump]");
  if (j) { e.preventDefault(); const k = j.dataset.jump; if (ui.collapsed.delete(k)) { store.set("ffr-collapsed-" + EDITION, [...ui.collapsed]); render(); } $("sec-" + k).scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const cl = e.target.closest("[data-collapse]");
  if (cl) { const k = cl.dataset.collapse; ui.collapsed.has(k) ? ui.collapsed.delete(k) : ui.collapsed.add(k); store.set("ffr-collapsed-" + EDITION, [...ui.collapsed]); render(); return; }
  const gc = e.target.closest("[data-gearchar]");
  if (gc) { ui.invChar = gc.dataset.gearchar; ui.collapsed.delete("gear"); store.set("ffr-collapsed-" + EDITION, [...ui.collapsed]); render(); $("sec-gear").scrollIntoView({ block: "start" }); return; }
  const tg = e.target.closest("[data-toggle]"); if (tg) { toggleCheck(tg.dataset.toggle); return; }
  const s = e.target.closest("[data-sel]"); if (s) { const [k, val] = s.dataset.sel.split(":"); ui.sel[k] = ui.sel[k] === val ? null : val; render(); return; }
  const tl = e.target.closest("[data-tl]"); if (tl) { ui.tlMode = tl.dataset.tl; render(); return; }
  const f = e.target.closest("[data-filter]"); if (f) { const [k, val] = f.dataset.filter.split(":"); ui[k] = val; render(); return; }
  const c = e.target.closest("button[data-c]");
  if (c) { const def = COUNTERS.find(x => x[0] === c.dataset.c); state.counts[def[0]] = Math.max(0, Math.min(def[2], (state.counts[def[0]] || 0) + Number(c.dataset.d))); persist(); render(); }
});
document.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.n) ui.sel["tl-" + d.dataset.n] = d.open; }, true);

const rb = $("reset");
rb.textContent = T.reset;
rb.addEventListener("click", () => {
  if (!rb.dataset.armed) { rb.dataset.armed = "1"; rb.textContent = T.resetConfirm; setTimeout(() => { delete rb.dataset.armed; rb.textContent = T.reset; }, 4000); return; }
  delete rb.dataset.armed; rb.textContent = T.reset;
  state = { checked: {}, counts: {} }; persist(); render();
});
$("forgetSave").textContent = T.forget;
$("forgetSave").addEventListener("click", () => { SAVE = null; store.set("ffr-save", null); AUTO = computeAuto(null); $("saveMsg").textContent = ""; render(); });

const dz = $("dropzone");
["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

// Static texts, language switch, static panels with game names in the selected language
document.querySelectorAll("[data-i18n]").forEach(el => { const k = el.dataset.i18n; el.textContent = (EDITION === "public" && T[k + "Public"]) || T[k]; });
document.querySelectorAll(".langbar [data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === LANG));
document.querySelectorAll(`.static-panel[data-for="${LANG}"]`).forEach(p => {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = localize(n.nodeValue);
});

// Game graphics for header, background and cursor, if available locally
const assetUrl = p => `url('${new URL(p, location.href).href}')`;
if (hasIcon("ui", "T_TitleLogoText")) { $("logoImg").src = "icons/ui/T_TitleLogoText.png"; $("logoImg").hidden = false; $("logoText").hidden = true; }
if (hasIcon("ui", "T_EventStill_00")) document.documentElement.style.setProperty("--bg-img", assetUrl("icons/ui/T_EventStill_00.png"));
if (hasIcon("ui", "MenuIcon_FingerCursor_R")) document.documentElement.style.setProperty("--cursor", assetUrl("icons/ui/MenuIcon_FingerCursor_R.png"));
document.querySelectorAll(".static-panel .build h3").forEach(h => {
  const c = CHARS.find(x => x.name === h.textContent.trim()) || CATALOG.characters.find(x => x.name === h.textContent.trim());
  if (c && hasIcon("chars", c.objectId)) h.insertAdjacentHTML("afterbegin", img("chars", c.objectId, c.name, "px"));
});

render();

// Live mode: while tools/live.py runs, the page reloads new saves automatically.
// The personal edition connects on load; the public site only after the visitor enables it.
const LIVE = "http://127.0.0.1:8765";
let liveStamp = null;
async function livePoll(manual) {
  try {
    const info = await (await fetch(LIVE + "/info", { cache: "no-store" })).json();
    if (info.mtime !== liveStamp) {
      const blob = await (await fetch(LIVE + "/latest.sav", { cache: "no-store" })).blob();
      SAVE = await readSaveFile(new File([blob], info.name));
      store.set("ffr-save", SAVE); AUTO = computeAuto(SAVE); liveStamp = info.mtime; render();
      $("saveMsg").textContent = T.liveUpdated(new Date().toLocaleTimeString(T.locale, { hour: "2-digit", minute: "2-digit" })); $("saveMsg").className = "savemsg";
    }
    $("liveBadge").hidden = false; $("liveBtn").hidden = true;
    setTimeout(livePoll, 4000);
  } catch (e) {
    $("liveBadge").hidden = true; $("liveBtn").hidden = false;
    if (manual) { $("saveMsg").textContent = T.liveHint; $("saveMsg").className = "savemsg err"; }
  }
}
$("dropzone").insertAdjacentHTML("beforeend", `<p class="live" id="liveBadge" hidden>● ${T.liveOn}</p><button class="linkbtn" id="liveBtn">${T.liveEnable}</button>`);
$("liveBtn").addEventListener("click", () => { store.set("ffr-live", true); livePoll(true); });
if (EDITION === "personal" || store.get("ffr-live")) livePoll(); else $("liveBtn").hidden = false;
