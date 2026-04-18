"""
Prompting strategies for the QuaSAR ablation study.

Baselines:
  standard      — direct question, no strategy
  zeroshotcot   — Kojima et al. 2022 (NeurIPS)
  cot           — Wei et al. 2022 (NeurIPS), 6-shot exemplars
  quasar        — Ranaldi, Valentino & Freitas 2025 (ACL), full 4-stage

QuaSAR 4 stages:
  S1 ABSTRACTION    — strip surface content, keep logical skeleton
  S2 FORMALISATION  — map to symbolic / algebraic notation
  S3 EXPLANATION    — derive the solution through formal manipulation
  S4 ANSWERING      — bind concrete values, state and verify the answer

Ablation families (original contribution of this project — every stage
subset is evaluated so we can attribute the marginal gain of each stage):

  Cumulative (progressive depth):
    quasar_1     — {S1}
    quasar_2     — {S1, S2}
    quasar_3     — {S1, S2, S3}
    quasar       — {S1, S2, S3, S4}   (full)

  Leave-one-out (LOO — full minus stage k):
    quasar_loo_1 — {S2, S3, S4}       (drop Abstraction)
    quasar_loo_2 — {S1, S3, S4}       (drop Formalisation)
    quasar_loo_3 — {S1, S2, S4}       (drop Explanation)
    quasar_loo_4 — {S1, S2, S3}       (drop Answering)

  Isolated (single stage only):
    quasar_iso_1 — {S1}
    quasar_iso_2 — {S2}
    quasar_iso_3 — {S3}
    quasar_iso_4 — {S4}

Original contribution — Structured Activation Priming (SAP):
  quasar_sap   — the quasi-symbolic structure is injected at system level
                 as a persistent activation prior (rsLoRA proxy without
                 fine-tuning).

Every prompt — even Stage-1-only — ends with a mandatory final-answer
instruction, so answer extraction remains well-defined across all subsets.
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

# ── Stage catalogue ────────────────────────────────────────────────────────────

STAGE_NAMES = {
    1: "ABSTRACTION",
    2: "FORMALISATION",
    3: "EXPLANATION",
    4: "ANSWERING",
}

STAGE_INSTRUCTIONS: dict[int, str] = {
    1: (
        "[STAGE 1 — ABSTRACTION]\n"
        "Identify the abstract logical structure of the problem. "
        "Replace specific numeric values and named entities with generic variables "
        "(e.g. x, n, A, B). Name the type of mathematical operation(s) involved."
    ),
    2: (
        "[STAGE 2 — FORMALISATION]\n"
        "Express the problem in formal mathematical notation. Define each variable "
        "explicitly and write the equation(s) that encode the problem."
    ),
    3: (
        "[STAGE 3 — EXPLANATION]\n"
        "Solve the equation(s) step by step. Justify each arithmetic or algebraic "
        "transformation, working entirely in symbolic form where possible."
    ),
    4: (
        "[STAGE 4 — ANSWERING]\n"
        "Substitute the original concrete values back into the symbolic solution. "
        "State the final answer and verify it against the problem statement."
    ),
}

_FINAL_ANSWER_LINE = (
    "After completing the requested stage(s), ALWAYS finish your response with the "
    "final numeric answer on its own line prefixed with '#### '. This rule is "
    "absolute — it applies even if a stage instruction tells you to defer computation."
)

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

_QUASAR_SYSTEM = (
    "You are a mathematical reasoning system implementing the QuaSAR framework "
    "(Quasi-Symbolic Abstract Reasoning — Ranaldi, Valentino & Freitas, ACL 2025). "
    "Perform exactly the stages requested by the user, in the order requested, using "
    "the stage headers shown. "
    + _FINAL_ANSWER_LINE
)


def _quasar_user(problem: str, stages: tuple[int, ...]) -> str:
    """Build the user prompt for any non-empty ordered subset of the 4 stages."""
    stages = tuple(sorted(set(stages)))
    if not stages or not all(1 <= s <= 4 for s in stages):
        raise ValueError(f"stages must be a non-empty subset of 1..4, got {stages}")

    subset_repr = "{" + ", ".join(f"S{s}" for s in stages) + "}"
    header = (
        f'Solve the problem below using the QuaSAR pipeline restricted to the '
        f'stage subset {subset_repr}. Execute only the listed stages; do not '
        f'perform the others explicitly.\n\n'
        f'PROBLEM:\n"{problem}"\n\n'
    )
    body = "\n\n".join(STAGE_INSTRUCTIONS[s] for s in stages)
    footer = (
        "\n\nREMINDER: regardless of which stages were requested, end your response "
        "with the final numeric answer on its own line prefixed with '#### '."
    )
    return header + body + footer


def _quasar_method(
    method_id: str,
    stages: tuple[int, ...],
    name: str,
    badge: str,
    color: str,
    group: str,
    description: str,
) -> dict[str, Any]:
    return {
        "id":          method_id,
        "name":        name,
        "badge":       badge,
        "color":       color,
        "group":       group,
        "description": description,
        "stages":      list(stages),
        "system":      _QUASAR_SYSTEM,
        "build_user":  lambda p, s=stages: _quasar_user(p, s),
    }


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

    # ── Cumulative depth (progressive stage inclusion) ──
    "quasar_1": _quasar_method(
        "quasar_1", (1,),
        "QuaSAR [S1]", "QS-1", "#7F77DD", "cumulative",
        "Cumulative depth 1 — {Abstraction}",
    ),
    "quasar_2": _quasar_method(
        "quasar_2", (1, 2),
        "QuaSAR [S1-S2]", "QS-2", "#378ADD", "cumulative",
        "Cumulative depth 2 — {Abstraction, Formalisation}",
    ),
    "quasar_3": _quasar_method(
        "quasar_3", (1, 2, 3),
        "QuaSAR [S1-S3]", "QS-3", "#639922", "cumulative",
        "Cumulative depth 3 — {Abstraction, Formalisation, Explanation}",
    ),
    "quasar": _quasar_method(
        "quasar", (1, 2, 3, 4),
        "QuaSAR", "QuaSAR", "#BA7517", "quasar",
        "Ranaldi et al., ACL 2025 · Full 4-stage quasi-symbolic pipeline",
    ),

    # ── Leave-one-out (full \ {Sk}) ──
    "quasar_loo_1": _quasar_method(
        "quasar_loo_1", (2, 3, 4),
        "QuaSAR ¬S1", "¬S1", "#9A8AEA", "loo",
        "Leave-one-out — drop Abstraction (S2, S3, S4)",
    ),
    "quasar_loo_2": _quasar_method(
        "quasar_loo_2", (1, 3, 4),
        "QuaSAR ¬S2", "¬S2", "#5FA0E8", "loo",
        "Leave-one-out — drop Formalisation (S1, S3, S4)",
    ),
    "quasar_loo_3": _quasar_method(
        "quasar_loo_3", (1, 2, 4),
        "QuaSAR ¬S3", "¬S3", "#86B536", "loo",
        "Leave-one-out — drop Explanation (S1, S2, S4)",
    ),
    "quasar_loo_4": _quasar_method(
        "quasar_loo_4", (1, 2, 3),
        "QuaSAR ¬S4", "¬S4", "#D49438", "loo",
        "Leave-one-out — drop Answering (S1, S2, S3)",
    ),

    # ── Single-stage isolation ──
    "quasar_iso_1": _quasar_method(
        "quasar_iso_1", (1,),
        "QuaSAR {S1}", "S1", "#7F77DD", "isolated",
        "Isolated — Abstraction only",
    ),
    "quasar_iso_2": _quasar_method(
        "quasar_iso_2", (2,),
        "QuaSAR {S2}", "S2", "#378ADD", "isolated",
        "Isolated — Formalisation only",
    ),
    "quasar_iso_3": _quasar_method(
        "quasar_iso_3", (3,),
        "QuaSAR {S3}", "S3", "#639922", "isolated",
        "Isolated — Explanation only",
    ),
    "quasar_iso_4": _quasar_method(
        "quasar_iso_4", (4,),
        "QuaSAR {S4}", "S4", "#BA7517", "isolated",
        "Isolated — Answering only",
    ),

    "quasar_sap": {
        "id": "quasar_sap",
        "name": "QuaSAR-SAP",
        "badge": "SAP",
        "color": "#D85A30",
        "group": "contribution",
        "description": "Original contribution — Structured Activation Priming (system-level quasi-symbolic prior)",
        "stages": [1, 2, 3, 4],
        "system": _SAP_SYSTEM,
        "build_user": lambda p: _quasar_user(p, (1, 2, 3, 4)),
    },
}

# Canonical orderings
COMPARE_ORDER = ["standard", "zeroshotcot", "cot", "quasar"]
CUMULATIVE_ORDER = ["quasar_1", "quasar_2", "quasar_3", "quasar"]
LOO_ORDER        = ["quasar_loo_1", "quasar_loo_2", "quasar_loo_3", "quasar_loo_4"]
ISOLATED_ORDER   = ["quasar_iso_1", "quasar_iso_2", "quasar_iso_3", "quasar_iso_4"]
ABLATION_ORDER   = CUMULATIVE_ORDER + LOO_ORDER + ISOLATED_ORDER


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
