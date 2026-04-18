"""
GSM8K dataset loader.

GSM8K (Cobbe et al., 2021) — 8,500 grade-school math word problems.
Ground-truth answers are embedded in the solution string as '#### <number>'.
"""

from __future__ import annotations

import re
import random
from functools import lru_cache
from typing import Any

_cache: list[dict[str, Any]] | None = None


def _extract_numeric(answer_text: str) -> float | None:
    """Extract the number after '####' in a GSM8K solution string."""
    m = re.search(r"####\s*([\-\d,\.]+)", answer_text)
    if not m:
        return None
    return float(m.group(1).replace(",", ""))


@lru_cache(maxsize=1)
def _load_dataset(split: str):
    from datasets import load_dataset
    return load_dataset("gsm8k", "main", split=split)


def load_problems(split: str = "test", n: int = 50, seed: int | None = 42) -> list[dict[str, Any]]:
    """
    Load n problems from GSM8K.

    seed=None → truly random sample every call (for interactive use).
    seed=<int> → reproducible sample (for batch/ablation experiments).

    Returns a list of dicts:
        {
            "id": int,
            "question": str,
            "full_solution": str,
            "numeric_answer": float,
        }
    """
    ds = _load_dataset(split)
    indices = list(range(len(ds)))
    rng = random.Random(seed)  # Random(None) uses system entropy — truly random
    rng.shuffle(indices)
    selected = indices[:n]

    problems: list[dict[str, Any]] = []
    for idx in selected:
        row = ds[idx]
        numeric = _extract_numeric(row["answer"])
        if numeric is None:
            continue
        problems.append({
            "id": idx,
            "question": row["question"],
            "full_solution": row["answer"],
            "numeric_answer": numeric,
        })
    return problems
