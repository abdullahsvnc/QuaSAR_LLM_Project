"""
QuaSAR stage ablation analysis.

For each of the 4 QuaSAR stages (Abstraction, Formalisation, Explanation,
Answering) we quantify its contribution to mathematical accuracy three ways:

  1. Cumulative (progressive depth)  — accuracy as stages are added in order
                                        1, 1-2, 1-3, 1-4. The marginal
                                        contribution Δ_k = Acc(1..k) - Acc(1..k-1)
                                        is what the original QuaSAR paper calls
                                        "depth attribution".

  2. Leave-one-out (LOO)              — Acc(full) − Acc(full\\{Sk}). This is
                                        the most direct per-stage contribution
                                        signal: how much does removing stage k
                                        hurt the fully assembled pipeline?

  3. Isolated (single stage)          — accuracy when only stage k is active.
                                        Shows what a stage can deliver on its own.

All three families share the same problem set, so deltas are comparable.
"""
from __future__ import annotations

from typing import Any

from evaluator import mcnemar_test

# ── Identifiers kept in sync with methods.py ──────────────────────────────────

STAGE_NAMES   = ["Abstraction", "Formalisation", "Explanation", "Answering"]
STAGE_COLORS  = ["#7F77DD", "#378ADD", "#639922", "#BA7517"]

# NOTE: cumulative depth-1 == isolated S1 by construction (both are stages=(1,)
# in methods.py). We alias them so only one LLM call is made per problem and the
# per-stage table reads from the same source of truth.
CUMULATIVE_IDS = ["quasar_iso_1", "quasar_2", "quasar_3", "quasar"]
LOO_IDS        = ["quasar_loo_1", "quasar_loo_2", "quasar_loo_3", "quasar_loo_4"]
ISOLATED_IDS   = ["quasar_iso_1", "quasar_iso_2", "quasar_iso_3", "quasar_iso_4"]
FULL_ID        = "quasar"

CUMULATIVE_LABELS = {
    "quasar_iso_1": "S1 (= isolated)",
    "quasar_2":     "S1-S2",
    "quasar_3":     "S1-S3",
    "quasar":       "S1-S4 (full)",
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
    """Every method id the ablation runner must evaluate (deduplicated —
    cumulative depth-1 and isolated S1 share quasar_iso_1)."""
    seen: set[str] = set()
    out: list[str] = []
    for m in [*CUMULATIVE_IDS, *LOO_IDS, *ISOLATED_IDS]:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


# ── Helpers ───────────────────────────────────────────────────────────────────

def _correct_flags(problems: list[dict[str, Any]], method_id: str) -> list[bool]:
    return [
        bool(p.get("methods", {}).get(method_id, {}).get("correct", False))
        for p in problems
    ]


def _accuracy(flags: list[bool]) -> float:
    return round(sum(flags) / len(flags), 4) if flags else 0.0


# ── Stage divergence narratives (Phase C — explanation panel) ─────────────────

_STAGE_NARRATIVE_TEMPLATES: dict[int, str] = {
    1: ("Removing Abstraction cost {decisive} of {n} problems decisively. "
        "In {wins} of those the model latched onto surface entities (named "
        "characters, specific objects) and lost the underlying logical structure; "
        "in {losses} cases dropping the abstraction step actually helped — "
        "likely because the variable substitution introduced bookkeeping errors."),
    2: ("Removing Formalisation cost {decisive} of {n} problems decisively. "
        "In {wins} of those the model skipped equation-writing and lost track "
        "once 3 or more operands were involved; in {losses} cases the symbolic "
        "detour misled the model on otherwise straightforward arithmetic."),
    3: ("Removing Explanation cost {decisive} of {n} problems decisively. "
        "In {wins} of those the model jumped from setup to answer without "
        "justifying intermediate arithmetic, so a sign or carry error went "
        "unchecked; in {losses} cases the verbose derivation drifted off-topic."),
    4: ("Removing Answering cost {decisive} of {n} problems decisively. "
        "In {wins} of those the model produced a correct symbolic derivation "
        "but failed to bind concrete values back, ending without a numeric "
        "answer; in {losses} cases skipping the final binding actually let the "
        "model commit to its earlier intermediate result."),
}


def _first_diverging_line(a: str, b: str) -> int:
    """Return the 0-based index of the first line where two outputs diverge.
    Returns -1 if outputs are identical."""
    a_lines = (a or "").splitlines()
    b_lines = (b or "").splitlines()
    for i in range(max(len(a_lines), len(b_lines))):
        ai = a_lines[i] if i < len(a_lines) else ""
        bi = b_lines[i] if i < len(b_lines) else ""
        if ai != bi:
            return i
    return -1


def summarize_stage_divergence(
    problems: list[dict[str, Any]],
    stage_k: int,
) -> dict[str, Any]:
    """Compare full QuaSAR vs LOO of stage k. Surface decisive cases + 2 examples
    + auto-generated narrative. No LLM call — pure string assembly."""
    if not (1 <= stage_k <= 4):
        raise ValueError(f"stage_k must be 1..4, got {stage_k}")

    n = len(problems)
    loo_id = f"quasar_loo_{stage_k}"

    decisive_indices: list[int] = []
    wins = 0   # full correct, LOO wrong
    losses = 0 # LOO correct, full wrong
    for i, p in enumerate(problems):
        full = bool(p.get("methods", {}).get("quasar", {}).get("correct", False))
        loo  = bool(p.get("methods", {}).get(loo_id, {}).get("correct", False))
        if full == loo:
            continue
        decisive_indices.append(i)
        if full and not loo:
            wins += 1
        elif loo and not full:
            losses += 1

    sample_pairs: list[dict[str, Any]] = []
    for i in decisive_indices[:2]:
        p = problems[i]
        prob_meta = p.get("problem", {}) or {}
        full_m = p.get("methods", {}).get("quasar", {}) or {}
        loo_m  = p.get("methods", {}).get(loo_id, {}) or {}
        sample_pairs.append({
            "problem_id":       prob_meta.get("id"),
            "question":         prob_meta.get("question"),
            "ground_truth":     prob_meta.get("numeric_answer"),
            "full_text":        full_m.get("text"),
            "loo_text":         loo_m.get("text"),
            "full_answer":      full_m.get("extracted_answer"),
            "loo_answer":       loo_m.get("extracted_answer"),
            "divergence_line":  _first_diverging_line(full_m.get("text") or "", loo_m.get("text") or ""),
        })

    decisive = len(decisive_indices)
    if decisive == 0:
        narrative = (f"Stage {stage_k} ({STAGE_NAMES[stage_k-1]}): no divergences "
                     f"in this sample — full QuaSAR and ¬S{stage_k} agreed on every "
                     f"problem. Increase n to surface decisive cases.")
    else:
        narrative = _STAGE_NARRATIVE_TEMPLATES[stage_k].format(
            decisive=decisive, n=n, wins=wins, losses=losses,
        )

    return {
        "stage":          stage_k,
        "stage_name":     STAGE_NAMES[stage_k - 1],
        "decisive_count": decisive,
        "loo_wins":       wins,
        "loo_losses":     losses,
        "sample_pairs":   sample_pairs,
        "narrative":      narrative,
    }


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

    # ── McNemar significance: full QuaSAR vs each LOO variant ─────────────
    # Tests whether removing stage k significantly changes correctness.
    # Reuses the same mcnemar_test used in batch route (Dror ACL 2018).
    mcnemar_loo: dict[str, dict[str, Any]] = {
        loo_id: mcnemar_test(full_correct, correctness[loo_id])
        for loo_id in LOO_IDS
    }

    # ── Per-stage summary (canonical per-stage contribution view) ─────────
    per_stage: list[dict[str, Any]] = []
    for k in range(1, 5):
        cum_id = CUMULATIVE_IDS[k - 1]
        loo_id = LOO_IDS[k - 1]
        iso_id = ISOLATED_IDS[k - 1]
        mc = mcnemar_loo[loo_id]
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
            "loo_p_value":           mc["p_value"],
            "loo_significant":       mc["significant"],
            "isolated_accuracy":     isolated_accuracy[iso_id],
            "divergence":            summarize_stage_divergence(problems, k),
        })

    narrative_summary = "\n".join(s["divergence"]["narrative"] for s in per_stage)

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
        "narrative_summary":     narrative_summary,
        "cumulative_accuracy":   cumulative_accuracy,
        "cumulative_marginal":   cumulative_marginal,
        "loo_accuracy":          loo_accuracy,
        "loo_contribution":      loo_contribution,
        "loo_wins":              loo_wins,
        "loo_losses":            loo_losses,
        "mcnemar_loo":           mcnemar_loo,
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

    mc = mcnemar_test(sap_correct, quasar_correct)

    return {
        "quasar_accuracy": round(quasar_acc, 4),
        "sap_accuracy":    round(sap_acc, 4),
        "delta":           round(sap_acc - quasar_acc, 4),
        "sap_wins":        sap_wins,
        "sap_losses":      sap_losses,
        "p_value":         mc["p_value"],
        "significant":     mc["significant"],
        "n_problems":      n,
    }
