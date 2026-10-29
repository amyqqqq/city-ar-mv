"""Inventory/extract user-owned export; never write into either original directory."""
import json
import re
import stat
import zipfile
from pathlib import Path
from .common import ROOT, digest, write_json, read_json, probe

BASELINE = ROOT / "tests/fixtures/original_export"
LOCK = ROOT / "config/original-lock.json"


def protected_files():
    return sorted(p for folder in ("original_export", "source_original")
                  for p in (ROOT / folder).rglob("*") if p.is_file())


def verify_originals():
    expected = read_json(LOCK)["protected"]
    actual = {p.relative_to(ROOT).as_posix(): digest(p) for p in protected_files()}
    if actual != expected:
        raise ValueError("Original backup/source integrity mismatch")
    return True


def extract():
    if LOCK.exists():
        verify_originals()
    else:
        write_json(LOCK, {"protected": {p.relative_to(ROOT).as_posix(): digest(p) for p in protected_files()}})
    archive = next((ROOT / "original_export").glob("*.zip"))
    files = []
    BASELINE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        for item in source.infolist():
            if item.is_dir():
                continue
            target = (BASELINE / item.filename).resolve()
            if not target.is_relative_to(BASELINE.resolve()):
                raise ValueError("Unsafe ZIP path")
            payload = source.read(item)
            if target.exists():
                if target.read_bytes() != payload:
                    raise ValueError(f"Baseline changed: {item.filename}")
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
            target.chmod(stat.S_IREAD)
            files.append({"path": item.filename, "size": item.file_size, "sha256": digest(target)})
    bundle = (BASELINE / "bundle.js").read_text(encoding="utf-8")
    match = re.search(r"const d=JSON.parse\('((?:\\.|[^'\\])*)'\)", bundle)
    if not match:
        raise ValueError("Export scene not recognized; do not modify compiled bundle")
    # This export's JSON string only adds a JavaScript escaped apostrophe.
    scene = json.loads(match[1].replace("\\'", "'"))
    write_json(ROOT / "reports/original-scene.json", scene)
    audio = {p.name: probe(p) for p in (BASELINE / "assets").glob("*.mp3")}
    write_json(ROOT / "reports/baseline-inventory.json", {"files": files, "audio": audio,
               "events": ["REALITY_IMAGE_FOUND", "REALITY_IMAGE_LOST", "SCREEN_TOUCH_START"],
               "target": read_json(BASELINE / "image-targets/city_painting.json")})
    inventory = ["# 原始 ZIP 檔案盤點", "", "由 `python -m pipeline baseline` 自動產生；只讀取原始 ZIP。", "",
                 "| 路徑 | Bytes | SHA-256 |", "| --- | ---: | --- |"]
    inventory.extend(f"| `{item['path']}` | {item['size']} | `{item['sha256']}` |" for item in files)
    (ROOT / "docs/INVENTORY.md").write_text("\n".join(inventory) + "\n", encoding="utf-8")
    verify_originals()
    return {"status": "BASELINE_VERIFIED", "files": len(files), "directory": str(BASELINE)}
