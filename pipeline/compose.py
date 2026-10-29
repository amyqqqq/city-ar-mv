import copy
import shutil
import stat
import subprocess
import wave
from pathlib import Path
from .baseline import BASELINE, extract, verify_originals
from .common import ROOT, config, digest, probe, read_json, write_json


def copy_vendor_tree(source, destination):
    """Do not propagate baseline read-only attributes into rebuild outputs."""
    for path in source.rglob('*'):
        if path.is_file():
            target = destination / path.relative_to(source)
            if target.exists() and digest(target) == digest(path):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                target.chmod(stat.S_IWRITE | stat.S_IREAD)
            shutil.copyfile(path, target)


def analyze_audio(path):
    """Basic RMS positive flux, not a claim of beat/tempo estimation."""
    from array import array
    with wave.open(str(path)) as stream:
        rate = stream.getframerate()
        samples = array("h", stream.readframes(stream.getnframes()))
    window = max(1, int(rate * 0.02))
    rms = [(sum(x*x for x in samples[i:i+window]) / max(1, len(samples[i:i+window])))**0.5 / 32768
           for i in range(0, len(samples), window)]
    flux = [max(0, b-a) for a, b in zip([0, *rms[:-1]], rms)]
    threshold = max(0.015, sum(flux) / max(1, len(flux)) * 3)
    onsets = []
    for i, value in enumerate(flux):
        timestamp = round(i * window / rate, 3)
        if value > threshold and (not onsets or timestamp - onsets[-1] >= .12):
            onsets.append(timestamp)
    return {"method": "20ms mono RMS positive flux; no tempo inference", "onsets": onsets,
            "rms": [round(v, 5) for v in rms], "window_seconds": window / rate}


def selected(kind):
    selection = ROOT / f"generated/selections/{kind}.json"
    if not selection.exists():
        raise ValueError(f"No {kind} selection. Import with generate --kind {kind} --source ... --license ...")
    metadata = read_json(ROOT / read_json(selection)["metadata"])
    path = (ROOT / metadata["output"]).resolve()
    if not path.is_relative_to((ROOT / "generated").resolve()) or not path.is_file():
        raise ValueError("Invalid imported output path")
    if digest(path) != metadata["sha256"] or not metadata["license"]:
        raise ValueError("Import hash/license validation failed")
    return path, metadata


def image_info(path):
    stream = probe(path)["streams"][0]
    pixel_format = stream.get("pix_fmt", "")
    alpha = pixel_format in ("rgba", "bgra", "argb", "abgr", "ya8") or pixel_format.startswith(("yuva", "gbrap"))
    result = {"width": stream["width"], "height": stream["height"], "pixel_format": pixel_format, "has_alpha": alpha}
    if alpha:
        run = subprocess.run([shutil.which("ffmpeg"), "-v", "error", "-i", str(path), "-vf", "alphaextract",
                              "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
                             check=True, capture_output=True, timeout=30)
        result["alpha_range"] = [min(run.stdout), max(run.stdout)]
        result["transparent_pixels"] = run.stdout.count(0)
    return result


def compose(mode=None, dry_run=False):
    settings = config()
    mode = mode or settings.get("asset_mode", "original")
    if mode not in ("original", "generated"):
        raise ValueError("Invalid asset mode")
    if dry_run:
        return {"status": "PLANNED", "mode": mode, "duration": 15, "network_calls": 0,
                "operations": ["verify backup", "load selected assets", "FFmpeg audio 15s", "RMS analysis", "manifest", "build web/AR"]}
    extract()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg missing; compose cannot produce real audio")
    dist = ROOT / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    metadata = {}
    if mode == "original":
        inputs = {"backgrounds": BASELINE / "assets/night_city.png", "characters": BASELINE / "assets/character.png",
                  "music": BASELINE / "assets/city_ambient.mp3"}
        metadata = {kind: {"source": p.relative_to(ROOT).as_posix(), "sha256": digest(p),
                          "license": "User-provided original export; rights unverified; local regression only", "ai_generated": False}
                    for kind, p in inputs.items()}
    else:
        from .jobs import generate
        for kind, item in settings.get("asset_imports", {}).items():
            result = generate(kind, source=ROOT / item["source"], license=item["license"], prompt=item.get("description"))
            if result["status"] not in ("IMPORTED", "CACHED"):
                raise ValueError(f"Configured {kind} import failed: {result.get('error', result['status'])}")
        pairs = {kind: selected(kind) for kind in ("backgrounds", "characters", "music")}
        inputs = {kind: pair[0] for kind, pair in pairs.items()}
        metadata = {kind: pair[1] for kind, pair in pairs.items()}
    urls = {}
    image_metadata = {}
    for kind in ("backgrounds", "characters"):
        source = inputs[kind]
        if source.suffix.lower() not in (".png", ".webp", ".jpg", ".jpeg"):
            raise ValueError("Phase 2 static fallback requires PNG/WebP/JPEG image layers")
        target = assets / (kind + source.suffix.lower())
        shutil.copyfile(source, target)
        urls[kind] = "assets/" + target.name
        image_metadata[kind] = image_info(target)
    layout = copy.deepcopy(settings.get("layout", {})) if mode == "generated" else {}
    if layout:
        for kind, name in (("backgrounds", "background"), ("characters", "character")):
            info = image_metadata[kind]
            layout[name]["height"] = layout[name]["width"] * info["height"] / info["width"]
    wav = ROOT / "generated/audio/trap_15s.wav"
    wav.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg, "-nostdin", "-y", "-v", "error", "-i", str(inputs["music"]),
                    "-af", "apad,atrim=duration=15,afade=t=out:st=14.75:d=0.25", "-t", "15", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True, timeout=120)
    audio = assets / "trap_15s.m4a"
    reference = settings.get("audio_reference", {})
    music_hash = metadata["music"].get("source_sha256", metadata["music"].get("sha256"))
    if reference and music_hash == reference["source_sha256"]:
        approved = ROOT / reference["path"]
        if digest(approved) != reference["encoded_sha256"]:
            raise ValueError("Approved audio integrity mismatch")
        shutil.copyfile(approved, audio)
    else:
        subprocess.run([ffmpeg, "-nostdin", "-y", "-v", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(audio)], check=True, timeout=120)
    analysis = analyze_audio(wav)
    write_json(ROOT / "generated/audio/analysis.json", analysis)
    write_json(wav.with_suffix(".wav.metadata.json"), {"mode": mode, "source": metadata["music"],
               "sha256": digest(wav), "process": "trim/pad to 15s, fade last .25s; no AI generation"})
    scene = copy.deepcopy(read_json(ROOT / "reports/original-scene.json"))
    objects = scene["objects"]
    target = next(o for o in objects.values() if o.get("imageTarget", {}).get("name") == settings["target"])
    city = next(o for o in objects.values() if o["name"].startswith("NightCityOver"))
    character = next(o for o in objects.values() if o["name"] == "Chracter")
    for obj in objects.values():
        obj["components"] = {}
        obj.pop("audio", None)
    city["material"]["textureSrc"]["asset"] = urls["backgrounds"]
    character["material"]["textureSrc"]["asset"] = urls["characters"]
    for obj in (city, character):
        obj["material"].update(forceTransparent=True, depthWrite=False, wrap="clamp")
    if layout:
        stage = layout["background"]
        performer = layout["character"]
        city["position"] = [0, 0, stage["z"]]
        city["scale"] = [stage["width"], stage["height"], 1]
        character["position"] = [performer["x"], performer["ground_y"] + (performer["foot_uv"] - .5) * performer["height"], performer["z"]]
        character["scale"] = [performer["width"], performer["height"], 1]
    city["material"]["opacity"] = .4
    character["material"]["opacity"] = 0
    target["components"]["city-mv"] = {"id": "city-mv", "name": "City MV Controller", "parameters": {
        "background": {"type": "entity", "id": city["id"]}, "character": {"type": "entity", "id": character["id"]}}}
    write_json(dist / "scene.json", scene)
    # Retain vendor binaries and license notices byte-for-byte; do not edit closed engine.
    copy_vendor_tree(BASELINE / "external", dist / "external")
    copy_vendor_tree(BASELINE / "image-targets", dist / "image-targets")
    for source in (ROOT / "web").rglob("*"):
        if source.is_file():
            target_path = dist / source.relative_to(ROOT / "web")
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target_path)
    manifest = {"version": 1, "engine": "8th Wall", "target": settings["target"], "duration": 15,
                "mode": mode, "bpm": settings["bpm"], "timeline": settings["timeline"],
                "layout": layout, "image_info": image_metadata,
                "tracking_lost_policy": settings.get("tracking_lost_policy", "pause"),
                "assets": {"audio": "assets/trap_15s.m4a", "background": urls["backgrounds"], "character": urls["characters"]},
                "animation": "deterministic layered static-image fallback; no AI motion generated",
                "onsets": analysis["onsets"], "beat_source": "configured BPM grid; onsets are separate measured RMS transients",
                "metadata": metadata,
                "asset_hashes": {p.relative_to(dist).as_posix(): digest(p) for p in assets.iterdir() if p.is_file()}}
    write_json(ROOT / "generated/manifest.json", manifest)
    write_json(dist / "manifest.json", manifest)
    verify_originals()
    return {"status": "COMPOSED", "mode": mode, "duration": float(probe(audio)["format"]["duration"]), "entry": str(dist / "index.html")}


def validate():
    config()
    verify_originals()
    dist = ROOT / "dist"
    manifest = read_json(dist / "manifest.json")
    if manifest["target"] != "city_painting" or manifest["duration"] != 15:
        raise ValueError("Invalid manifest target/duration")
    for url in manifest["assets"].values():
        path = (dist / url).resolve()
        if not path.is_relative_to(dist.resolve()) or not path.is_file():
            raise ValueError(f"Missing/unsafe asset: {url}")
        if digest(path) != manifest["asset_hashes"][url]:
            raise ValueError(f"Asset hash mismatch: {url}")
    for folder in ("external", "image-targets"):
        for source in (BASELINE / folder).rglob("*"):
            if source.is_file() and digest(source) != digest(dist / source.relative_to(BASELINE)):
                raise ValueError(f"Vendor/target changed: {source.name}")
    duration = float(probe(dist / manifest["assets"]["audio"])["format"]["duration"])
    if abs(duration - 15) > .05:
        raise ValueError(f"Audio duration invalid: {duration}")
    result = {"status": "VALID", "audio_duration": duration, "originals": "unchanged", "target_and_vendor": "byte-identical",
              "phone_tracking": "NOT_TESTED", "ai_generation": "NOT_RUN"}
    write_json(ROOT / "reports/validation.json", result)
    return result
