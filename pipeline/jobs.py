import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from .common import ROOT, config, digest, read_json, write_json
from .providers import PROVIDERS, Request, with_retry, NotConfigured

KINDS = ("music", "characters", "backgrounds", "motion", "effects")


def generate(kind, provider="manual", source=None, license="", seed=42, prompt=None, dry_run=False):
    settings = config()
    source = Path(source).resolve() if source else None
    prompt = prompt or f"{settings['style']}; {settings['character']}; {kind}; duration 15 seconds"
    signature = {"kind": kind, "provider": provider, "prompt": prompt, "seed": seed,
                 "source_sha256": digest(source) if source and source.is_file() else None,
                 "license": license, "config_sha256": digest(ROOT / "config/project.json")}
    job_id = hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()[:24]
    extension = source.suffix.lower() if source else {"music": ".wav", "motion": ".json"}.get(kind, ".png")
    directory = "audio" if kind == "music" else kind
    destination = ROOT / "generated" / directory / (job_id + extension)
    meta_path = destination.with_suffix(destination.suffix + ".metadata.json")
    job = {"id": job_id, **signature, "output": str(destination.relative_to(ROOT)),
           "timestamp": datetime.now(timezone.utc).isoformat(), "model": "user-supplied" if provider == "manual" else None}
    if dry_run:
        job.update(status="PLANNED", network_calls=0, output_created=False)
        write_json(ROOT / f"generated/plans/{job_id}.json", job)
        return job
    try:
        if meta_path.exists() and destination.is_file() and read_json(meta_path).get("sha256") == digest(destination):
            job["status"] = "CACHED"
        else:
            result = with_retry(lambda: PROVIDERS[provider].generate(Request(kind, prompt, seed, destination, source, license)))
            job.update(status="IMPORTED" if provider == "manual" else "GENERATED", sha256=digest(result))
            write_json(meta_path, job)
        write_json(ROOT / f"generated/selections/{kind}.json", {"metadata": str(meta_path.relative_to(ROOT))})
    except NotConfigured as error:
        job.update(status="NOT_CONFIGURED", error=str(error))
    except Exception as error:
        job.update(status="FAILED", error=str(error))
    log = ROOT / "generated/jobs.jsonl"
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(job, ensure_ascii=False) + "\n")
    return job
