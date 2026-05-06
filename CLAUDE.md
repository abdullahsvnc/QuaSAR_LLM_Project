# QuaSAR Ablation Lab v2 — Claude Code Guide

NLP research project (Spring 2025) ablating the four QuaSAR reasoning stages on GSM8K, plus an algorithmic adversarial robustness suite and an original QuaSAR-SAP contribution.

## Stack

- **Backend**: FastAPI + Gemini via OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/`). OpenAI client also supported when `OPENAI_API_KEY` is set.
- **Frontend**: React + Vite + Recharts.
- **Dataset**: GSM8K test split (HuggingFace `gsm8k/main`).
- **Stat test**: McNemar with continuity correction.

## Backend layout

| File | Purpose |
|------|---------|
| `backend/methods.py` | 8-method registry: `standard`, `zeroshotcot`, `cot`, `quasar`, ablation variants `quasar_{1,2,3}` + `quasar_loo_{1..4}` + `quasar_iso_{1..4}`, contribution `quasar_sap`. |
| `backend/ablation.py` | Cumulative / LOO / Isolated analysis + `summarize_stage_divergence` (auto-narrative). |
| `backend/adversarial.py` | `numerical_swap`, `entity_swap`, `structural_swap` + `_is_linearly_scalable` (non-linear keyword guard). |
| `backend/evaluator.py` | Last-match answer extraction (`####`, `\boxed{}`, `**N**`, phrase-based) + McNemar. |
| `backend/cache.py` | SHA-256 disk cache. Key includes `PROMPT_VERSION`; bump it when prompts in `methods.py` change. |
| `backend/main.py` | FastAPI routes. |
| `backend/gsm8k_loader.py` | Cached HF dataset loader. `seed=42` reproducible; `seed=None` truly random. |

## Frontend pages

`/` Dashboard (auto-refresh) · `/compare` · `/batch` · `/adversarial` · `/ablation` (with StageDemoPanel + auto-narrative).

## Run commands

```bash
# Backend
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (other terminal)
cd frontend && npm run dev
# open http://localhost:5173
```

## Routes

- `GET  /api/methods`
- `GET  /api/cache/stats`
- `GET  /api/gsm8k/sample?n=5` (random by default; add `&seed=42` for reproducible)
- `POST /api/compare`            — single problem, all methods
- `POST /api/batch`              — batch eval + McNemar matrix
- `POST /api/adversarial`        — algorithmic perturbations + eval
- `POST /api/ablation/run`       — full QuaSAR ablation + divergence narrative
- `GET  /api/results`            — list saved runs
- `GET  /api/results/{run_id}`   — full run detail

## Gotchas

- **Cache version**: any edit to `methods.py` prompts → bump `PROMPT_VERSION` in `cache.py`. Old entries become unreachable (intended).
- **`quasar_1` ≡ `quasar_iso_1`** by construction (both are stages=(1,)). `ablation.py::CUMULATIVE_IDS` uses `quasar_iso_1` as the depth-1 source of truth — only one LLM call per problem.
- **Adversarial scoring**: only variants with `scoreable=True` enter ✓/✗ accuracy. Non-linear problems (`each`, `per`, `%`, `times`, `ratio`, …) trip `_is_linearly_scalable` and are surfaced in a "Skipped — not algebraically scoreable" section. `correct` is `null` (not `False`) for unscoreable items.
- **Token budgets**: QuaSAR/SAP `max_tokens=1400`; baselines `700` (`_max_tokens_for` in `main.py`).
- **Concurrency caps**: global semaphore (4), batch (3), ablation (2) to respect Gemini free-tier limits.
- **Default seed**: `42` for batch and ablation routes. `/api/gsm8k/sample` defaults to `seed=None` (random); pass `&seed=42` when reproducibility needed.

## References

- Ranaldi, Valentino & Freitas — *QuaSAR* (ACL 2025) [arXiv:2502.12616](https://arxiv.org/abs/2502.12616)
- Mirzadeh et al. — *GSM-Symbolic* (2024) [arXiv:2410.05229](https://arxiv.org/abs/2410.05229)
- Cobbe et al. — *GSM8K* (2021) [arXiv:2110.14168](https://arxiv.org/abs/2110.14168)
- Wei et al. — *Chain-of-Thought* (NeurIPS 2022) [arXiv:2201.11903](https://arxiv.org/abs/2201.11903)
- Kojima et al. — *Zero-Shot Reasoners* (NeurIPS 2022) [arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
- Dror et al. — *Statistical Significance in NLP* (ACL 2018)
