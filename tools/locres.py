"""Read Unreal .locres files (game texts) and write data/names.js with the official names per language.

Usage:
  python tools/locres.py dump <Game.locres>                  # every entry as "Namespace/Key<TAB>Text"
  python tools/locres.py names <export folder> [out=data/names.js]

<export folder> is where the extractor wrote its --raw .locres export; it must contain
FFRS/Content/Localization/Game/<lang>/Game.locres for en and de.
"""
import json
import re
import struct
import sys
from pathlib import Path

# Units whose names the viewer needs: party (1001–1008), Espers (10451–10459), Visions (13xxx)
WANTED_UNITS = {str(i) for i in [*range(1001, 1009), *range(10451, 10460), *range(13000, 13200)]}
MAGIC = bytes.fromhex("0E147475674A03FC4A15909DC3377F1B")


def read_locres(path):
    d = Path(path).read_bytes()
    o = 0

    def u32():
        nonlocal o
        v = struct.unpack_from("<I", d, o)[0]; o += 4; return v

    def i32():
        nonlocal o
        v = struct.unpack_from("<i", d, o)[0]; o += 4; return v

    def fstr():
        nonlocal o
        n = i32()
        if n == 0:
            return ""
        if n < 0:
            s = d[o:o - 2 * n].decode("utf-16le")[:-1]; o += -2 * n
        else:
            s = d[o:o + n].decode("utf-8", "replace")[:-1]; o += n
        return s

    version = 0
    if d[:16] == MAGIC:
        version = d[16]; o = 17
    strings = None
    if version >= 1:
        table_off = struct.unpack_from("<q", d, o)[0]; o += 8
        save = o
        o = table_off
        strings = []
        for _ in range(i32()):
            s = fstr()
            if version >= 2:
                i32()  # reference count
            strings.append(s)
        o = save
    if version >= 2:
        u32()  # entry count
    out = {}
    for _ in range(u32()):
        if version >= 2:
            u32()
        ns = fstr()
        for _ in range(u32()):
            if version >= 2:
                u32()
            key = fstr()
            u32()  # source string hash
            out[(ns, key)] = strings[i32()] if strings is not None else fstr()
    return out


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    if sys.argv[1] == "dump":
        for (ns, k), v in read_locres(sys.argv[2]).items():
            print(f"{ns}/{k}\t{v}")
        return
    root = Path(sys.argv[2]) / "FFRS/Content/Localization/Game"
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).resolve().parent.parent / "data/names.js"
    loc = {lang: read_locres(root / lang / "Game.locres") for lang in ("en", "de")}
    # Names by game ID: items (equipment, consumables and key items share one ID space), Visions, units, trophies
    id_rules = [("item", "ST_EquipmentName", "EquipmentName"), ("item", "ST_ConsumablesName", "ConsumablesName"),
                ("item", "ST_ValuableName", "ValuableName"), ("vis", "ST_VisionName", "VisionName"),
                ("unit", "ST_UnitName", "UnitName"), ("trophy", "ST_TrophyName", "TrophyName_"),
                ("trophysum", "ST_TrophySummary", "TrophySummary_")]
    ids = {"en": {}, "de": {}}
    for lang in ids:
        for (ns, key), text in loc[lang].items():
            for prefix, rns, rkey in id_rules:
                if ns == rns and key.startswith(rkey):
                    n = key[len(rkey):].lstrip("0") or "0"
                    if n.isdigit() and (prefix != "unit" or n in WANTED_UNITS) and not re.search(r"[\u3040-\u9fff]", text):
                        ids[lang][f"{prefix}:{n}"] = text.strip()
    # English game name -> German game name, for names inside running text
    # Order = priority: a Vision/unit/item name beats a skill with the same name (e.g. Vision "Lightning" vs. skill "Lightning")
    phrase_ns = ["ST_VisionName", "ST_UnitName", "ST_CharaName", "ST_EquipmentName", "ST_ConsumablesName", "ST_ValuableName",
                 "ST_MAP_NAME", "ST_Colosseum_MapName", "ST_EventQuestTitle", "ST_QuestBoardTitle", "ST_TrophyName",
                 "ST_UI_Shop_Word", "ST_UI_Unit", "ST_CommandSkillName", "ST_PassiveSkillName", "ST_SkillName"]
    cjk = re.compile(r"[\u3040-\u9fff\uac00-\ud7af]")  # untranslated placeholders
    phrases = {}
    for ns in phrase_ns:
        for key, e in loc["en"].items():
            g = loc["de"].get(key)
            if key[0] != ns or not g:
                continue
            e, g = e.strip().replace("\u2019", "'"), g.strip()
            if len(e) < 4 or len(e) > 48 or re.search(r"[{<\n]", e) or e in phrases or cjk.search(g):
                continue
            phrases[e] = g  # keep identical names too so they keep priority
    phrases = {e: g for e, g in phrases.items() if e != g}
    # English unit name -> bestiary IDs in the save (bosses, Cave Masters, Esper fights)
    units = {}
    for (ns, key), text in loc["en"].items():
        if ns == "ST_UnitName" and key.startswith("UnitName") and key[8:].isdigit():
            units.setdefault(text.strip().replace("\u2019", "'"), []).append(int(key[8:]))
    # Quest titles by ID (EventQuestTitle_NNN), matching data/quests.js
    for lang in ids:
        for (ns, key), text in loc[lang].items():
            if ns == "ST_EventQuestTitle" and key.startswith("EventQuestTitle_") and not re.search(r"[\u3040-\u9fff]", text):
                ids[lang]["quest:" + str(int(key[16:]))] = text.strip()
    out.write_text("// Official in-game names from Game.locres (generated by tools/locres.py). Do not edit by hand.\n"
                   "const NAMES=" + json.dumps({"ids": ids, "phrases": dict(sorted(phrases.items())), "units": units}, ensure_ascii=False, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"{len(ids['en'])} IDs, {len(phrases)} names -> {out}")

if __name__ == "__main__":
    main()
