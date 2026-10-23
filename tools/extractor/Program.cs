// Exports textures (and raw files) from your own Final Fantasy Resonance installation.
// CUE4Parse (the library behind FModel) unpacks the IoStore containers and handles Oodle.
// The game stores properties without type information (unversioned), so without .usmap mappings CUE4Parse
// cannot deserialize textures. The pixel data follows the properties in a fixed layout, though:
// SizeX, SizeY, flags, FString "PF_…", FirstMip, NumMips, mip data, SizeX/SizeY/SizeZ. This tool reads that directly.
//
// Usage: extractor <Paks folder> <output folder> [path prefix ...]   (default: FFRS/Content/UI/Textures)
//        extractor <Paks folder> <output folder> --raw <substring ...>   (files as-is, e.g. .locres)
using System.Text;
using AssetRipper.TextureDecoder.Bc;
using AssetRipper.TextureDecoder.Rgb.Formats;
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;
using SkiaSharp;

if (args.Length < 2)
{
    Console.WriteLine("Usage: extractor <Paks folder> <output folder> [path prefix ...] | --raw <substring ...>");
    return 1;
}
var paks = args[0];
var outDir = args[1];
var prefixes = args.Length > 2 ? args[2..] : ["FFRS/Content/UI/Textures"];

// Oodle is downloaded once (like FModel does) and stored next to the program
var oodlePath = Path.Combine(AppContext.BaseDirectory, OodleHelper.OodleFileName);
if (!File.Exists(oodlePath) && !OodleHelper.DownloadOodleDll(ref oodlePath)) throw new Exception("Could not load Oodle");
OodleHelper.Initialize(oodlePath);

var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_UE5_6));
provider.Initialize();
provider.Mount();

// --raw: export files unchanged (e.g. Localization/*.locres for the game names)
if (prefixes.Length > 0 && prefixes[0] == "--raw")
{
    var pats = prefixes[1..];
    int n = 0;
    foreach (var (path, file) in provider.Files.Where(kv => pats.Any(p => kv.Key.Contains(p, StringComparison.OrdinalIgnoreCase))))
    {
        var target = Path.Combine(outDir, path.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllBytes(target, file.Read());
        n++;
    }
    Console.WriteLine($"{n} files exported -> {outDir}");
    return 0;
}

var files = provider.Files
    .Where(kv => kv.Key.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase) && prefixes.Any(p => kv.Key.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
    .OrderBy(kv => kv.Key).ToList();
Console.WriteLine($"{files.Count} packages found");

int ok = 0, skipped = 0;
var unsupported = new SortedDictionary<string, int>();
foreach (var (path, file) in files)
{
    var data = file.Read();
    var tex = FindTexture(data);
    if (tex == null) { skipped++; continue; } // materials, widgets, etc.
    var (w, h, format, offset) = tex.Value;
    var bgra = DecodeToBgra(data, offset, w, h, format);
    if (bgra == null) { unsupported[format] = unsupported.GetValueOrDefault(format) + 1; continue; }
    var target = Path.Combine(outDir, Path.ChangeExtension(path, ".png").Replace('/', Path.DirectorySeparatorChar));
    Directory.CreateDirectory(Path.GetDirectoryName(target)!);
    using var bmp = new SKBitmap(new SKImageInfo(w, h, SKColorType.Bgra8888, SKAlphaType.Unpremul));
    System.Runtime.InteropServices.Marshal.Copy(bgra, 0, bmp.GetPixels(), bgra.Length);
    using var png = bmp.Encode(SKEncodedImageFormat.Png, 100);
    File.WriteAllBytes(target, png.ToArray());
    ok++;
}
Console.WriteLine($"{ok} textures exported, {skipped} packages without texture -> {outDir}");
foreach (var (f, n) in unsupported) Console.WriteLine($"Unsupported format {f}: {n}");
return 0;

// Finds the pixel format FString and the first (largest) mip. Returns size, format and offset of the pixel data.
static (int w, int h, string format, int offset)? FindTexture(byte[] d)
{
    var marker = "PF_"u8.ToArray();
    for (int i = 16; i < d.Length - 32; i++)
    {
        if (d[i] != marker[0] || d[i + 1] != marker[1] || d[i + 2] != marker[2]) continue;
        int len = BitConverter.ToInt32(d, i - 4);
        if (len < 5 || len > 32 || i + len > d.Length || d[i + len - 1] != 0) continue;
        var format = Encoding.ASCII.GetString(d, i, len - 1);
        int w = BitConverter.ToInt32(d, i - 16), h = BitConverter.ToInt32(d, i - 12);
        if (w <= 0 || h <= 0 || w > 8192 || h > 8192) continue;
        int size = MipSize(format, w, h);
        if (size <= 0) return (w, h, format, -1);
        // SizeX, SizeY, SizeZ = 1 follow the mip data; the header before it is a few bytes long
        int end = i + len;
        for (int o = end; o < end + 96 && o + size + 12 <= d.Length; o++)
            if (BitConverter.ToInt32(d, o + size) == w && BitConverter.ToInt32(d, o + size + 4) == h && BitConverter.ToInt32(d, o + size + 8) == 1)
                return (w, h, format, o);
        return (w, h, format, -1); // mip is not inside the package (streamed texture)
    }
    return null;
}

static int MipSize(string f, int w, int h)
{
    int bw = (w + 3) / 4, bh = (h + 3) / 4;
    return f switch
    {
        "PF_B8G8R8A8" or "PF_R8G8B8A8" => w * h * 4,
        "PF_G8" => w * h,
        "PF_DXT1" or "PF_BC4" => bw * bh * 8,
        "PF_DXT5" or "PF_BC5" or "PF_BC7" => bw * bh * 16,
        _ => -1,
    };
}

static byte[]? DecodeToBgra(byte[] d, int offset, int w, int h, string f)
{
    if (offset < 0) return null;
    var src = new ReadOnlySpan<byte>(d, offset, MipSize(f, w, h));
    byte[] outp;
    switch (f)
    {
        case "PF_B8G8R8A8": return src.ToArray();
        case "PF_R8G8B8A8":
            outp = src.ToArray();
            for (int i = 0; i < outp.Length; i += 4) (outp[i], outp[i + 2]) = (outp[i + 2], outp[i]);
            return outp;
        case "PF_G8":
            outp = new byte[w * h * 4];
            for (int i = 0; i < w * h; i++) { outp[i * 4] = outp[i * 4 + 1] = outp[i * 4 + 2] = src[i]; outp[i * 4 + 3] = 255; }
            return outp;
        case "PF_DXT1": Bc1.Decompress<ColorBGRA<byte>, byte>(src, w, h, out outp); return outp;
        case "PF_DXT5": Bc3.Decompress<ColorBGRA<byte>, byte>(src, w, h, out outp); return outp;
        case "PF_BC4": Bc4.Decompress<ColorBGRA<byte>, byte>(src, w, h, out outp); return outp;
        case "PF_BC5": Bc5.Decompress<ColorBGRA<byte>, byte>(src, w, h, out outp); return outp;
        case "PF_BC7": Bc7.Decompress<ColorBGRA<byte>, byte>(src, w, h, out outp); return outp;
    }
    return null;
}
