"""
QuaSAR Stage Ablation Analysis.

Computes the marginal contribution of each QuaSAR stage by evaluating
progressive stage subsets (depth 1 through 4) on a set of problems.

Metrics:
  accuracy_by_depth     — accuracy at each depth (1, 2, 3, 4)
  marginal_contribution — Acc(depth_n) - Acc(depth_n-1)
  stage_necessity       — for problems where full QuaSAR is correct,
                          what is the minimum depth that also gets it right?
  attribution_matrix    — problem × depth correctness grid (for heatmaps)
"""
from __future__ import annotations

from typing import Any


DEPTH_IDS = ["quasar_1", "quasar_2", "quasar_3", "quasar"]
DEPTH_LABELS = {
    "quasar_1": "Stage 1 — Abstraction",
    "quasar_2": "Stages 1-2 — + Formalisation",
    "quasar_3": "Stages 1-3 — + Explanation",
    "quasar":   "Stages 1-4 — Full QuaSAR",
}
STAGE_NAMES = ["Abstraction", "Formalisation", "Explanation", "Answering"]
STAGE_COLORS = ["#7F77DD", "#378ADD", "#639922", "#BA7517"]


def compute_ablation_analysis(
    problems: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Analyse ablation results from a batch run.

    problems: list of problem dicts from a batch result, each having
              a 'methods' key with correctness per method_id.
    Returns a rich analysis dict suitable for the frontend.
    """
    n = len(problems)
    if n == 0:
        return {}

    # ── Accuracy by depth ──────────────────────────────────────────────────
    accuracy_by_depth: dict[str, float] = {}
    for d in DEPTH_IDS:
        correct = sum(
            int(p["methods"].get(d, {}).get("correct", False))
            for p in problems
        )
        accuracy_by_depth[d] = round(correct / n, 4) if n else 0.0

    # ── Marginal contribution ──────────────────────────────────────────────
    marginal: dict[str, float] = {}
    prev_acc = 0.0
    for d in DEPTH_IDS:
        acc = accuracy_by_depth[d]
        marginal[d] = round(acc - prev_acc, 4)
        prev_acc = acc

    # ── Attribution matrix (problem × depth) ──────────────────────────────
    matrix: list[dict[str, Any]] = []
    for p in problems:
        row: dict[str, Any] = {
            "problem_id": p["problem"].get("id"),
            "question_snippet": p["problem"].get("question", "")[:60] + "…",
        }
        for d in DEPTH_IDS:
            row[d] = bool(p["methods"].get(d, {}).get("correct", False))
        matrix.append(row)

    # ── Stage necessity ────────────────────────────────────────────────────
    # For problems where full QuaSAR is correct, find the minimum depth
    # that also gets it right. If depth 1 already gets it, stage 1 is
    # sufficient; otherwise stage 2 adds value, etc.
    necessity_counts = {d: 0 for d in DEPTH_IDS}
    full_correct_count = 0

    for p in problems:
        if not p["methods"].get("quasar", {}).get("correct", False):
            continue
        full_correct_count += 1
        for d in DEPTH_IDS:
            if p["methods"].get(d, {}).get("correct", False):
                necessity_counts[d] += 1
                break  # minimum depth found

    necessity: dict[str, float] = {
        d: round(necessity_counts[d] / full_correct_count, 4)
        if full_correct_count else 0.0
        for d in DEPTH_IDS
    }

    # ── Per-stage win/lose analysis ────────────────────────────────────────
    # A stage "wins" a problem if adding that stage flips an incorrect
    # answer to correct. A stage "loses" if removing it flips correct to wrong.
    stage_wins: dict[str, int] = {}
    stage_losses: dict[str, int] = {}

    depth_list = DEPTH_IDS  # ordered by depth
    for i, d in enumerate(depth_list):
        wins = 0
        losses = 0
        prev_d = depth_list[i - 1] if i > 0 else None
        for p in problems:
            curr_correct = bool(p["methods"].get(d, {}).get("correct", False))
            prev_correct = bool(
                p["methods"].get(prev_d, {}).get("correct", False)
            ) if prev_d else False

            if curr_correct and not prev_correct:
                wins += 1
            elif not curr_correct and prev_correct:
                losses += 1

        stage_wins[d]   = wins
        stage_losses[d] = losses

    return {
        "n_problems": n,
        "accuracy_by_depth": accuracy_by_depth,
        "marginal_contribution": marginal,
        "attribution_matrix": matrix,
        "stage_necessity": necessity,
        "stage_wins": stage_wins,
        "stage_losses": stage_losses,
        "depth_labels": DEPTH_LABELS,
        "stage_names": STAGE_NAMES,
        "stage_colors": STAGE_COLORS,
        "full_quasar_correct": full_correct_count,
    }


def compute_sap_delta(
    problems: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Compute the delta between QuaSAR-SAP and full QuaSAR.
    SAP is our original contribution — this shows whether system-level
    quasi-symbolic priming outperforms user-level instruction alone.
    """
    n = len(problems)
    if n == 0:
        return {}

    quasar_correct = [
        bool(p["methods"].get("quasar", {}).get("correct", False))
        for p in problems
    ]
    sap_correct = [
        bool(p["methods"].get("quasar_sap", {}).get("correct", False))
        for p in problems
    ]

    quasar_acc = sum(quasar_correct) / n
    sap_acc    = sum(sap_correct) / n

    # Problems where SAP wins over QuaSAR and vice versa
    sap_wins   = sum(int(s and not q) for s, q in zip(sap_correct, quasar_correct))
    sap_losses = sum(int(q and not s) for s, q in zip(sap_correct, quasar_correct))

    return {
        "quasar_accuracy":  round(quasar_acc, 4),
        "sap_accuracy":     round(sap_acc, 4),
        "delta":            round(sap_acc - quasar_acc, 4),
        "sap_wins":         sap_wins,
        "sap_losses":       sap_losses,
        "n_problems":       n,
    }
