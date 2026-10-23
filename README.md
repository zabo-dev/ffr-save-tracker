# Resonance Codex

**Resonance Codex** is a browser-based save viewer and completion tracker for **Final Fantasy Resonance** (PC/Steam). Load your save file to see your party, Visions, Espers, gear, chests, side quests and achievements at a glance, plus a chapter-by-chapter story progression with bosses, weaknesses and collectibles.

Available in **English** and **German**. Both languages use the official in-game names.

## Features

- **Save summary:** play time, gil, location, active party, staggers, Resonances, Tablet Shards and overall completion.
- **Everything on one page:** the overview shows every category in collapsible sections, with a jump bar and progress counters.
- **Automatic tracking from the save:**
  - side quests and substories, including the current stage
  - Visions, telling obtained apart from only discovered
  - Cave Masters, bosses and Esper fights from the bestiary
  - Colosseum battles
  - Tablet Shards collected per area and handed in
  - gear and Legendary Arms
  - chapter progress
  - every achievement that can be derived from these
- **Where to get it:** hover any Vision, Esper, item or collectible to see where it's found: chest, shop, side quest reward or pre-order bonus.
- **100 % focus:** entries that count toward achievements are marked and name the exact achievements. A filter hides everything optional.
- **Story progression:** areas in order with recommended levels, new party members, bosses with element weaknesses, collectibles and side quests per chapter.
- **Live mode (optional):** a small local helper lets the page refresh automatically whenever you save in game.
- **Private by design:** the save file is decrypted and parsed entirely in your browser. Nothing is uploaded.

## Usage

### Online

Open the hosted site, click **Load save** and choose your save file:

```
%LOCALAPPDATA%\FFRS\Steam\<Steam ID>\GameSaveData0.sav
```

`GameSaveData0.sav` is slot 1, `GameSaveData1.sav` slot 2, and so on. Load the file again after saving in game, or use live mode.

### Locally

Clone the repository and open `index.html`. There is no build step and there are no dependencies.

### Live mode

Browsers can't watch files inside `%LOCALAPPDATA%`, so a small helper serves your newest save locally:

```
python tools/live.py
```

Then click **Enable live mode** below the upload area. The helper listens only on `127.0.0.1:8765`, only reads the save folder, and runs on Windows or inside WSL.

## Game graphics (optional)

Without game graphics the viewer shows placeholders. To use the original logo, world map, portraits, Vision and Esper sprites and icons, extract them from your own installation. This needs the [.NET 10 SDK](https://dotnet.microsoft.com/download):

```
dotnet run --project tools/extractor -c Release -- "X:\SteamLibrary\steamapps\common\FINAL FANTASY RESONANCE\FFRS\Content\Paks" "%TEMP%\ffr-extract"
python tools/import_icons.py "%TEMP%\ffr-extract"
```

The extractor uses [CUE4Parse](https://github.com/FabianFG/CUE4Parse) to unpack the game's IoStore containers and downloads the Oodle library on first run. The game ships without type mappings (`.usmap`), so texture pixel data is read directly from the package layout. The graphics are written to `icons/`, which is git-ignored.

## Updating game data

Item, Vision, Esper and achievement names, place, boss, quest and skill names, and the side quest table come from the game files. After a game update, regenerate them:

```
dotnet run --project tools/extractor -c Release -- "<Paks folder>" "%TEMP%\ffr-data" --raw .locres Datatable/Request/
python tools/locres.py names "%TEMP%\ffr-data"
python tools/quests.py "%TEMP%\ffr-data"
```

## Deployment

The site is static. On [Vercel](https://vercel.com), import the repository with the framework preset **Other**, no build command, and the project root as the output directory. `vercel.json` sets security headers and caching. GitHub Pages and other static hosts work as well.

## Project structure

| Path | Purpose |
|---|---|
| `index.html` | Page shell |
| `js/save.js` | Save decryption, GVAS parser, save summary |
| `js/app.js` | Views, automatic tracking, tooltips, live mode |
| `js/i18n.js` | UI texts (EN/DE) and name localization |
| `css/theme.css` | Styling in the style of the classic Final Fantasy menu windows |
| `data/story.*.js` | Story progression per language |
| `data/names.js` | Official in-game names EN/DE (generated) |
| `data/quests.js` | Side quest counters and stages (generated) |
| `data/catalog.js` | Character, Vision and item IDs |
| `data/areas.js` | Map IDs, area names, chest and Tablet Shard locations |
| `tools/extractor/` | Texture and raw file exporter (C#, CUE4Parse) |
| `tools/import_icons.py` | Copies the graphics the viewer uses into `icons/` |
| `tools/locres.py` | Reads the game's text tables and writes `data/names.js` |
| `tools/quests.py` | Reads the side quest table and writes `data/quests.js` |
| `tools/live.py` | Local helper for live mode |
| `tools/ffrs_save.py` | Dumps a save as JSON for inspection |

## Save format

`GameSaveDataN.sav` consists of a 32-byte header (`SVHD`, container version, SHA-1 of the payload, zero padding), followed by an AES-256-ECB encrypted Unreal Engine 5 GVAS save (`/Script/mucha.CPP_MuchaGameSaveData`). The format is documented by the [atma.gg save editor](https://atma.gg/final-fantasy-resonance/save-editor). This viewer only reads saves and never modifies them.

## Contributing

Area names and chest contents are known for the early chapters. Unknown map IDs appear as "Area &lt;ID&gt;". Additions to `data/areas.js` are welcome.

## Credits

- Save format and ID mapping: [atma.gg save editor](https://atma.gg/final-fantasy-resonance/save-editor)
- Chest contents: [meowdb](https://meowdb.com/db/final-fantasy-resonance/areas)
- Story progression compiled from [RPG Site](https://www.rpgsite.net/guide/21486-final-fantasy-resonance-walkthrough-100-items-all-achievements-tablet-shards-step-by-step-guide), [PowerPyx](https://www.powerpyx.com/final-fantasy-resonance-all-collectible-locations-guide) and [ffresonance.wiki](https://ffresonance.wiki/database/equipment/)
- Asset extraction: [CUE4Parse](https://github.com/FabianFG/CUE4Parse)

## Disclaimer

This is a fan project and is not affiliated with or endorsed by Square Enix. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd. No game assets are included in this repository.

## License

[MIT](LICENSE)
