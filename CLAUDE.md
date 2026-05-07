# QuaSAR Ablation Lab v2 — Claude Code Guide

NLP research project (Spring 2025) ablating the four QuaSAR reasoning stages on GSM8K, plus an algorithmic adversarial robustness suite and an original QuaSAR-SAP contribution.

## Stack

- **Backend**: FastAPI + 3 OpenAI-compatible providers:
  - **Gemini** at `generativelanguage.googleapis.com/v1beta/openai/` (`GEMINI_API_KEY`)
  - **OpenAI** standard endpoint (`OPENAI_API_KEY`)
  - **Ollama** local at `localhost:11434/v1` — model ids prefixed with `ollama/` (e.g. `ollama/llama3.1:8b`)
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
- `POST /api/adversarial`        — algorithmic perturbations on a single problem
- `POST /api/adversarial/batch`  — aggregate robustness over N problems × methods × types (paper Table-4 analog)
- `POST /api/ablation/run`       — full QuaSAR ablation + divergence narrative + LOO/SAP McNemar
- `GET  /api/results`            — list saved runs
- `GET  /api/results/{run_id}`   — full run detail

## Gotchas

- **Cache version**: any edit to `methods.py` prompts → bump `PROMPT_VERSION` in `cache.py`. Currently `v3` (paper-faithful prompt). Old entries become unreachable (intended).
- **`quasar_1` ≡ `quasar_iso_1`** by construction (both are stages=(1,)). `ablation.py::CUMULATIVE_IDS` uses `quasar_iso_1` as the depth-1 source of truth — only one LLM call per problem.
- **Adversarial scoring**: only variants with `scoreable=True` enter ✓/✗ accuracy. Non-linear problems (`each`, `per`, `%`, `times`, `ratio`, …) trip `_is_linearly_scalable` and are surfaced in a "Skipped — not algebraically scoreable" section. `correct` is `null` (not `False`) for unscoreable items.
- **Token budgets**: QuaSAR/SAP `max_tokens=3500` (paper Appendix I); baselines `1024` (`_max_tokens_for` in `main.py`). Truncation mid-Explanation silently corrupts answers.
- **Answer markers**: QuaSAR/SAP emit "The answer is: N" (paper §2.1.4); CoT exemplars (Wei 2022) emit `#### N`. `evaluator.extract_answer` checks both — strict "the answer is" first, `####` second.
- **Concurrency caps**: per-provider — `openai`/`gemini`=4, `ollama`=1 (local GPU is serial). Batch route adds its own per-problem cap.
- **Default seed**: `42` for batch and ablation routes. `/api/gsm8k/sample` defaults to `seed=None` (random); pass `&seed=42` when reproducibility needed.

## Local Free Models (Ollama)

Paper's models (Llama-3-8B / Qwen2-7B) run locally for free if Ollama is installed.

```bash
brew install ollama          # macOS
ollama serve &               # daemon at :11434
ollama pull llama3.1:8b      # ~4.7 GB
ollama pull qwen2.5:7b       # ~4.4 GB
ollama pull qwen2.5:1.5b     # ~1 GB
```

Then in the UI's model dropdown pick `ollama/llama3.1:8b` etc. Concurrency is forced to 1; batch n=50 ablation can take 30-60 min on Apple Silicon.

## Experiment Recipe

After editing `methods.py` prompts, run `cd backend && rm -rf cache/` once to drop stale entries. Then:

```bash
# E1 — accuracy story (paper Table 1/2 replication)
for m in gemini-2.5-flash-lite gemini-2.5-flash ollama/llama3.1:8b; do
  curl -X POST localhost:8000/api/batch \
    -H 'content-type: application/json' \
    -d "{\"n\":100,\"seed\":42,\"model\":\"$m\",\"methods\":[\"standard\",\"zeroshotcot\",\"cot\",\"quasar\"]}"
done
# Expected: QuaSAR ≤ CoT on smaller models — paper §4.1 confirms this; Finding F1.

# E2 — robustness story (paper Table 4 analog) — THE HEADLINE
curl -X POST localhost:8000/api/adversarial/batch \
  -d '{"n":50,"seed":42,"model":"ollama/llama3.1:8b","methods":["standard","zeroshotcot","cot","quasar"]}'
# Expected: QuaSAR.avg_drop_pp < CoT.avg_drop_pp; Finding F2.

# E3 — stage attribution (original to this project)
curl -X POST localhost:8000/api/ablation/run \
  -d '{"n":50,"seed":42,"model":"ollama/llama3.1:8b","include_sap":true}'
# Yields per-stage LOO McNemar p-values + SAP p-value; Finding F3.
```

## References

- Ranaldi, Valentino & Freitas — *QuaSAR* (ACL 2025) [arXiv:2502.12616](https://arxiv.org/abs/2502.12616)
- Mirzadeh et al. — *GSM-Symbolic* (2024) [arXiv:2410.05229](https://arxiv.org/abs/2410.05229)
- Cobbe et al. — *GSM8K* (2021) [arXiv:2110.14168](https://arxiv.org/abs/2110.14168)
- Wei et al. — *Chain-of-Thought* (NeurIPS 2022) [arXiv:2201.11903](https://arxiv.org/abs/2201.11903)
- Kojima et al. — *Zero-Shot Reasoners* (NeurIPS 2022) [arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
- Dror et al. — *Statistical Significance in NLP* (ACL 2018)
