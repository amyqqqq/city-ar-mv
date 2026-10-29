import argparse
import json
import sys
import subprocess
from .baseline import extract
from .compose import compose, validate
from .doctor import doctor
from .jobs import generate, KINDS
from .providers import PROVIDERS
from .server import serve


def main(argv=None):
    parser = argparse.ArgumentParser(description="CITY AR MV offline pipeline")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor")
    commands.add_parser("baseline")
    generation = commands.add_parser("generate")
    generation.add_argument("--kind", choices=KINDS, required=True)
    generation.add_argument("--provider", choices=PROVIDERS, default="manual")
    generation.add_argument("--source")
    generation.add_argument("--license", default="")
    generation.add_argument("--prompt")
    generation.add_argument("--seed", type=int, default=42)
    generation.add_argument("--dry-run", action="store_true")
    assembly = commands.add_parser("compose")
    assembly.add_argument("--mode", choices=("original", "generated"))
    assembly.add_argument("--dry-run", action="store_true")
    commands.add_parser("validate")
    server = commands.add_parser("serve")
    server.add_argument("--port", type=int, default=8080)
    server.add_argument("--host", default="127.0.0.1")
    args = vars(parser.parse_args(argv))
    command = args.pop("command")
    try:
        result = {"doctor": doctor, "baseline": extract, "generate": generate,
                  "compose": compose, "validate": validate, "serve": serve}[command](**args)
        if result is not None:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if result and result.get("status") in ("FAILED", "NOT_CONFIGURED") else 0
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({"status": "ERROR", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
