"""
QuaSAR stage ablation analysis.

For each of the 4 QuaSAR stages (Abstraction, Formalisation, Explanation,
Answering) we quantify its contribution to mathematical accuracy three ways:

  1. Cumulative (progressive depth)  — accuracy as stages are added in order
                                        1, 1-2, 1-3, 1-4. The marginal
                                        contribution Δ_k = Acc(1..k) - Acc(1..k-1)
                                        is what the original QuaSAR paper calls
                                        "depth attribution".

  2. Leave-one-out (LOO)              — Acc(full) − Acc(full \ {Sk}). This is
                                        the most direct per-stage contribution
                                        signal: how much does removing stage k
                                        hurt the fully assembled pipeline?

  3. Isolated (single stage)          — accuracy when only stage k is active.
                                        Shows what a stage can deliver on its own.

All three families share the same problem set, so deltas are comparable.
"""
from __future__ import annotations

from typing import Any

# ── Identifiers kept in sync with methods.py ──────────────────────────────────

STAGE_NAMES   = ["Abstraction", "Formalisation", "Explanation", "Answering"]
STAGE_COLORS  = ["#7F77DD", "#378ADD", "#639922", "#BA7517"]

CUMULATIVE_IDS = ["quasar_1", "quasar_2", "quasar_3", "quasar"]
LOO_IDS        = ["quasar_loo_1", "quasar_loo_2", "quasar_loo_3", "quasar_loo_4"]
ISOLATED_IDS   = ["quasar_iso_1", "quasar_iso_2", "quasar_iso_3", "quasar_iso_4"]
FULL_ID        = "quasar"

CUMULATIVE_LABELS = {
    "quasar_1": "S1",
    "quasar_2": "S1-S2",
    "quasar_3": "S1-S3",
    "quasar":   "S1-S4 (full)",
}
LOO_LABELS = {
    "quasar_loo_1": "¬S1 (no Abstraction)",
    "quasar_loo_2": "¬S2 (no Formalisation)",
    "quasar_loo_3": "¬S3 (no Explanation)",
    "quasar_loo_4": "¬S4 (no Answering)",
}
ISOLATED_LABELS = {
    "quasar_iso_1": "S1 only",
    "quasar_iso_2": "S2 only",
    "quasar_iso_3": "S3 only",
    "quasar_iso_4": "S4 only",
}


def ablation_method_ids() -> list[str]:
    """Every method id the ablation runner must evaluate."""
    return [*CUMULATIVE_IDS, *LOO_IDS, *ISOLATED_IDS]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _correct_flags(problems: list[dict[str, Any]], method_id: str) -> list[bool]:
    return [
        bool(p.get("methods", {}).get(method_id, {}).get("correct", False))
        for p in problems
    ]


def _accuracy(flags: list[bool]) -> float:
    return round(sum(flags) / len(flags), 4) if flags else 0.0


# ── Main analysis ─────────────────────────────────────────────────────────────

def compute_ablation_analysis(
    problems: list[dict[str, Any]],
) -> dict[str, Any]:
    n = len(problems)
    if n == 0:
        return {}

    # Correctness per method (parallel lists over problems)
    correctness: dict[str, list[bool]] = {
        m: _correct_flags(problems, m)
        for m in ablation_method_ids()
    }
    full_correct = correctness[FULL_ID]
    full_acc = _accuracy(full_correct)

    # ── 1. Cumulative ──────────────────────────────────────────────────────
    cumulative_accuracy = {m: _accuracy(correctness[m]) for m in CUMULATIVE_IDS}
    cumulative_marginal: dict[str, float] = {}
    prev = 0.0
    for m in CUMULATIVE_IDS:
        cumulative_marginal[m] = round(cumulative_accuracy[m] - prev, 4)
        prev = cumulative_accuracy[m]

    # ── 2. Leave-one-out ───────────────────────────────────────────────────
    # contribution_of(Sk) = Acc(full) - Acc(full \ Sk)
    loo_accuracy:      dict[str, float] = {}
    loo_contribution:  dict[str, float] = {}
    loo_wins:          dict[str, int]   = {}   # full correct, LOO wrong
    loo_losses:        dict[str, int]   = {}   # LOO correct, full wrong
    for k, loo_id in enumerate(LOO_IDS, start=1):
        loo_flags = correctness[loo_id]
        acc = _accuracy(loo_flags)
        loo_accuracy[loo_id] = acc
        loo_contribution[loo_id] = round(full_acc - acc, 4)
        loo_wins[loo_id]   = sum(int(f and not l) for f, l in zip(full_correct, loo_flags))
        loo_losses[loo_id] = sum(int(l and not f) for f, l in zip(full_correct, loo_flags))

    # ── 3. Isolated ────────────────────────────────────────────────────────
    isolated_accuracy: dict[str, float] = {
        m: _accuracy(correctness[m]) for m in ISOLATED_IDS
    }

    # ── Per-stage summary (canonical per-stage contribution view) ─────────
    per_stage: list[dict[str, Any]] = []
    for k in range(1, 5):
        cum_id = CUMULATIVE_IDS[k - 1]
        loo_id = LOO_IDS[k - 1]
        iso_id = ISOLATED_IDS[k - 1]
        per_stage.append({
            "stage":                 k,
            "name":                  STAGE_NAMES[k - 1],
            "color":                 STAGE_COLORS[k - 1],
            "cumulative_accuracy":   cumulative_accuracy[cum_id],
            "cumulative_marginal":   cumulative_marginal[cum_id],
            "loo_accuracy":          loo_accuracy[loo_id],
            "loo_contribution":      loo_contribution[loo_id],
            "loo_wins":              loo_wins[loo_id],
            "loo_losses":            loo_losses[loo_id],
            "isolated_accuracy":     isolated_accuracy[iso_id],
        })

    # ── Attribution matrix (problem × method correctness grid) ─────────────
    matrix: list[dict[str, Any]] = []
    for p in problems:
        row: dict[str, Any] = {
            "problem_id": p["problem"].get("id"),
            "question_snippet": (p["problem"].get("question") or "")[:60] + "…",
        }
        for m in ablation_method_ids():
            row[m] = bool(p.get("methods", {}).get(m, {}).get("correct", False))
        matrix.append(row)

    return {
        "n_problems":            n,
        "full_accuracy":         full_acc,
        "per_stage":             per_stage,
        "cumulative_accuracy":   cumulative_accuracy,
        "cumulative_marginal":   cumulative_marginal,
        "loo_accuracy":          loo_accuracy,
        "loo_contribution":      loo_contribution,
        "loo_wins":              loo_wins,
        "loo_losses":            loo_losses,
        "isolated_accuracy":     isolated_accuracy,
        "attribution_matrix":    matrix,
        "stage_names":           STAGE_NAMES,
        "stage_colors":          STAGE_COLORS,
        "cumulative_labels":     CUMULATIVE_LABELS,
        "loo_labels":            LOO_LABELS,
        "isolated_labels":       ISOLATED_LABELS,
    }


def compute_sap_delta(
    problems: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compare QuaSAR-SAP against full QuaSAR."""
    n = len(problems)
    if n == 0:
        return {}

    quasar_correct = _correct_flags(problems, "quasar")
    sap_correct    = _correct_flags(problems, "quasar_sap")

    quasar_acc = sum(quasar_correct) / n
    sap_acc    = sum(sap_correct) / n

    sap_wins   = sum(int(s and not q) for s, q in zip(sap_correct, quasar_correct))
    sap_losses = sum(int(q and not s) for s, q in zip(sap_correct, quasar_correct))

    return {
        "quasar_accuracy": round(quasar_acc, 4),
        "sap_accuracy":    round(sap_acc, 4),
        "delta":           round(sap_acc - quasar_acc, 4),
        "sap_wins":        sap_wins,
        "sap_losses":      sap_losses,
        "n_problems":      n,
    }
