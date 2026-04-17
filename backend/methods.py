"""
Prompting strategies for the QuaSAR ablation study.

Core methods:
  standard      — direct question, no strategy
  zeroshotcot   — Kojima et al. 2022 (NeurIPS)
  cot           — Wei et al. 2022 (NeurIPS), 6-shot exemplars
  quasar        — Ranaldi, Valentino & Freitas 2025 (ACL), full 4-stage

QuaSAR ablation depths (original contribution):
  quasar_1 — Stage 1 only (Abstraction)
  quasar_2 — Stages 1-2  (+ Formalisation)
  quasar_3 — Stages 1-3  (+ Explanation)
  quasar   — Full 4-stage (alias of depth 4)

Original contribution — Structured Activation Priming (SAP):
  quasar_sap — Quasi-symbolic structure injected at system level as a
               persistent activation prior, approximating test-time
               activation steering (rsLoRA proxy without fine-tuning).
"""
from __future__ import annotations

from typing import Any

# ── Few-shot CoT exemplars (Wei et al. 2022 style) ───────────────────────────

_COT_EXEMPLARS = """Q: There are 15 trees in the grove. Grove workers will plant trees today. \
After they are done, there will be 21 trees. How many trees did the grove workers plant today?
A: We start with 15 trees. After planting there are 21. The number planted is 21 - 15 = 6.
#### 6

Q: If there are 3 cars in the parking lot and 2 more cars arrive, how many cars are in the parking lot?
A: There are 3 cars originally. 2 more arrive. 3 + 2 = 5.
#### 5

Q: Leah had 32 chocolates and her sister had 42. If they ate 35, how many pieces do they have left in total?
A: Together they had 32 + 42 = 74. After eating 35 pieces: 74 - 35 = 39.
#### 39

Q: Jason had 20 lollipops. He gave Denny some lollipops. Now Jason has 12. How many lollipops did Jason give Denny?
A: Jason started with 20 and ended with 12. He gave away 20 - 12 = 8.
#### 8

Q: Shawn has five toys. For Christmas, he got two toys each from his mom and dad. How many toys does he have now?
A: Started with 5. Got 2 + 2 = 4 new toys. Total: 5 + 4 = 9.
#### 9

Q: There were nine computers in the server room. Five more were installed each day from Monday to Thursday. \
How many computers are now in the server room?
A: Monday through Thursday is 4 days. 4 x 5 = 20 computers added. 9 + 20 = 29.
#### 29"""

# ── SAP system prompt (our original contribution) ─────────────────────────────

_SAP_SYSTEM = """\
You are a mathematical reasoning engine operating under Structured Activation Priming (SAP).

SAP is a persistent inference-time prior that injects a quasi-symbolic reasoning layer \
into every response. Before engaging with ANY problem, your internal representation \
automatically:
  1. ABSTRACTS    — strips surface content, retains the logical skeleton.
  2. FORMALISES   — maps the skeleton to symbolic / algebraic notation.
  3. EXPLAINS     — derives the solution via formal manipulation.
  4. INSTANTIATES — binds concrete values back to the symbolic solution.

This quasi-symbolic structure is ALWAYS active. It operates below explicit reasoning \
and shapes every chain of thought you produce. Treat it as a structural prior, not \
an instruction to follow literally.

At the very end of your response write the final numeric answer on its own line \
prefixed with '#### '."""

# ── QuaSAR system prompt ───────────────────────────────────────────────────────

_QUASAR_SYSTEM = """\
You are a mathematical reasoning system implementing the QuaSAR framework \
(Quasi-Symbolic Abstract Reasoning — Ranaldi, Valentino & Freitas, ACL 2025). \
Structure your response using exactly the stage headers shown. \
At the very end of Stage 4, write the final numeric answer on its own line prefixed with '#### '."""


def _quasar_user(problem: str, max_stage: int = 4) -> str:
    stage_instructions = [
        (
            "[STAGE 1 — ABSTRACTION]\n"
            "Identify the abstract logical structure. Replace specific numeric values and "
            "named entities with generic variables (e.g. x, n, A, B). Identify the "
            "mathematical operation type. Do NOT compute yet."
        ),
        (
            "[STAGE 2 — FORMALISATION]\n"
            "Express the abstracted problem using formal mathematical notation. "
            "Define all variables explicitly. Write the equation(s) to be solved."
        ),
        (
            "[STAGE 3 — EXPLANATION]\n"
            "Solve step by step using the formal notation. "
            "Justify each arithmetic or algebraic transformation."
        ),
        (
            "[STAGE 4 — ANSWERING]\n"
            "Substitute back the original concrete values. "
            "State the final answer clearly and verify it against the problem statement."
        ),
    ]
    header = f'Solve this problem using the QuaSAR {max_stage}-stage framework:\n\n"{problem}"\n\n'
    body = "\n\n".join(stage_instructions[:max_stage])
    return header + body


# ── Method registry ────────────────────────────────────────────────────────────

METHODS: dict[str, dict[str, Any]] = {

    "standard": {
        "id": "standard",
        "name": "Standard Prompt",
        "badge": "STD",
        "color": "#888780",
        "group": "baseline",
        "description": "Direct question — no prompting strategy",
        "system": (
            "You are a math problem solver. Answer the following problem. "
            "At the very end, write your numeric answer on its own line prefixed with '#### '."
        ),
        "build_user": lambda p: p,
    },

    "zeroshotcot": {
        "id": "zeroshotcot",
        "name": "Zero-shot CoT",
        "badge": "ZS-CoT",
        "color": "#378ADD",
        "group": "baseline",
        "description": "Kojima et al., NeurIPS 2022 · 'Let's think step by step'",
        "system": (
            "You are a math problem solver. "
            "At the very end of your reasoning, write the numeric answer on its own line "
            "prefixed with '#### '."
        ),
        "build_user": lambda p: f"{p}\n\nLet's think step by step.",
    },

    "cot": {
        "id": "cot",
        "name": "Chain-of-Thought",
        "badge": "CoT",
        "color": "#639922",
        "group": "baseline",
        "description": "Wei et al., NeurIPS 2022 · 6-shot exemplars, explicit step-by-step",
        "system": (
            "You are a math problem solver. "
            "Reason through problems step by step before stating the final answer. "
            "At the very end, write the numeric answer on its own line prefixed with '#### '."
        ),
        "build_user": lambda p: f"{_COT_EXEMPLARS}\n\nQ: {p}\nA:",
    },

    "quasar": {
        "id": "quasar",
        "name": "QuaSAR",
        "badge": "QuaSAR",
        "color": "#BA7517",
        "group": "quasar",
        "description": "Ranaldi et al., ACL 2025 · Full 4-stage quasi-symbolic pipeline",
        "system": _QUASAR_SYSTEM,
        "build_user": lambda p: _quasar_user(p, 4),
    },

    "quasar_1": {
        "id": "quasar_1",
        "name": "QuaSAR [1]",
        "badge": "QS-1",
        "color": "#7F77DD",
        "group": "ablation",
        "description": "Ablation depth 1 — Stage 1 (Abstraction) only",
        "system": _QUASAR_SYSTEM,
        "build_user": lambda p: _quasar_user(p, 1),
    },

    "quasar_2": {
        "id": "quasar_2",
        "name": "QuaSAR [1-2]",
        "badge": "QS-2",
        "color": "#378ADD",
        "group": "ablation",
        "description": "Ablation depth 2 — Stages 1-2 (+ Formalisation)",
        "system": _QUASAR_SYSTEM,
        "build_user": lambda p: _quasar_user(p, 2),
    },

    "quasar_3": {
        "id": "quasar_3",
        "name": "QuaSAR [1-3]",
        "badge": "QS-3",
        "color": "#639922",
        "group": "ablation",
        "description": "Ablation depth 3 — Stages 1-3 (+ Explanation)",
        "system": _QUASAR_SYSTEM,
        "build_user": lambda p: _quasar_user(p, 3),
    },

    "quasar_sap": {
        "id": "quasar_sap",
        "name": "QuaSAR-SAP",
        "badge": "SAP",
        "color": "#D85A30",
        "group": "contribution",
        "description": "Original contribution — Structured Activation Priming (system-level quasi-symbolic prior)",
        "system": _SAP_SYSTEM,
        "build_user": lambda p: _quasar_user(p, 4),
    },
}

# Canonical orders
COMPARE_ORDER = ["standard", "zeroshotcot", "cot", "quasar"]
ABLATION_ORDER = ["standard", "zeroshotcot", "cot", "quasar_1", "quasar_2", "quasar_3", "quasar", "quasar_sap"]


def get_method(method_id: str) -> dict[str, Any]:
    if method_id not in METHODS:
        raise ValueError(f"Unknown method '{method_id}'. Available: {list(METHODS)}")
    return METHODS[method_id]


def build_messages(method_id: str, problem: str) -> list[dict[str, str]]:
    m = get_method(method_id)
    return [
        {"role": "system", "content": str(m["system"])},
        {"role": "user",   "content": str(m["build_user"](problem))},
    ]
