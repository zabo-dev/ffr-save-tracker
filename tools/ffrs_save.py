"""Dump a Final Fantasy Resonance save as JSON (read-only).

Usage: python tools/ffrs_save.py <GameSaveDataN.sav> <out.json>
Requires: pip install cryptography
"""
import hashlib, json, struct, sys
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

KEY = b"wwrqPkdwzPvgfchQ8kTYHVbn4umTf3d7"


def decrypt(raw):
    if raw[:4] != b"SVHD":
        raise ValueError("not an FFRS save")
    body = raw[32:]
    if hashlib.sha1(body).digest() != raw[8:28]:
        raise ValueError("checksum mismatch")
    return Cipher(algorithms.AES(KEY), modes.ECB()).decryptor().update(body)


class R:
    def __init__(s, b):
        s.b, s.o = b, 0

    def read(s, n):
        v = s.b[s.o:s.o + n]; s.o += n; return v

    def int(s): return struct.unpack("<i", s.read(4))[0]
    def float(s): return struct.unpack("<f", s.read(4))[0]
    def double(s): return struct.unpack("<d", s.read(8))[0]
    def byte(s): return s.read(1)[0]

    def string(s):
        n = s.int()
        if not n:
            return ""
        if n < 0:
            return s.read(-n * 2)[:-2].decode("utf-16le")
        return s.read(n)[:-1].decode("utf-8")

    def type(s):
        name = s.string()
        return [name, [s.type() for _ in range(s.int())]]


def props(r):
    out = {}
    while True:
        name = r.string()
        if name == "None":
            return out
        t = r.type(); size = r.int(); flags = r.byte()
        if flags & 1: r.int()
        if flags & 2: r.read(16)
        end = r.o + size
        try:
            v = val(r, t, size, flags)
        except Exception:
            r.o = end - size; v = {"$raw": r.read(size).hex()}
        if r.o != end:
            r.o = end
        out[name] = v


def val(r, t, size, flags):
    k, sub = t
    if k == "IntProperty": return r.int()
    if k == "FloatProperty": return r.float()
    if k == "BoolProperty": return bool(flags & 16) if size == 0 else bool(r.byte())
    if k in ("StrProperty", "NameProperty", "EnumProperty"): return r.string()
    if k == "ByteProperty": return r.byte() if size == 1 else r.string()
    if k == "ArrayProperty": return [val(r, sub[0], None, 0) for _ in range(r.int())]
    if k == "MapProperty":
        [val(r, sub[0], None, 0) for _ in range(r.int())]
        return [[val(r, sub[0], None, 0), val(r, sub[1], None, 0)] for _ in range(r.int())]
    if k == "StructProperty":
        st = sub[0][0] if sub else ""
        if st == "DateTime": return struct.unpack("<q", r.read(8))[0]
        if st == "Vector": return [r.double(), r.double(), r.double()]
        if not flags & 8: return props(r)
    if size is None:
        raise ValueError("unsized " + k)
    return {"$raw": r.read(size).hex()}


def parse(p):
    r = R(p)
    assert r.read(4) == b"GVAS"
    r.int(); r.int(); r.int(); r.read(10); r.string(); r.int()
    n = r.int(); r.read(n * 20)
    cls = r.string(); r.byte()
    assert cls == "/Script/mucha.CPP_MuchaGameSaveData", cls
    return props(r)


if __name__ == "__main__":
    data = parse(decrypt(open(sys.argv[1], "rb").read()))
    json.dump(data, open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
    print({k: type(v).__name__ for k, v in data.items()})
