// Reads FFRS saves (GameSaveDataN.sav) entirely in the browser. Nothing is uploaded.
// Container: "SVHD" header (32 bytes, SHA-1 of the rest), then AES-256-ECB, wrapping an Unreal Engine GVAS save.
// Format as documented by the atma.gg save editor.
const FFRS_KEY = new TextEncoder().encode("wwrqPkdwzPvgfchQ8kTYHVbn4umTf3d7");

// WebCrypto has no ECB mode. CBC decryption yields D(C_i) xor C_{i-1}; the xor is undone afterwards.
// An appended block E(pad xor C_last) provides valid PKCS#7 padding.
async function aesEcbDecrypt(data) {
  const key = await crypto.subtle.importKey("raw", FFRS_KEY, "AES-CBC", false, ["encrypt", "decrypt"]);
  const pad = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: data.slice(-16) }, key, new Uint8Array(0)));
  const full = new Uint8Array(data.length + 16);
  full.set(data); full.set(pad, data.length);
  const out = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, key, full));
  for (let i = out.length - 1; i >= 16; i--) out[i] ^= data[i - 16];
  return out;
}

async function decryptSave(buf) {
  const b = new Uint8Array(buf);
  if (b.length <= 32 || String.fromCharCode(...b.subarray(0, 4)) !== "SVHD") throw new Error("Not a Final Fantasy Resonance save file (GameSaveDataN.sav).");
  const body = b.subarray(32);
  if (body.length % 16) throw new Error("The file is incomplete.");
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-1", body));
  if (!sha.every((x, i) => x === b[8 + i])) throw new Error("Checksum mismatch. The file is damaged.");
  return aesEcbDecrypt(body);
}

class GvasReader {
  constructor(bytes) { this.b = bytes; this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.o = 0; }
  read(n) { const r = this.b.subarray(this.o, this.o + n); this.o += n; return r; }
  int() { const x = this.v.getInt32(this.o, true); this.o += 4; return x; }
  float() { const x = this.v.getFloat32(this.o, true); this.o += 4; return x; }
  double() { const x = this.v.getFloat64(this.o, true); this.o += 8; return x; }
  i64() { const x = this.v.getBigInt64(this.o, true); this.o += 8; return x; }
  byte() { return this.b[this.o++]; }
  string() {
    const n = this.int();
    if (!n) return "";
    if (n < 0) return new TextDecoder("utf-16le").decode(this.read(-n * 2).subarray(0, -2));
    return new TextDecoder().decode(this.read(n).subarray(0, -1));
  }
  type() { const name = this.string(); const n = this.int(); const sub = []; for (let i = 0; i < n; i++) sub.push(this.type()); return [name, sub]; }

  props() {
    const out = {};
    for (;;) {
      const name = this.string();
      if (name === "None") return out;
      const t = this.type(), size = this.int(), flags = this.byte();
      if (flags & 1) this.int();
      if (flags & 2) this.read(16);
      const end = this.o + size;
      let v;
      try { v = this.value(t, size, flags); } catch (e) { v = null; }
      this.o = end;
      out[name] = v;
    }
  }

  value([k, sub], size, flags) {
    switch (k) {
      case "IntProperty": return this.int();
      case "FloatProperty": return this.float();
      case "BoolProperty": return size === 0 ? !!(flags & 16) : !!this.byte();
      case "StrProperty": case "NameProperty": case "EnumProperty": return this.string();
      case "ByteProperty": return size === 1 ? this.byte() : this.string();
      case "ArrayProperty": { const n = this.int(), a = []; for (let i = 0; i < n; i++) a.push(this.value(sub[0], undefined, 0)); return a; }
      case "MapProperty": {
        const rm = this.int(); for (let i = 0; i < rm; i++) this.value(sub[0], undefined, 0);
        const n = this.int(), m = []; for (let i = 0; i < n; i++) m.push([this.value(sub[0], undefined, 0), this.value(sub[1], undefined, 0)]); return m;
      }
      case "StructProperty": {
        const st = sub[0] ? sub[0][0] : "";
        if (st === "DateTime") return Number(this.i64() / 10000n - 62135596800000n); // .NET ticks in local time, so display with timeZone UTC
        if (st === "Vector") return [this.double(), this.double(), this.double()];
        if (!(flags & 8)) return this.props();
      }
    }
    if (size === undefined) throw new Error("unknown property type " + k);
    this.read(size); return null;
  }
}

function parseGvas(plain) {
  const r = new GvasReader(plain);
  if (String.fromCharCode(...r.read(4)) !== "GVAS") throw new Error("Invalid save contents.");
  r.int(); r.int(); r.int(); r.read(10); r.string(); r.int();
  const n = r.int(); r.read(n * 20);
  if (r.string() !== "/Script/mucha.CPP_MuchaGameSaveData") throw new Error("Not a Final Fantasy Resonance save.");
  r.byte();
  return r.props();
}

const enumTail = s => (s || "").split("::").pop();

// Reduces the raw save to what the viewer needs. This summary is kept in localStorage.
function summarizeSave(d, fileName) {
  const p = d.Player || {};
  const items = {};
  const add = (id, n) => { if (id > 0) items[id] = (items[id] || 0) + n; };
  for (const x of d.inventory || []) add(x.ItemId, x.Num);
  const units = (d.unitParameterList || []).map(u => {
    add(u.EquipWeaponId, 1); add(u.EquipArmorId, 1);
    for (const a of u.EquipAccessoryIdList || []) add(a, 1);
    return { id: u.UnitId, join: enumTail(u.JoinStatus), exp: u.Experience, hp: u.HitPoint, mp: u.MagicPoint, vision: u.equipVisionId,
      weapon: u.EquipWeaponId, armor: u.EquipArmorId, acc: u.EquipAccessoryIdList || [], kills: u.defeatUnitNum };
  });
  const map = d.Map || {};
  // Chests and loose item spots (treasure entries with ID -1, including Tablet Shards) per area
  const chests = {}, shards = {};
  for (const [id, g] of map.mapGimmick || []) {
    const list = (g && g.treasureBox && g.treasureBox.treasureBoxList) || [];
    const box = list.filter(t => t.ID !== -1), sh = list.filter(t => t.ID === -1);
    if (box.length) chests[id] = { total: box.length, open: box.filter(t => t.IsOpen).length };
    if (sh.length) shards[id] = { total: sh.length, open: sh.filter(t => t.IsOpen).length };
  }
  const visited = (map.perMapSaveDataMap || []).filter(([, v]) => v && v.bIsVisited).map(([k]) => k);
  return {
    file: fileName, loaded: Date.now(), saved: p.SavedDateTime || null,
    playTime: p.PlayTime || 0, gil: p.currentMoney || 0, spent: p.spentMoney || 0, earned: p.earnedMoney || 0,
    staggers: p.breakCount || 0, resonances: p.finishblowCount || 0, wins: p.WinNum || 0, escapes: p.EscapeNum || 0,
    encounters: map.encountCount || 0, island: enumTail(map.lastIslandVisited), mapId: map.mapId,
    // Tablet Shards: carried in the inventory, or handed in at the Oblivion Palace (transfer inventory)
    shardsHeld: items[25004] || 0,
    shardsHanded: (((d.tranferTargetInventory || {}).inventory) || []).flatMap(([, m]) => (m.inventory || []).flatMap(([, x]) => x.inventoryList || []))
      .filter(x => x.ItemId === 25004).reduce((a, x) => a + x.Num, 0),
    party: (d.Party && d.Party.partyList) || [], units, items, chests, shards, visited,
    visions: (d.visionList || []).map(v => ({ id: v.ID, awk: v.awakeningPoint, mrp: Object.fromEntries(v.synchroPoints || []) })),
    requests: Object.fromEntries(((d.request && d.request.DataMap) || []).map(([k, v]) => [k, enumTail(v.State)])),
    board: (d.questBoardList || []).map(q => ({ id: q.QuestId, state: enumTail(q.State) })),
    colosseum: ((d.colosseumProgress && d.colosseumProgress.RankBattle) || []).map(([k, v]) => ({ key: k, status: enumTail(v.Status), clears: v.ClearCount })),
    // Story and quest counters (index 0 = main story, others = side quests, see data/quests.js)
    progress: (d.Progress && d.Progress.Progress) || [],
    // Bestiary: IDs of every enemy defeated at least once
    defeated: (d.unitList || []).filter(u => u.defeatNum > 0).map(u => u.SaveId),
  };
}

async function readSaveFile(file) {
  const plain = await decryptSave(await file.arrayBuffer());
  return summarizeSave(parseGvas(plain), file.name);
}
