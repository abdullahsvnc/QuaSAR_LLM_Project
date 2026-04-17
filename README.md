# QuaSAR Ablation Lab v2

> NLP Project · Spring 2025  
> Mitigating Content-Induced Reasoning Bias in LLMs via Systematic Ablation of the QuaSAR Framework

---

## What's new in v2

- **Gemini API** — Uses `gemini-2.5-flash` / `gemini-2.5-flash-lite` via OpenAI-compatible endpoint (free tier available)
- **Response cache** — SHA-256 disk cache; repeat runs cost nothing
- **Algorithmic adversarial suite** — zero LLM calls for variant generation (numerical/entity/structural swap)
- **QuaSAR stage ablation** — dedicated tab evaluating depths 1–4 with marginal contribution + stage attribution
- **QuaSAR-SAP** — original contribution: system-level quasi-symbolic activation prior
- **6-shot CoT exemplars** — Wei et al. 2022 paper-faithful few-shot prompting
- **Compare history** — every Compare run saved and viewable in Dashboard
- **Dashboard auto-refresh** — loads latest results on page open

---

## Project Structure

```
quasar-lab/
├── backend/
│   ├── main.py           ← FastAPI app (all endpoints)
│   ├── methods.py        ← 8 prompting strategies (STD, ZS-CoT, CoT, QS-1..4, SAP)
│   ├── evaluator.py      ← answer extraction + McNemar's test
│   ├── gsm8k_loader.py   ← GSM8K dataset loader (HuggingFace)
│   ├── adversarial.py    ← algorithmic perturbation suite
│   ├── ablation.py       ← stage contribution analysis
│   ├── cache.py          ← SHA-256 disk cache
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── ComparePage.jsx      ← 4-panel comparison + summary table
        │   ├── BatchPage.jsx        ← batch evaluation + McNemar matrix
        │   ├── AdversarialPage.jsx  ← adversarial suite + robustness grid
        │   ├── AblationPage.jsx     ← QuaSAR stage ablation + SAP delta  ← NEW
        │   └── DashboardPage.jsx    ← auto-refresh, batch/compare/ablation views
        ├── components/
        │   └── MethodPanel.jsx      ← scrollable panel, ✓/✗ status, collapsible
        ├── api.js
        ├── App.jsx
        └── index.css
```

---

## Prompting Methods

| ID | Badge | Group | Reference |
|----|-------|-------|-----------|
| `standard` | STD | baseline | Direct question |
| `zeroshotcot` | ZS-CoT | baseline | Kojima et al., NeurIPS 2022 |
| `cot` | CoT | baseline | Wei et al., NeurIPS 2022 — 6-shot exemplars |
| `quasar` | QuaSAR | quasar | Ranaldi et al., ACL 2025 — full 4-stage |
| `quasar_1` | QS-1 | ablation | Stage 1 only (Abstraction) |
| `quasar_2` | QS-2 | ablation | Stages 1–2 (+ Formalisation) |
| `quasar_3` | QS-3 | ablation | Stages 1–3 (+ Explanation) |
| `quasar_sap` | SAP | contribution | **Original** — Structured Activation Priming |

---

## Setup

### 1. Get a Gemini API key (free)

Go to https://aistudio.google.com/app/apikey and create a key.

### 2. Backend

```bash
cd quasar-lab/backend

python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — add your GEMINI_API_KEY
```

### 3. Frontend

```bash
cd quasar-lab/frontend
npm install
```

---

## Running

Open **two terminals**:

```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open **http://localhost:5173**

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/methods` | List all 8 methods |
| GET | `/api/cache/stats` | Cache entry count and size |
| GET | `/api/gsm8k/sample?n=5` | Sample N problems from GSM8K |
| POST | `/api/compare` | Run methods on one problem (cached) |
| POST | `/api/batch` | Batch evaluation on N GSM8K problems |
| POST | `/api/adversarial` | Algorithmic adversarial suite + evaluation |
| POST | `/api/ablation/run` | QuaSAR stage ablation + SAP delta |
| GET | `/api/results` | List all saved runs |
| GET | `/api/results/{run_id}` | Full detail for a run |

---

## Adversarial Suite (algorithmic — no LLM)

| Type | Strategy | Answer |
|------|----------|--------|
| `numerical_swap` | All numbers × random factor ∈ {2,3,4,5,7,8,10} | `original × factor` |
| `entity_swap` | 50 names → Entity_A/B/C; 35 object nouns → neutral tokens | unchanged |
| `structural_swap` | Detect add/subtract verbs, invert operation | recomputed algebraically |

---

## References

- Ranaldi, Valentino & Freitas (2025). *ACL 2025.* [arXiv:2502.12616](https://arxiv.org/abs/2502.12616)
- Mirzadeh et al. (2024). *GSM-Symbolic.* [arXiv:2410.05229](https://arxiv.org/abs/2410.05229)
- Cobbe et al. (2021). *GSM8K.* [arXiv:2110.14168](https://arxiv.org/abs/2110.14168)
- Wei et al. (2022). *Chain-of-Thought.* [arXiv:2201.11903](https://arxiv.org/abs/2201.11903)
- Kojima et al. (2022). *Zero-Shot Reasoners.* [arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
- Turpin et al. (2023). *Unfaithful CoT.* [arXiv:2305.04388](https://arxiv.org/abs/2305.04388)
- Dror et al. (2018). *Statistical Significance in NLP.* ACL 2018.
