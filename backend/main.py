"""
QuaSAR Ablation Lab — FastAPI backend.

Uses Google Gemini via the OpenAI-compatible endpoint:
  https://generativelanguage.googleapis.com/v1beta/openai/

Endpoints:
  GET  /api/methods              — list all prompting methods
  GET  /api/cache/stats          — cache entry count and size
  POST /api/compare              — run methods on a single problem (cached)
  GET  /api/gsm8k/sample         — random problems from GSM8K
  POST /api/batch                — batch evaluation on N GSM8K problems
  POST /api/adversarial          — algorithmic adversarial suite + evaluation
  POST /api/ablation/run         — QuaSAR stage ablation on N problems
  GET  /api/results              — list all saved runs (batch + compare)
  GET  /api/results/{run_id}     — full detail for one run
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

from methods import METHODS, build_messages
from evaluator import (
    extract_answer,
    extract_answer_via_llm,
    is_correct,
    compute_mcnemar_matrix,
)
from gsm8k_loader import load_problems
from adversarial import generate_all_variants
from ablation import (
    compute_ablation_analysis,
    compute_sap_delta,
    ablation_method_ids,
)
import cache as response_cache

# ── Config ────────────────────────────────────────────────────────────────────

MODEL      = os.getenv("MODEL",      "gpt-4o-mini")
FAST_MODEL = os.getenv("FAST_MODEL", "gpt-4o-mini")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"

_gemini_client = AsyncOpenAI(api_key=GEMINI_API_KEY or "missing", base_url=_GEMINI_BASE) if GEMINI_API_KEY else None
_openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
# Ollama exposes an OpenAI-compatible API at :11434/v1. Always available
# (model loading is lazy on the daemon side); errors surface at call time.
_ollama_client = AsyncOpenAI(api_key="ollama", base_url=OLLAMA_BASE_URL)


def _provider_for(model_name: str) -> str:
    m = model_name.lower()
    if m.startswith(("ollama/", "local/")):
        return "ollama"
    if m.startswith("gemini"):
        return "gemini"
    # gpt-*, o*, chatgpt-* all live on the OpenAI endpoint
    return "openai"


def _bare_model_id(model_name: str) -> str:
    """Strip provider prefix before sending to the API (`ollama/llama3.1:8b` → `llama3.1:8b`)."""
    if "/" in model_name and model_name.split("/", 1)[0].lower() in ("ollama", "local"):
        return model_name.split("/", 1)[1]
    return model_name


def _client_for(model_name: str) -> AsyncOpenAI:
    provider = _provider_for(model_name)
    if provider == "ollama":
        return _ollama_client
    if provider == "gemini":
        if _gemini_client is None:
            raise HTTPException(500, "GEMINI_API_KEY is not set in backend/.env")
        return _gemini_client
    if _openai_client is None:
        raise HTTPException(500, "OPENAI_API_KEY is not set in backend/.env")
    return _openai_client

RESULTS_DIR = Path("./results")
RESULTS_DIR.mkdir(exist_ok=True)

COMPARE_DIR = Path("./compare_results")
COMPARE_DIR.mkdir(exist_ok=True)

app = FastAPI(title="QuaSAR Ablation Lab", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────

class CompareRequest(BaseModel):
    problem: str
    methods: list[str] = ["standard", "zeroshotcot", "cot", "quasar"]
    model: str | None = None
    ground_truth: float | None = None

class BatchRequest(BaseModel):
    n: int = 20
    methods: list[str] = ["standard", "zeroshotcot", "cot", "quasar"]
    split: str = "test"
    seed: int = 42
    model: str | None = None

class AdversarialRequest(BaseModel):
    problem: str
    answer: float
    methods: list[str] = ["standard", "zeroshotcot", "cot", "quasar"]
    types: list[str] = ["numerical_swap", "entity_swap", "structural_swap"]
    model: str | None = None

class AdversarialBatchRequest(BaseModel):
    n: int = 30
    split: str = "test"
    seed: int = 42
    methods: list[str] = ["standard", "zeroshotcot", "cot", "quasar"]
    types: list[str] = ["numerical_swap", "entity_swap", "structural_swap"]
    model: str | None = None

class AblationRequest(BaseModel):
    n: int = 20
    split: str = "test"
    seed: int = 42
    include_sap: bool = True
    model: str | None = None

# ── Core inference ────────────────────────────────────────────────────────────

# Token budgets. QuaSAR's full 4-stage output is verbose: predicates,
# formalisation, step-by-step explanation, then the final answer. Paper
# Appendix I uses max_tokens=3500. Truncation mid-Explanation silently
# corrupts the answer, so we match the paper here. Baselines get a
# smaller (but still generous) budget.
_MAX_TOKENS_QUASAR   = 3500
_MAX_TOKENS_BASELINE = 1024

_RETRY_ATTEMPTS = 4
_RETRY_BASE_DELAY = 1.5  # seconds; doubles each attempt

# Per-provider concurrency caps. Free-tier API keys have aggressive
# per-minute quotas; local Ollama is GPU-bound and goes serial.
_PROVIDER_SEMS: dict[str, asyncio.Semaphore] = {
    "openai": asyncio.Semaphore(4),
    "gemini": asyncio.Semaphore(4),
    "ollama": asyncio.Semaphore(1),
}


def _sem_for(model_name: str) -> asyncio.Semaphore:
    return _PROVIDER_SEMS[_provider_for(model_name)]


def _max_tokens_for(method_id: str) -> int:
    return _MAX_TOKENS_QUASAR if method_id.startswith("quasar") else _MAX_TOKENS_BASELINE


async def run_single(method_id: str, problem: str, mdl: str) -> dict[str, Any]:
    """Run one method on one problem. Checks cache first; retries on transient errors."""

    cached = response_cache.get(method_id, problem, mdl)
    if cached:
        return {**cached, "cache_hit": True}

    messages = build_messages(method_id, problem)
    t0 = time.perf_counter()

    client = _client_for(mdl)
    api_model = _bare_model_id(mdl)
    sem = _sem_for(mdl)

    last_err: BaseException | None = None
    resp = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            async with sem:
                resp = await client.chat.completions.create(
                    model=api_model,
                    messages=messages,  # type: ignore[arg-type]
                    max_tokens=_max_tokens_for(method_id),
                    temperature=0,
                )
            break
        except Exception as e:  # rate-limit, 5xx, transient network
            last_err = e
            msg = str(e).lower()
            transient = (
                "rate" in msg or "quota" in msg or "429" in msg
                or "timeout" in msg or "503" in msg or "unavailable" in msg
                or "overload" in msg or "exhaust" in msg
            )
            if attempt == _RETRY_ATTEMPTS - 1 or not transient:
                raise
            await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** attempt))
    assert resp is not None, last_err

    elapsed = round((time.perf_counter() - t0) * 1000)
    content = resp.choices[0].message.content or ""
    text = content.strip()

    extracted = extract_answer(text)
    if extracted is None and text:
        extracted = await extract_answer_via_llm(text, _client_for(FAST_MODEL), FAST_MODEL)

    result: dict[str, Any] = {
        "method_id": method_id,
        "text": text,
        "extracted_answer": extracted,
        "time_ms": elapsed,
        "tokens": resp.usage.total_tokens if resp.usage else None,
        "cache_hit": False,
    }

    response_cache.put(method_id, problem, mdl, result)
    return result

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/methods")
def list_methods() -> dict[str, Any]:
    safe_keys = {"id", "name", "badge", "color", "group", "description"}
    return {
        "methods": [
            {k: v for k, v in m.items() if k in safe_keys}
            for m in METHODS.values()
        ]
    }


@app.get("/api/cache/stats")
def cache_stats() -> dict[str, int]:
    return response_cache.stats()


@app.get("/api/gsm8k/sample")
def gsm8k_sample(n: int = 5, split: str = "test", seed: int | None = None) -> dict[str, Any]:
    """Truly random by default. Pass seed=42 for reproducible sampling."""
    try:
        problems = load_problems(split=split, n=n, seed=seed)
        return {"problems": problems, "total": len(problems)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/compare")
async def compare(req: CompareRequest) -> dict[str, Any]:
    """Run all requested methods on a single problem in parallel."""
    mdl = req.model or MODEL
    tasks = [run_single(m, req.problem, mdl) for m in req.methods]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    output: dict[str, Any] = {}
    # YENİ
    for method_id, r in zip(req.methods, raw_results):
        if isinstance(r, BaseException):
            output[method_id] = {"method_id": method_id, "error": str(r),
                                "text": None, "extracted_answer": None}
        else:
            result_dict = dict(r)
            mid = result_dict.get("method_id", method_id)
            if req.ground_truth is not None:
                result_dict["correct"] = is_correct(
                    result_dict.get("extracted_answer"), req.ground_truth
                )
            output[mid] = result_dict

    # Persist compare result for dashboard
    run_id = f"cmp_{str(uuid.uuid4())[:8]}"
    payload: dict[str, Any] = {
        "run_id": run_id,
        "type": "compare",
        "problem": req.problem,
        "ground_truth": req.ground_truth,
        "model": mdl,
        "timestamp": time.time(),
        "methods": req.methods,
        "results": output,
    }
    (COMPARE_DIR / f"{run_id}.json").write_text(json.dumps(payload, indent=2))

    return {"run_id": run_id, "results": output, "model": mdl}


@app.post("/api/batch")
async def batch_evaluate(req: BatchRequest) -> dict[str, Any]:
    """Batch evaluation on N GSM8K problems."""
    mdl = req.model or MODEL

    try:
        problems = load_problems(split=req.split, n=req.n, seed=req.seed)
    except Exception as e:
        raise HTTPException(500, f"Failed to load GSM8K: {e}")

    sem = asyncio.Semaphore(3)

    async def run_problem(prob: dict[str, Any]) -> dict[str, Any]:
        async with sem:
            tasks = [run_single(m, prob["question"], mdl) for m in req.methods]
            method_results = await asyncio.gather(*tasks, return_exceptions=True)
            out: dict[str, Any] = {"problem": prob, "methods": {}}
            for mid, r in zip(req.methods, method_results):
                if isinstance(r, BaseException):
                    out["methods"][mid] = {
                        "method_id": mid, "error": str(r),
                        "text": None, "extracted_answer": None, "correct": False,
                    }
                    continue
                rd = dict(r)
                rd["correct"] = is_correct(rd.get("extracted_answer"), prob["numeric_answer"])
                out["methods"][rd["method_id"]] = rd
            return out

    all_results = await asyncio.gather(*[run_problem(p) for p in problems])

    # Accuracy + McNemar
    correctness: dict[str, list[bool]] = {m: [] for m in req.methods}
    for pr in all_results:
        for m in req.methods:
            correctness[m].append(bool(pr["methods"].get(m, {}).get("correct", False)))

    accuracy = {
        m: {
            "accuracy": round(sum(v) / len(v), 4) if v else 0,
            "correct": sum(v),
            "total": len(v),
        }
        for m, v in correctness.items()
    }

    mcnemar = compute_mcnemar_matrix(correctness)

    run_id = str(uuid.uuid4())[:8]
    payload: dict[str, Any] = {
        "run_id": run_id,
        "type": "batch",
        "config": {
            "model": mdl, "n": req.n, "split": req.split, "seed": req.seed,
            "methods": req.methods,
            "prompt_version": response_cache.PROMPT_VERSION,
            "provider": _provider_for(mdl),
        },
        "accuracy": accuracy,
        "mcnemar": mcnemar,
        "problems": list(all_results),
        "timestamp": time.time(),
    }
    (RESULTS_DIR / f"{run_id}.json").write_text(json.dumps(payload, indent=2))

    return {"run_id": run_id, "accuracy": accuracy, "mcnemar": mcnemar, "n_problems": len(all_results)}


@app.post("/api/adversarial")
async def adversarial_evaluate(req: AdversarialRequest) -> dict[str, Any]:
    """Algorithmic adversarial suite — zero LLM calls for variant generation.

    Variants without a derivable ground-truth answer (scoreable=False) are
    still run through the LLM so the user can inspect outputs, but they are
    excluded from accuracy aggregation — `correct` is set to None for them.
    """
    mdl = req.model or MODEL

    # Generate variants algorithmically (no LLM cost)
    variants = generate_all_variants(
        problem=req.problem,
        answer=req.answer,
        types=req.types,
    )

    all_problems: list[dict[str, Any]] = [
        {
            "type": "original", "label": "Original",
            "problem": req.problem, "answer": req.answer,
            "scoreable": True, "reliability_reason": None,
        }
    ] + [
        {
            "type": v["type"], "label": v["label"],
            "problem": v["variant"], "answer": v.get("answer"),
            "scoreable": bool(v.get("scoreable", v.get("reliable", False))),
            "reliability_reason": v.get("reliability_reason"),
        }
        for v in variants
    ]

    sem = asyncio.Semaphore(3)

    async def eval_problem(prob_meta: dict[str, Any]) -> dict[str, Any]:
        async with sem:
            tasks = [run_single(m, prob_meta["problem"], mdl) for m in req.methods]
            method_results = await asyncio.gather(*tasks, return_exceptions=True)
            out: dict[str, Any] = {
                "type": prob_meta["type"],
                "label": prob_meta["label"],
                "problem": prob_meta["problem"],
                "ground_truth": prob_meta["answer"],
                "scoreable": prob_meta["scoreable"],
                "reliability_reason": prob_meta["reliability_reason"],
                "methods": {},
            }
            for mid, r in zip(req.methods, method_results):
                if isinstance(r, BaseException):
                    out["methods"][mid] = {
                        "method_id": mid, "error": str(r),
                        "text": None, "extracted_answer": None, "correct": None,
                    }
                    continue
                rd = dict(r)
                if prob_meta["scoreable"] and prob_meta["answer"] is not None:
                    rd["correct"] = is_correct(rd.get("extracted_answer"), prob_meta["answer"])
                else:
                    rd["correct"] = None
                out["methods"][rd["method_id"]] = rd
            return out

    eval_results = await asyncio.gather(*[eval_problem(p) for p in all_problems])

    return {
        "variants": variants,
        "evaluation": list(eval_results),
        "model": mdl,
    }


@app.post("/api/adversarial/batch")
async def adversarial_batch(req: AdversarialBatchRequest) -> dict[str, Any]:
    """Aggregate robustness over N GSM8K problems × methods × perturbation types.

    For each sampled problem we:
      1. Generate algorithmic perturbations (numerical_swap, entity_swap,
         structural_swap) via `generate_all_variants` — zero LLM calls.
      2. Run each method on the original AND each scoreable perturbation.
      3. Aggregate accuracy per method × variant_type and compute the
         per-method `avg_drop_pp` = original_acc - mean(perturbed_acc).

    This is the GSM-Symbolic-style robustness analog of the paper's Table 4.
    """
    mdl = req.model or MODEL

    try:
        problems = load_problems(split=req.split, n=req.n, seed=req.seed)
    except Exception as e:
        raise HTTPException(500, f"Failed to load GSM8K: {e}")

    sem = asyncio.Semaphore(2)

    async def run_one(prob: dict[str, Any]) -> dict[str, Any]:
        """Build (original + each scoreable variant) and evaluate every method on each."""
        gt = prob["numeric_answer"]
        variants = generate_all_variants(
            problem=prob["question"], answer=gt, types=req.types,
        )
        # per-variant blocks: type label + text + ground truth + scoreable flag
        all_variants: list[dict[str, Any]] = [{
            "type": "original", "text": prob["question"], "answer": gt, "scoreable": True,
        }]
        for v in variants:
            all_variants.append({
                "type": v["type"],
                "text":  v["variant"],
                "answer": v.get("answer"),
                "scoreable": bool(v.get("scoreable", v.get("reliable", False))),
            })

        async with sem:
            tasks = [
                run_single(m, var["text"], mdl)
                for var in all_variants for m in req.methods
            ]
            method_results = await asyncio.gather(*tasks, return_exceptions=True)

        # walk back through (variant, method) order
        per_variant: dict[str, dict[str, Any]] = {}
        idx = 0
        for var in all_variants:
            mblock: dict[str, Any] = {}
            for m in req.methods:
                r = method_results[idx]; idx += 1
                if isinstance(r, BaseException):
                    mblock[m] = {"correct": None, "error": str(r)}
                    continue
                rd = dict(r)
                if var["scoreable"] and var["answer"] is not None:
                    rd["correct"] = is_correct(rd.get("extracted_answer"), var["answer"])
                else:
                    rd["correct"] = None
                mblock[m] = rd
            per_variant[var["type"]] = {
                "scoreable": var["scoreable"],
                "ground_truth": var["answer"],
                "methods": mblock,
            }

        return {"problem_id": prob.get("id"), "question": prob["question"], "variants": per_variant}

    rows = await asyncio.gather(*[run_one(p) for p in problems])

    # Aggregate: for each method × variant_type, count correct/scoreable
    variant_types = ["original"] + list(req.types)
    method_robustness: dict[str, dict[str, Any]] = {}
    n_scoreable: dict[str, int] = {t: 0 for t in variant_types}

    # First pass: count scoreable problems per type
    for row in rows:
        for t in variant_types:
            if t in row["variants"] and row["variants"][t]["scoreable"]:
                n_scoreable[t] += 1

    for m in req.methods:
        per_type: dict[str, float | None] = {}
        for t in variant_types:
            correct = 0; total = 0
            for row in rows:
                v = row["variants"].get(t)
                if not v or not v["scoreable"]:
                    continue
                c = v["methods"].get(m, {}).get("correct")
                if c is None:
                    continue
                total += 1
                correct += int(bool(c))
            per_type[t] = round(correct / total, 4) if total else None

        # avg drop = original - mean(perturbed accuracies that exist)
        orig = per_type.get("original")
        perturbed = [per_type[t] for t in req.types if per_type.get(t) is not None]
        if orig is not None and perturbed:
            avg_drop_pp = round(100 * (orig - sum(perturbed) / len(perturbed)), 2)
        else:
            avg_drop_pp = None

        method_robustness[m] = {**per_type, "avg_drop_pp": avg_drop_pp}

    run_id = str(uuid.uuid4())[:8]
    payload: dict[str, Any] = {
        "run_id": run_id,
        "type": "adversarial_batch",
        "config": {
            "model": mdl, "n": req.n, "split": req.split, "seed": req.seed,
            "methods": req.methods, "types": req.types,
            "prompt_version": response_cache.PROMPT_VERSION,
            "provider": _provider_for(mdl),
        },
        "method_robustness": method_robustness,
        "n_scoreable_per_type": n_scoreable,
        "problems": list(rows),
        "timestamp": time.time(),
    }
    (RESULTS_DIR / f"{run_id}.json").write_text(json.dumps(payload, indent=2))

    return {
        "run_id": run_id,
        "method_robustness": method_robustness,
        "n_scoreable_per_type": n_scoreable,
        "n_problems": len(rows),
    }


@app.post("/api/ablation/run")
async def run_ablation(req: AblationRequest) -> dict[str, Any]:
    """
    Run QuaSAR stage ablation analysis on N GSM8K problems.
    Evaluates cumulative (quasar_1..quasar), leave-one-out (quasar_loo_1..4)
    and isolated (quasar_iso_1..4) stage subsets — optionally + quasar_sap.
    """
    mdl = req.model or MODEL
    ablation_methods = list(ablation_method_ids())
    if req.include_sap:
        ablation_methods.append("quasar_sap")

    try:
        problems = load_problems(split=req.split, n=req.n, seed=req.seed)
    except Exception as e:
        raise HTTPException(500, f"Failed to load GSM8K: {e}")

    # Ablation runs ~12–13 methods per problem — keep concurrency modest so
    # Gemini's free-tier rate limit doesn't start rejecting calls.
    sem = asyncio.Semaphore(2)

    async def run_problem(prob: dict[str, Any]) -> dict[str, Any]:
        async with sem:
            tasks = [run_single(m, prob["question"], mdl) for m in ablation_methods]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            out: dict[str, Any] = {"problem": prob, "methods": {}}
            errors: dict[str, str] = {}
            for mid, r in zip(ablation_methods, results):
                if isinstance(r, BaseException):
                    errors[mid] = str(r)
                    out["methods"][mid] = {
                        "method_id": mid, "error": str(r),
                        "text": None, "extracted_answer": None, "correct": False,
                    }
                    continue
                rd = dict(r)
                rd["correct"] = is_correct(rd.get("extracted_answer"), prob["numeric_answer"])
                out["methods"][rd["method_id"]] = rd
            if errors:
                out["errors"] = errors
            return out

    all_results = await asyncio.gather(*[run_problem(p) for p in problems])

    analysis = compute_ablation_analysis(list(all_results))
    sap_delta = compute_sap_delta(list(all_results)) if req.include_sap else {}

    run_id = f"abl_{str(uuid.uuid4())[:8]}"
    payload: dict[str, Any] = {
        "run_id": run_id,
        "type": "ablation",
        "config": {
            "model": mdl, "n": req.n, "split": req.split, "seed": req.seed,
            "include_sap": req.include_sap,
            "prompt_version": response_cache.PROMPT_VERSION,
            "provider": _provider_for(mdl),
        },
        "analysis": analysis,
        "sap_delta": sap_delta,
        "problems": list(all_results),
        "timestamp": time.time(),
    }
    (RESULTS_DIR / f"{run_id}.json").write_text(json.dumps(payload, indent=2))

    return {"run_id": run_id, "analysis": analysis, "sap_delta": sap_delta, "n_problems": len(all_results)}


@app.get("/api/results")
def list_results() -> dict[str, list[dict[str, Any]]]:
    runs: list[dict[str, Any]] = []

    # Batch + ablation runs
    for f in sorted(RESULTS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data: dict[str, Any] = json.loads(f.read_text())
            entry: dict[str, Any] = {
                "run_id":    data.get("run_id"),
                "type":      data.get("type", "batch"),
                "timestamp": data.get("timestamp"),
            }
            if data.get("type") == "ablation":
                entry["config"] = data.get("config")
                entry["analysis_summary"] = {
                    k: v for k, v in data.get("analysis", {}).items()
                    if k in (
                        "cumulative_accuracy",
                        "cumulative_marginal",
                        "loo_contribution",
                        "isolated_accuracy",
                        "full_accuracy",
                    )
                }
            else:
                entry["config"]   = data.get("config")
                entry["accuracy"] = data.get("accuracy")
            runs.append(entry)
        except Exception:
            pass

    # Compare runs
    for f in sorted(COMPARE_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
            runs.append({
                "run_id":       data.get("run_id"),
                "type":         "compare",
                "timestamp":    data.get("timestamp"),
                "problem":      (data.get("problem") or "")[:80],
                "ground_truth": data.get("ground_truth"),
                "model":        data.get("model"),
                "methods":      data.get("methods"),
            })
        except Exception:
            pass

    # Sort by timestamp descending
    runs.sort(key=lambda r: r.get("timestamp") or 0, reverse=True)
    return {"runs": runs}


@app.get("/api/results/{run_id}")
def get_result(run_id: str) -> dict[str, Any]:
    # Check both directories
    for directory in [RESULTS_DIR, COMPARE_DIR]:
        path = directory / f"{run_id}.json"
        if path.exists():
            return json.loads(path.read_text())  # type: ignore[return-value]
    raise HTTPException(404, f"Run '{run_id}' not found")
