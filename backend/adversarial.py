"""
Algorithmic adversarial evaluation suite — no LLM calls.

Three perturbation types:
  numerical_swap  — Scale all numbers by a random integer factor.
                    New answer = original_answer × factor (holds for
                    linear/proportional problems, ~85% of GSM8K).

  entity_swap     — Replace proper names and common object nouns with
                    neutral tokens (Entity_A, Object_X, …).
                    Mathematical structure and answer are identical.

  structural_swap — Detect add/subtract patterns and invert the final
                    operation. New answer is computed algebraically from
                    detected operands.
"""
from __future__ import annotations

import re
import random
from typing import Any

# ── Numerical swap ─────────────────────────────────────────────────────────────

# Avoid trivial scales (0, 1) and non-integer results for common problems
_SCALE_POOL = [2, 3, 4, 5, 7, 8, 10]

# Keywords / symbols that indicate a problem is NOT purely linear/additive in
# its numeric inputs — i.e. multiplying every number by k does NOT scale the
# answer by k. When any of these triggers fire, the variant is still emitted
# (so the model still sees a perturbed prompt) but is flagged unreliable and
# carries answer=None so downstream code can't mis-score it.
_NON_LINEAR_PATTERNS: list[tuple[str, str]] = [
    (r"\*",        "* operator"),
    (r"×",         "× operator"),
    (r"/",         "/ operator"),
    (r"÷",         "÷ operator"),
    (r"%",         "% symbol"),
    (r"\bpercent\b",   "percent"),
    (r"\beach\b",      "each"),
    (r"\bper\b",       "per"),
    (r"\btwice\b",     "twice"),
    (r"\bthrice\b",    "thrice"),
    (r"\bhalf\b",      "half"),
    (r"\bdouble[ds]?\b", "double"),
    (r"\btriple[ds]?\b", "triple"),
    (r"\bsquare[ds]?\b", "square"),
    (r"\btimes\b",     "times"),
    (r"\bratio\b",     "ratio"),
    (r"\baverage\b",   "average"),
]


def _is_linearly_scalable(problem: str) -> tuple[bool, str | None]:
    """Return (is_linear, trigger_reason). Conservative — when in doubt, False."""
    for pat, name in _NON_LINEAR_PATTERNS:
        if re.search(pat, problem, flags=re.IGNORECASE):
            return False, name
    return True, None


def _all_numbers(text: str) -> list[tuple[int, int, str]]:
    """Return list of (start, end, matched_string) for every standalone number."""
    return [(m.start(), m.end(), m.group()) for m in re.finditer(r"\b\d+(?:\.\d+)?\b", text)]


def numerical_swap(problem: str, answer: float, seed: int | None = None) -> dict[str, Any]:
    """
    Scale every number in the problem by a random factor from _SCALE_POOL.
    Answer scales by the same factor (valid for purely linear/additive problems
    only — multiplicative or rate-style problems are flagged unreliable).

    Doctest: "Janet's ducks lay 16 eggs per day..." trips the `per` keyword and
    comes back with reliable=False, answer=None.
    """
    rng = random.Random(seed if seed is not None else abs(hash(problem)) % 100_000)
    factor = rng.choice(_SCALE_POOL)

    spans = _all_numbers(problem)
    if not spans:
        return {
            "type": "numerical_swap",
            "label": "Numerical Swap",
            "description": "no numbers in problem — variant unchanged",
            "variant": problem,
            "answer": None,
            "factor": 1,
            "reliable": False,
            "scoreable": False,
            "reliability_reason": "no numbers detected",
        }

    parts: list[str] = []
    prev = 0
    for start, end, num_str in spans:
        parts.append(problem[prev:start])
        val = float(num_str)
        new_val = val * factor
        # Keep integer if possible
        parts.append(str(int(new_val)) if new_val == int(new_val) else str(round(new_val, 2)))
        prev = end
    parts.append(problem[prev:])
    variant_text = "".join(parts)

    is_linear, reason = _is_linearly_scalable(problem)
    if not is_linear:
        return {
            "type": "numerical_swap",
            "label": "Numerical Swap",
            "description": f"All numbers scaled by ×{factor}; answer not algebraically scalable ({reason})",
            "variant": variant_text,
            "answer": None,
            "factor": factor,
            "reliable": False,
            "scoreable": False,
            "reliability_reason": f"non-linear keyword: {reason}",
        }

    new_answer = answer * factor
    return {
        "type": "numerical_swap",
        "label": "Numerical Swap",
        "description": f"All numbers scaled by ×{factor} (GSM-Symbolic style)",
        "variant": variant_text,
        "answer": int(new_answer) if new_answer == int(new_answer) else round(new_answer, 3),
        "factor": factor,
        "reliable": True,
        "scoreable": True,
    }


# ── Entity swap ────────────────────────────────────────────────────────────────

# Common names appearing in GSM8K-style problems
_NAMES: list[str] = [
    "Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Henry",
    "Isabelle", "James", "Kate", "Liam", "Mary", "Noah", "Olivia", "Peter",
    "Quinn", "Rachel", "Sam", "Tom", "Uma", "Victor", "Wendy", "Xavier",
    "Yara", "Zack", "John", "Jane", "Mike", "Sarah", "Anna", "Mark",
    "Lisa", "Paul", "Amy", "Eric", "Lucy", "Jack", "Mia", "Ryan",
    "Hannah", "Tyler", "Sophia", "Ethan", "Ava", "Nathan", "Emily",
    "Julia", "Leo", "Zoe", "Max",
]

# Object nouns → neutral token
_OBJECTS: dict[str, str] = {
    "apple": "unit", "apples": "units",
    "orange": "unit", "oranges": "units",
    "banana": "unit", "bananas": "units",
    "mango": "unit", "mangoes": "units",
    "cookie": "unit", "cookies": "units",
    "candy": "unit", "candies": "units",
    "cake": "unit", "cakes": "units",
    "pie": "unit", "pies": "units",
    "marble": "token", "marbles": "tokens",
    "ball": "token", "balls": "tokens",
    "toy": "token", "toys": "tokens",
    "card": "token", "cards": "tokens",
    "sticker": "token", "stickers": "tokens",
    "book": "object", "books": "objects",
    "pencil": "object", "pencils": "objects",
    "pen": "object", "pens": "objects",
    "notebook": "object", "notebooks": "objects",
    "flower": "item", "flowers": "items",
    "tree": "item", "trees": "items",
    "car": "vehicle", "cars": "vehicles",
    "bike": "vehicle", "bikes": "vehicles",
    "dog": "animal", "dogs": "animals",
    "cat": "animal", "cats": "animals",
    "box": "container", "boxes": "containers",
    "bag": "container", "bags": "containers",
    "basket": "container", "baskets": "containers",
    "bottle": "container", "bottles": "containers",
}


def entity_swap(problem: str, answer: float) -> dict[str, Any]:
    """
    Replace proper names with Entity_A, Entity_B, …
    Replace common object nouns with neutral tokens.
    Answer is unchanged.
    """
    text = problem

    # Detect which names appear, assign entity labels in order of first appearance
    found_names: list[str] = []
    for name in _NAMES:
        if re.search(rf"\b{re.escape(name)}\b", text, re.IGNORECASE):
            found_names.append(name)

    label_map: dict[str, str] = {}
    entity_counter = 0
    for name in found_names:
        label = f"Entity_{chr(65 + entity_counter)}"  # A, B, C, …
        label_map[name] = label
        entity_counter += 1

    # Replace names (case-insensitive, whole-word)
    for name, label in label_map.items():
        text = re.sub(rf"\b{re.escape(name)}\b", label, text, flags=re.IGNORECASE)

    # Replace objects (case-insensitive, whole-word)
    for obj, neutral in _OBJECTS.items():
        text = re.sub(rf"\b{re.escape(obj)}\b", neutral, text, flags=re.IGNORECASE)

    changed = text != problem
    return {
        "type": "entity_swap",
        "label": "Entity Swap",
        "description": "Named entities replaced with neutral tokens — answer unchanged",
        "variant": text,
        "answer": answer,
        "entities_replaced": list(label_map.keys()),
        "reliable": True,
        "scoreable": True,
        "changed": changed,
    }


# ── Structural swap ────────────────────────────────────────────────────────────

# Patterns that imply a subtraction (A - B = answer)
_GIVE_VERBS = [
    "gave", "give", "gives", "given",
    "spent", "spend", "spends",
    "lost", "lose", "loses",
    "used", "use", "uses",
    "ate", "eat", "eats",
    "sold", "sell", "sells",
    "removed", "remove",
    "donated", "donate",
    "distributed",
]

# Patterns that imply an addition
_GET_VERBS = [
    "received", "receive", "receives",
    "bought", "buy", "buys",
    "got", "get", "gets",
    "found", "find", "finds",
    "earned", "earn", "earns",
    "gained", "gain",
    "added", "add", "adds",
    "collected",
    "acquired",
]

_GIVE_VERB_RE = re.compile(
    r"\b(" + "|".join(re.escape(v) for v in _GIVE_VERBS) + r")\b", re.IGNORECASE
)
_GET_VERB_RE = re.compile(
    r"\b(" + "|".join(re.escape(v) for v in _GET_VERBS) + r")\b", re.IGNORECASE
)

_GIVE_TO_GET: dict[str, str] = {
    "gave": "received", "give": "receive", "gives": "receives", "given": "received",
    "spent": "earned", "spend": "earn", "spends": "earns",
    "lost": "gained", "lose": "gain", "loses": "gains",
    "used": "received", "use": "receive", "uses": "receives",
    "ate": "bought", "eat": "buy", "eats": "buys",
    "sold": "received", "sell": "receive", "sells": "receives",
    "removed": "added", "remove": "add",
    "donated": "received", "donate": "receive",
    "distributed": "collected",
}

_GET_TO_GIVE: dict[str, str] = {v: k for k, v in _GIVE_TO_GET.items()}


def _try_detect_sub_pattern(
    problem: str, answer: float
) -> tuple[float, float] | None:
    """
    Attempt to find two numbers a, b such that a - b ≈ answer.
    Returns (a, b) if found.
    """
    nums = [float(m) for m in re.findall(r"\b\d+(?:\.\d+)?\b", problem)]
    for a in nums:
        for b in nums:
            if a != b and abs(a - b - answer) < 0.01:
                return (a, b)
    return None


def _try_detect_add_pattern(
    problem: str, answer: float
) -> tuple[float, float] | None:
    """
    Attempt to find two numbers a, b such that a + b ≈ answer.
    """
    nums = [float(m) for m in re.findall(r"\b\d+(?:\.\d+)?\b", problem)]
    for i, a in enumerate(nums):
        for b in nums[i + 1:]:
            if abs(a + b - answer) < 0.01:
                return (a, b)
    return None


def structural_swap(problem: str, answer: float, seed: int | None = None) -> dict[str, Any]:
    """
    Detect addition or subtraction structure and invert the final operation.

    Strategy A: if answer = a - b (subtraction detected), swap to a + b.
                 Replace give-verbs with receive-verbs.
    Strategy B: if answer = a + b (addition detected), swap to a - b.
                 Replace receive-verbs with give-verbs.
    Strategy C: fallback — apply a ×2 multiplier to the last operand.
    """
    # Strategy A: subtraction → addition
    if _GIVE_VERB_RE.search(problem):
        pair = _try_detect_sub_pattern(problem, answer)
        if pair:
            a, b = pair
            new_answer: float = a + b
            new_text = _GIVE_VERB_RE.sub(
                lambda m: _GIVE_TO_GET.get(m.group(1).lower(), m.group(1)),
                problem,
            )
            # Swap "how many * left" → "how many * in total"
            new_text = re.sub(
                r"\bhow (many|much)\b(.*?)\bleft\b",
                r"how \1\2in total",
                new_text,
                flags=re.IGNORECASE,
            )
            return {
                "type": "structural_swap",
                "label": "Structural Swap",
                "description": "Subtraction → addition: give-verbs swapped to receive-verbs",
                "variant": new_text,
                "answer": int(new_answer) if new_answer == int(new_answer) else round(new_answer, 3),
                "operation_change": "subtraction → addition",
                "reliable": True,
                "scoreable": True,
            }

    # Strategy B: addition → subtraction
    if _GET_VERB_RE.search(problem):
        pair = _try_detect_add_pattern(problem, answer)
        if pair:
            a, b = pair
            new_answer = abs(a - b)
            new_text = _GET_VERB_RE.sub(
                lambda m: _GET_TO_GIVE.get(m.group(1).lower(), m.group(1)),
                problem,
            )
            new_text = re.sub(
                r"\bhow (many|much)\b(.*?)\bin total\b",
                r"how \1\2left",
                new_text,
                flags=re.IGNORECASE,
            )
            return {
                "type": "structural_swap",
                "label": "Structural Swap",
                "description": "Addition → subtraction: receive-verbs swapped to give-verbs",
                "variant": new_text,
                "answer": int(new_answer) if new_answer == int(new_answer) else round(new_answer, 3),
                "operation_change": "addition → subtraction",
                "reliable": True,
                "scoreable": True,
            }

    # Strategy C: perturb last number — but the new answer is NOT algebraically
    # derivable from a simple scale, so emit text-only variant with answer=None.
    rng = random.Random(seed if seed is not None else abs(hash(problem)) % 100_000)
    factor = rng.choice([2, 3])
    last_num_match = list(re.finditer(r"\b(\d+(?:\.\d+)?)\b", problem))
    if last_num_match:
        m = last_num_match[-1]
        old_val = float(m.group())
        new_val = old_val * factor
        new_val_str = str(int(new_val)) if new_val == int(new_val) else str(round(new_val, 2))
        new_text = problem[: m.start()] + new_val_str + problem[m.end():]
        return {
            "type": "structural_swap",
            "label": "Structural Swap",
            "description": f"Fallback perturbation only (last operand ×{factor}) — answer not algebraically derivable",
            "variant": new_text,
            "answer": None,
            "operation_change": f"scale last operand ×{factor}",
            "reliable": False,
            "scoreable": False,
            "reliability_reason": "no add/subtract pattern; fallback perturbation has no derivable answer",
        }

    return {
        "type": "structural_swap",
        "label": "Structural Swap",
        "description": "No structural pattern detected — original returned",
        "variant": problem,
        "answer": None,
        "operation_change": "none",
        "reliable": False,
        "scoreable": False,
        "reliability_reason": "no add/subtract pattern detected",
    }


# ── Public interface ──────────────────────────────────────────────────────────

def generate_all_variants(
    problem: str,
    answer: float,
    types: list[str] | None = None,
    seed: int | None = None,
) -> list[dict[str, Any]]:
    """
    Generate adversarial variants algorithmically (no LLM calls).

    types: subset of ['numerical_swap', 'entity_swap', 'structural_swap'].
           Defaults to all three.
    """
    requested = set(types or ["numerical_swap", "entity_swap", "structural_swap"])
    results: list[dict[str, Any]] = []

    if "numerical_swap" in requested:
        results.append(numerical_swap(problem, answer, seed=seed))

    if "entity_swap" in requested:
        results.append(entity_swap(problem, answer))

    if "structural_swap" in requested:
        results.append(structural_swap(problem, answer, seed=seed))

    return results
