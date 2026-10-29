import importlib.util
import os
import platform
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from .common import ROOT, write_json


def command(name, args):
    executable = shutil.which(name)
    if not executable:
        return {"status": "MISSING"}
    try:
        run = subprocess.run([executable, *args], capture_output=True, text=True, timeout=12)
        return {"status": "AVAILABLE" if run.returncode == 0 else "ERROR", "path": executable,
                "version": (run.stdout or run.stderr).strip().splitlines()[:3]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"status": "ERROR", "detail": str(error)}


def endpoint(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return {"status": "REACHABLE", "http_status": response.status}
    except Exception as error:
        return {"status": "NOT_REACHABLE", "detail": str(error)}


def doctor():
    roots = [ROOT, Path.home() / "Downloads", Path.home() / "Documents", Path.home() / "Desktop",
             Path.home() / "AppData/Local/Programs", Path("C:/AI"), Path("C:/ComfyUI")]
    candidates = []
    for root in roots:
        if root.is_dir():
            candidates.extend(str(p) for p in root.iterdir() if p.is_dir() and
                              any(word in p.name.lower() for word in ("comfy", "ace-step", "acestep")))
    data = {"python": {"version": sys.version, "executable": sys.executable}, "platform": platform.platform(),
            "tools": {name: command(name, args) for name, args in {
                "ffmpeg": ["-version"], "ffprobe": ["-version"], "node": ["--version"],
                "git": ["--version"], "py": ["-0p"],
                "nvidia-smi": ["--query-gpu=name,memory.total,driver_version", "--format=csv"]}.items()},
            "optional_python": {name: importlib.util.find_spec(name) is not None
                                for name in ("PIL", "pytest", "requests", "numpy", "librosa")},
            "services": {"comfyui": endpoint(os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188") + "/system_stats"),
                         "ace_step": endpoint(os.environ.get("ACE_STEP_URL", "http://127.0.0.1:8001"))},
            "installation_candidates": candidates, "search_scope": "Common local folders, PATH, configured/local API ports; not a full disk search",
            "large_models_installed_by_pipeline": False}
    write_json(ROOT / "reports/environment.json", data)
    lines = ["# 本機環境稽核", "", "由 `python -m pipeline doctor` 實測；原始規格的硬體描述不視為實測。", "",
             f"- 專案根目錄：`{ROOT}`", f"- Python：`{sys.executable}` / {platform.python_version()}",
             "- 基礎 pipeline 僅使用 Python 標準函式庫；不需要安裝 AI 模型。", ""]
    for name, item in data["tools"].items():
        versions = [line for line in item.get('version', []) if not line.startswith('configuration:')]
        lines.append(f"- {name}: {item['status']} — {'; '.join(versions)}")
    lines += ["", "## 生成服務", "", *[f"- {k}: {v['status']}" for k, v in data["services"].items()],
              f"- 找到的安裝候選：{candidates or '無'}", "- 未連線不代表整台電腦沒有安裝；只檢查上述範圍及預設/設定的埠。",
              "- Qwen/llama.cpp、Pi Agent 預設不使用。", "- 詳細結果：`reports/environment.json`。"]
    (ROOT / "docs/ENV_AUDIT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return data
