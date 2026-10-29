"""Explicit provider contract. Unconfigured services never produce placeholder media."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
import shutil
import time
from .common import safe_output


class NotConfigured(RuntimeError):
    pass


@dataclass(frozen=True)
class Request:
    kind: str
    prompt: str
    seed: int
    destination: Path
    source: Path | None = None
    license: str = ""


class Provider(ABC):
    name = "abstract"

    @abstractmethod
    def generate(self, request: Request) -> Path:
        """Return a real local file or raise; never fabricate success."""


class ManualProvider(Provider):
    name = "manual"

    def generate(self, request):
        if not request.source or not request.source.is_file():
            raise ValueError("Manual import requires an existing --source")
        if not request.license.strip():
            raise ValueError("Manual import requires --license describing granted rights")
        target = safe_output(request.destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(request.source, target)
        return target


class ServiceSlot(Provider):
    def __init__(self, name):
        self.name = name

    def generate(self, request):
        raise NotConfigured(f"{self.name}: NOT_CONFIGURED; supply an approved workflow/API adapter and credentials server-side")


PROVIDERS = {"manual": ManualProvider(), **{name: ServiceSlot(name) for name in ("comfyui", "ace-step", "external")}}


def with_retry(action, attempts=3, delay=0.2):
    for attempt in range(attempts):
        try:
            return action()
        except (TimeoutError, ConnectionError):
            if attempt + 1 == attempts:
                raise
            time.sleep(delay * 2**attempt)
