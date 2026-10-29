import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if Path(temporary).exists():
            Path(temporary).unlink()


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def config():
    value = read_json(ROOT / "config/project.json")
    if value["target"] != "city_painting" or value["engine"] != "8th Wall":
        raise ValueError("Engine and city_painting target are immutable")
    if value["duration_seconds"] != 15:
        raise ValueError("duration_seconds must be 15")
    cursor = 0
    for segment in value["timeline"]:
        if segment["from"] != cursor or segment["to"] <= cursor:
            raise ValueError("Timeline must be contiguous and increasing")
        cursor = segment["to"]
    if cursor != 15 or value["bpm"] <= 0:
        raise ValueError("Timeline must cover 0..15 and BPM must be positive")
    return value


def probe(path):
    tool = shutil.which("ffprobe")
    if not tool:
        raise RuntimeError("FFprobe missing; add existing installation to PATH")
    result = subprocess.run([tool, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
                            check=True, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout)


def safe_output(path):
    resolved = Path(path).resolve()
    allowed = (ROOT / "generated").resolve()
    if not resolved.is_relative_to(allowed):
        raise ValueError("Provider output must remain within generated/")
    return resolved
