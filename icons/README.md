# icons

Local game graphics (logo, world map background, portraits, Vision and Esper sprites, item, element and map icons).
They belong to Square Enix and are not part of this repository. Without them the viewer shows placeholders.

Extract them from your own copy of the game:

```
dotnet run --project tools/extractor -c Release -- "<...>\FINAL FANTASY RESONANCE\FFRS\Content\Paks" "%TEMP%\ffr-extract"
python tools/import_icons.py "%TEMP%\ffr-extract"
```

`import_icons.py` copies the files the viewer uses into this folder and writes `manifest.js`.
