"""Live mode: serve the newest Final Fantasy Resonance save locally so the viewer refreshes after every in-game save.

Browsers cannot watch files in %LOCALAPPDATA%, so this script reads them and serves them on
http://127.0.0.1:8765 (local only, read-only):
  /info        {"name": "GameSaveData0.sav", "mtime": ...}  (newest GameSaveDataN.sav)
  /latest.sav  the file itself

Usage: python tools/live.py [save folder]
Without an argument it looks in %LOCALAPPDATA%\\FFRS\\Steam\\<Steam ID> (under WSL: /mnt/c/Users/*/AppData/Local/FFRS/Steam/*).
"""
import glob
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8765


def find_dir():
    if len(sys.argv) > 1:
        return sys.argv[1]
    bases = []
    if os.environ.get("LOCALAPPDATA"):
        bases.append(os.path.join(os.environ["LOCALAPPDATA"], "FFRS", "Steam", "*"))
    bases.append("/mnt/c/Users/*/AppData/Local/FFRS/Steam/*")
    for pattern in bases:
        dirs = [d for d in glob.glob(pattern) if glob.glob(os.path.join(d, "GameSaveData*.sav"))]
        if dirs:
            return max(dirs, key=os.path.getmtime)
    sys.exit("No save folder found. Pass the path as an argument.")


SAVE_DIR = find_dir()


def latest():
    files = glob.glob(os.path.join(SAVE_DIR, "GameSaveData*.sav"))
    return max(files, key=os.path.getmtime) if files else None


class Handler(BaseHTTPRequestHandler):
    def headers_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self):
        self.send_response(204)
        self.headers_cors()
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.end_headers()

    def do_GET(self):
        path = latest()
        if not path:
            self.send_response(404); self.headers_cors(); self.end_headers(); return
        if self.path.startswith("/info"):
            body = json.dumps({"name": os.path.basename(path), "mtime": os.path.getmtime(path)}).encode()
            ctype = "application/json"
        elif self.path.startswith("/latest.sav"):
            with open(path, "rb") as f:
                body = f.read()
            ctype = "application/octet-stream"
        else:
            self.send_response(404); self.headers_cors(); self.end_headers(); return
        self.send_response(200)
        self.headers_cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Live mode: {SAVE_DIR} -> http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
