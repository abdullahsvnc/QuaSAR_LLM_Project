"""
Answer extraction and accuracy evaluation.

Extraction strategy:
  1. Regex hunt for '#### <number>'
  2. Regex hunt for common answer-phrasing patterns
  3. Last standalone number in the response

Statistical test:
  McNemar's test (Dror et al., ACL 2018) — pairwise binary outcome comparison.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from openai import AsyncOpenAI


# ── Answer extraction ─────────────────────────────────────────────────────────

def _clean(num_str: str) -> float:
    return float(num_str.replace(",", "").replace(" ", ""))


def extract_answer(text: str) -> float | None:
    num_re = r"[\-]?\d[\d,\.]*"

    # 1. "The answer is: N" / "The final answer is N" — paper §2.1.4
    #    (Ranaldi ACL 2025) QuaSAR/SAP format. Strict: only the strongest
    #    explicit "answer is" phrasing. Take the last match in the text.
    strict_phrase_re = re.compile(
        r"(?:the\s+)?(?:final\s+)?answer\s+is\s*[:\s]?\s*(" + num_re + r")",
        re.IGNORECASE,
    )
    strict_hits = strict_phrase_re.findall(text)
    if strict_hits:
        try:
            return _clean(strict_hits[-1])
        except ValueError:
            pass

    # 2. #### marker — GSM8K/CoT exemplar format (Wei 2022). Last hit wins.
    hash_hits = re.findall(r"####\s*(" + num_re + r")", text)
    if hash_hits:
        try:
            return _clean(hash_hits[-1])
        except ValueError:
            pass

    # 3. \boxed{N} — Gemini LaTeX format. Prefer the last \boxed in the response.
    boxed_hits = re.findall(r"\\boxed\{(" + num_re + r")\}", text)
    if boxed_hits:
        try:
            return _clean(boxed_hits[-1])
        except ValueError:
            pass

    # 4. **N** — Gemini bold-then-period ending. Take last match.
    bold_hits = re.findall(r"\*\*(" + num_re + r")\*\*\s*(?:\.|$)", text, re.MULTILINE)
    if bold_hits:
        try:
            return _clean(bold_hits[-1])
        except ValueError:
            pass

    # 5. Loose closing phrases — result/total/therefore/so. Last match wins.
    loose_phrase_re = re.compile(
        r"(?:"
        r"result\s+is\s*[:\s]?"
        r"|total\s+is\s*[:\s]?"
        r"|therefore[,\s]+(?:the\s+)?(?:answer\s+is\s*)?"
        r"|so[,\s]+(?:the\s+)?(?:answer\s+is\s*)?"
        r")(" + num_re + r")",
        re.IGNORECASE,
    )
    loose_hits = loose_phrase_re.findall(text)
    if loose_hits:
        try:
            return _clean(loose_hits[-1])
        except ValueError:
            pass

    # 6. Last 3 lines — final answer almost always at the very end
    tail = "\n".join(text.strip().splitlines()[-3:])
    tail_numbers = re.findall(r"(?<!\w)(" + num_re + r")(?!\w)", tail)
    if tail_numbers:
        try:
            return _clean(tail_numbers[-1])
        except ValueError:
            pass

    # 7. Last number in entire text — last resort
    numbers = re.findall(r"(?<!\w)(" + num_re + r")(?!\w)", text)
    if numbers:
        try:
            return _clean(numbers[-1])
        except ValueError:
            pass

    return None


async def extract_answer_via_llm(
    text: str,
    client: "AsyncOpenAI",
    fast_model: str,
) -> float | None:
    """Fallback: ask the fast model to extract the numeric answer."""
    prompt = (
        "Extract ONLY the final numeric answer from the math solution below. "
        "Reply with a single number and nothing else. "
        "If you cannot determine the answer, reply with 'NONE'.\n\n"
        f"Solution:\n{text}"
    )
    resp = await client.chat.completions.create(
        model=fast_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=20,
        temperature=0,
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw == "NONE":
        return None
    try:
        return _clean(raw)
    except ValueError:
        return None


def is_correct(predicted: float | None, ground_truth: float, tol: float = 1e-3) -> bool:
    if predicted is None:
        return False
    return abs(predicted - ground_truth) <= tol


# ── McNemar's test ────────────────────────────────────────────────────────────

def mcnemar_test(outcomes_a: list[bool], outcomes_b: list[bool]) -> dict[str, Any]:
    """
    McNemar's test with continuity correction (Dror et al., ACL 2018).
    Returns statistic, p_value, significant (α=0.05), and 2×2 table.
    """
    from scipy.stats import chi2  # type: ignore[import-untyped]

    assert len(outcomes_a) == len(outcomes_b), "Lists must be same length"

    both_correct  = sum(int(a and b)       for a, b in zip(outcomes_a, outcomes_b))
    a_only        = sum(int(a and not b)   for a, b in zip(outcomes_a, outcomes_b))
    b_only        = sum(int(not a and b)   for a, b in zip(outcomes_a, outcomes_b))
    both_wrong    = sum(int(not a and not b) for a, b in zip(outcomes_a, outcomes_b))

    b, c = a_only, b_only

    if b + c == 0:
        return {
            "statistic": 0.0,
            "p_value": 1.0,
            "significant": False,
            "table": {
                "both_correct": both_correct,
                "a_only": a_only,
                "b_only": b_only,
                "both_wrong": both_wrong,
            },
            "note": "No discordant pairs — models agree on every example.",
        }

    chi2_stat = float((abs(b - c) - 1) ** 2 / (b + c))
    p_value   = float(1 - chi2.cdf(chi2_stat, df=1))  # type: ignore[attr-defined]

    return {
        "statistic": round(chi2_stat, 4),
        "p_value": round(p_value, 4),
        "significant": p_value < 0.05,
        "table": {
            "both_correct": both_correct,
            "a_only": a_only,
            "b_only": b_only,
            "both_wrong": both_wrong,
        },
    }


def compute_mcnemar_matrix(
    correctness: dict[str, list[bool]],
) -> dict[str, dict[str, dict[str, Any] | None]]:
    methods = list(correctness)
    matrix: dict[str, dict[str, dict[str, Any] | None]] = {}
    for a in methods:
        matrix[a] = {}
        for b in methods:
            if a == b:
                matrix[a][b] = None
            else:
                matrix[a][b] = mcnemar_test(correctness[a], correctness[b])
    return matrix
