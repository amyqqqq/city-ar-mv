"""Scan the exact Git publish set, including original ZIP contents; never print secrets."""
import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'github-token': re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})'),
    'openai-key': re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}'),
    'aws-access-key': re.compile(rb'\bAKIA[A-Z0-9]{16}\b'),
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'literal-secret': re.compile(rb'''(?i)["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["']([A-Za-z0-9_+/.=-]{24,})["']'''),
}
BLOCKED_SUFFIXES = {'.pem','.key','.p12','.pfx','.safetensors','.ckpt','.gguf','.ggml','.pt','.pth','.onnx','.sqlite'}
BLOCKED_DIRS = {'.venv','node_modules','.cache','__pycache__','models','checkpoints','loras','generated','dist','reports'}


def inspect_payload(name, content):
    findings = []
    for rule, pattern in PATTERNS.items():
        for match in pattern.finditer(content):
            findings.append({'path':name,'rule':rule,'line':content.count(b'\n',0,match.start())+1})
    return findings


def audit(staged=False):
    command = ['git','diff','--cached','--name-only','--diff-filter=ACMR','-z'] if staged else ['git','ls-files','--cached','--others','--exclude-standard','-z']
    names = sorted(set(subprocess.check_output(command,cwd=ROOT).decode().split('\0')) - {''})
    findings = []
    scanned_zip_members = 0
    total = 0
    for name in names:
        path = ROOT / name
        if not path.is_file():
            continue
        relative = Path(name)
        if any(part in BLOCKED_DIRS for part in relative.parts) or relative.suffix.lower() in BLOCKED_SUFFIXES or (relative.name.startswith('.env') and relative.name != '.env.example'):
            findings.append({'path':name,'rule':'excluded-file-type'})
        if path.is_symlink():
            findings.append({'path':name,'rule':'symlink-not-publishable'})
        size = path.stat().st_size
        total += size
        if size > 50 * 1024 * 1024:
            findings.append({'path':name,'rule':'file-over-50MiB'})
        payload = subprocess.check_output(['git','show',f':{name}'],cwd=ROOT) if staged else path.read_bytes()
        if path.suffix.lower() == '.zip':
            import io
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                for entry in archive.infolist():
                    if not entry.is_dir():
                        scanned_zip_members += 1
                        findings.extend(inspect_payload(f'{name}!{entry.filename}',archive.read(entry)))
        else:
            findings.extend(inspect_payload(name,payload))
    result = {'status':'PASS' if not findings else 'BLOCKED','files':len(names),'bytes':total,
              'zip_members_scanned':scanned_zip_members,'findings':findings,
              'limitations':'Pattern-based scan; not a proof that arbitrary secrets cannot exist. No secret values are logged.'}
    (ROOT/'reports').mkdir(exist_ok=True)
    (ROOT/'reports/public_audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))
    return 1 if findings else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--staged',action='store_true')
    sys.exit(audit(parser.parse_args().staged))
