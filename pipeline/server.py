from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
from .common import ROOT
from .baseline import BASELINE


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        url = unquote(urlsplit(path).path)
        if url == "/original" or url.startswith("/original/"):
            relative = url.removeprefix("/original").lstrip("/") or "index.html"
            target = (BASELINE / relative).resolve()
            if target.is_relative_to(BASELINE.resolve()):
                return str(target)
            return str(ROOT / "dist/__not_found__")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(port=8080, host="127.0.0.1"):
    if not (ROOT / "dist/index.html").exists():
        raise ValueError("Run compose first")
    print(f"Preview: http://{host}:{port}/ ; AR: /ar.html ; baseline: /original/", flush=True)
    print("Phone camera requires trusted HTTPS; LAN HTTP is not sufficient.", flush=True)
    ThreadingHTTPServer((host, port), partial(Handler, directory=str(ROOT / "dist"))).serve_forever()
