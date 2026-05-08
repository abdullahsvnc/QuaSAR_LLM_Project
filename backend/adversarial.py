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
    # Names appearing frequently in GSM8K
    "Janet", "Jared", "Jordan", "Dominick", "Tina", "Tim", "Jim", "Joy",
    "Kim", "Ken", "Ben", "Beth", "Carla", "Carlos", "Diana", "Daniel",
    "Elena", "Elsa", "Felix", "Fiona", "Gina", "Greg", "Holly", "Ivan",
    "Jenny", "Kevin", "Karen", "Laura", "Lena", "Megan", "Nina", "Oscar",
    "Pam", "Pedro", "Rita", "Roger", "Steve", "Susan", "Terry", "Trevor",
    "Vera", "Walter", "Yvonne", "Zara", "Linda", "Maya", "Nora", "Owen",
    "Rosa", "Tara", "Wade", "Bill", "Brian", "Brenda", "Chad", "Cindy",
    "Donald", "Donna", "Edward", "Eve", "Gary", "Gloria", "Harold", "Helen",
    "Jeff", "Joan", "Larry", "Lori", "Marcus", "Nancy", "Patricia", "Robert",
    "Stephanie", "Theodore", "Wesley",
]

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

    # Group singular/plural pairs by category: assign Object_A, Object_B, …
    # per distinct lemma in order of first appearance. Preserves the
    # cardinality structure of multi-object problems (robots ≠ helmets ≠ footballs).
    _PAIRS: list[tuple[str, str]] = [
        ("apple", "apples"), ("orange", "oranges"), ("banana", "bananas"),
        ("mango", "mangoes"), ("cookie", "cookies"), ("candy", "candies"),
        ("cake", "cakes"), ("pie", "pies"),
        ("marble", "marbles"), ("ball", "balls"), ("toy", "toys"),
        ("card", "cards"), ("sticker", "stickers"),
        ("book", "books"), ("pencil", "pencils"), ("pen", "pens"),
        ("notebook", "notebooks"),
        ("flower", "flowers"), ("tree", "trees"),
        ("car", "cars"), ("bike", "bikes"),
        ("dog", "dogs"), ("cat", "cats"),
        ("box", "boxes"), ("bag", "bags"), ("basket", "baskets"),
        ("bottle", "bottles"),
        ("child", "children"), ("boy", "boys"), ("girl", "girls"),
        ("man", "men"), ("woman", "women"),
        ("student", "students"), ("teacher", "teachers"), ("friend", "friends"),
        ("helmet", "helmets"), ("robot", "robots"), ("football", "footballs"),
        ("seat", "seats"), ("chair", "chairs"), ("table", "tables"),
        ("shirt", "shirts"), ("shoe", "shoes"), ("hat", "hats"),
        ("egg", "eggs"),
        ("duck", "ducks"), ("chicken", "chickens"), ("cow", "cows"),
        ("horse", "horses"), ("rabbit", "rabbits"), ("bird", "birds"),
        ("dollar", "dollars"), ("cent", "cents"), ("coin", "coins"),
    ]

    # Find first occurrence index for each lemma that actually appears
    first_pos: list[tuple[int, str, str]] = []
    for sing, plur in _PAIRS:
        m_sing = re.search(rf"\b{re.escape(sing)}\b", text, re.IGNORECASE)
        m_plur = re.search(rf"\b{re.escape(plur)}\b", text, re.IGNORECASE)
        positions = [m.start() for m in (m_sing, m_plur) if m is not None]
        if positions:
            first_pos.append((min(positions), sing, plur))

    first_pos.sort(key=lambda t: t[0])
    obj_counter = 0
    for _, sing, plur in first_pos:
        tag = f"Object_{chr(65 + obj_counter)}"
        text = re.sub(rf"\b{re.escape(plur)}\b", f"{tag}s", text, flags=re.IGNORECASE)
        text = re.sub(rf"\b{re.escape(sing)}\b", tag, text, flags=re.IGNORECASE)
        obj_counter += 1

    changed = text != problem
    if not changed:
        return {
            "type": "entity_swap",
            "label": "Entity Swap",
            "description": "No swappable entities found — variant identical to original",
            "variant": text,
            "answer": None,
            "entities_replaced": [],
            "reliable": False,
            "scoreable": False,
            "changed": False,
            "reliability_reason": "no name or object noun matched dictionaries",
        }
    return {
        "type": "entity_swap",
        "label": "Entity Swap",
        "description": "Named entities replaced with neutral tokens — answer unchanged",
        "variant": text,
        "answer": answer,
        "entities_replaced": list(label_map.keys()),
        "reliable": True,
        "scoreable": True,
        "changed": True,
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

# Hand-tuned for natural language (don't auto-invert _GIVE_TO_GET; e.g.
# "bought → ate" reads worse than "bought → sold")
_GET_TO_GIVE: dict[str, str] = {
    "received": "gave", "receive": "give", "receives": "gives",
    "bought":   "sold", "buy":     "sell", "buys":     "sells",
    "got":      "gave", "get":     "give", "gets":     "gives",
    "found":    "lost", "find":    "lose", "finds":    "loses",
    "earned":   "spent", "earn":   "spend", "earns":   "spends",
    "gained":   "lost", "gain":    "lose",
    "added":    "removed", "add":  "remove", "adds":   "removes",
    "collected": "distributed",
    "acquired":  "sold",
}


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
            # Direction flip: "gave X to Mary" → "received X from Mary"
            new_text = re.sub(
                r"\bto\s+([A-Z][a-zA-Z]+)\b",
                r"from \1",
                new_text,
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
            # Direction flip: "received X from Mary" → "gave X to Mary"
            new_text = re.sub(
                r"\bfrom\s+([A-Z][a-zA-Z]+)\b",
                r"to \1",
                new_text,
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

    # Strategy C: distractor injection (GSM-Symbolic Op-3 style) — insert
    # numerically-loaded but logically irrelevant sentences before the question.
    # Optionally shuffle middle clauses too. Answer unchanged. This is a strong
    # perturbation: models often incorrectly fold the distractor numbers into
    # the computation.
    rng = random.Random(seed if seed is not None else abs(hash(problem)) % 100_000)
    sentences = re.findall(r"[^.!?]+[.!?]", problem.strip())
    if len(sentences) >= 2:
        q_idx = next((i for i, s in enumerate(sentences) if s.strip().endswith("?")), len(sentences) - 1)
        head = sentences[0].strip()
        question = sentences[q_idx].strip()
        middle = [s.strip() for s in sentences[1:q_idx] + sentences[q_idx + 1:]]

        # Pick distractor numbers unlikely to coincide with the answer.
        pool = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
        try:
            ans_int = int(answer)
            pool = [n for n in pool if n != ans_int]
        except (TypeError, ValueError):
            pass
        d1, d2 = rng.sample(pool, 2)

        # On-topic noun lifted from problem if available, else generic.
        noun_match = re.search(r"\b([a-z]{4,})s\b", problem.lower())
        noun = noun_match.group(1) + "s" if noun_match else "items"

        templates = [
            f"In a different scenario, there were {d1} {noun}, but that situation is unrelated.",
            f"A neighboring shop has {d1} similar {noun} in stock, though that does not affect this problem.",
            f"Last year the count was {d1} {noun}, but that figure is no longer relevant.",
            f"Note that {d1} {noun} were observed elsewhere, which is not part of the calculation.",
        ]
        distractor1 = rng.choice(templates)
        distractor2 = (
            f"Additionally, an unrelated batch of {d2} {noun} exists in another context."
        )

        # Shuffle middle clauses to compound the perturbation.
        if len(middle) >= 2:
            for _ in range(5):
                shuffled = middle[:]
                rng.shuffle(shuffled)
                if shuffled != middle:
                    middle = shuffled
                    break

        # Insert distractors at random positions among middle clauses.
        body = middle[:]
        if body:
            body.insert(rng.randint(0, len(body)), distractor1)
            body.insert(rng.randint(0, len(body)), distractor2)
        else:
            body = [distractor1, distractor2]

        new_text = " ".join([head] + body + [question]).strip()
        if new_text != problem:
            return {
                "type": "structural_swap",
                "label": "Structural Swap",
                "description": "Distractor injection (+ clause reorder) — irrelevant numerical clauses added; answer unchanged",
                "variant": new_text,
                "answer": answer,
                "operation_change": "distractor injection + reorder",
                "reliable": True,
                "scoreable": True,
            }

    return {
        "type": "structural_swap",
        "label": "Structural Swap",
        "description": "Problem too short to inject distractors — original returned",
        "variant": problem,
        "answer": None,
        "operation_change": "none",
        "reliable": False,
        "scoreable": False,
        "reliability_reason": "fewer than 2 sentences; cannot inject distractor",
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
