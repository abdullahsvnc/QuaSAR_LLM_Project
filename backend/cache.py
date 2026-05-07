"""
Disk-based response cache.
Key = SHA-256(PROMPT_VERSION || method_id || problem || model)[:20]

Bump PROMPT_VERSION any time methods.py prompts change so old entries
can never be served against a new prompt.
"""

import hashlib
import json
import time
from pathlib import Path
from typing import Any

PROMPT_VERSION = "v3"

CACHE_DIR = Path("./cache")
CACHE_DIR.mkdir(exist_ok=True)


def _key(method_id: str, problem: str, model: str) -> str:
    raw = f"{PROMPT_VERSION}\x00{method_id}\x00{problem}\x00{model}"
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


def get(method_id: str, problem: str, model: str) -> "dict[str, Any] | None":
    path = CACHE_DIR / f"{_key(method_id, problem, model)}.json"
    if path.exists():
        try:
            return json.loads(path.read_text())  # type: ignore[return-value]
        except Exception:
            return None
    return None


def put(method_id: str, problem: str, model: str, data: "dict[str, Any]") -> None:
    path = CACHE_DIR / f"{_key(method_id, problem, model)}.json"
    path.write_text(json.dumps({**data, "_cached_at": time.time(), "_cache_hit": True}))


def stats() -> "dict[str, int]":
    files = list(CACHE_DIR.glob("*.json"))
    total_bytes = sum(f.stat().st_size for f in files)
    return {"entries": len(files), "size_kb": total_bytes // 1024}
