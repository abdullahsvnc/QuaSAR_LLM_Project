# QuaSAR Ablation Lab

> **Decomposing Quasi-Symbolic Reasoning: Stage-Level Ablation and Adversarial Robustness of QuaSAR**
> LLM Course Final Project — 2026
>
> Abdullah Sevinç (20220808013) · Ahmet Melih Bostancıeri (20220808063)

**📖 Languages:** [🇹🇷 Türkçe](#-türkçe) · [🇬🇧 English](#-english)

---

## 🇹🇷 Türkçe

### Proje Özeti

Büyük Dil Modelleri (LLM'ler), aynı matematik problemine sayılar veya isimler değiştirildiğinde farklı cevaplar verebiliyor. Bu duruma **content-induced reasoning bias** (içerik kaynaklı akıl yürütme yanlılığı) deniyor. Bu proje:

1. **QuaSAR** (Ranaldi et al., 2025) dört aşamalı çerçevesini GSM8K üzerinde yeniden inşa eder
   (*Abstraction → Formalisation → Explanation → Answering*).
2. Üç tip **adversarial** varyant ile robustluğu ölçer: **numerical**, **entity**, **structural swap**.
3. QuaSAR'ın hangi aşamasının gerçekten işe yaradığını anlamak için **Cumulative / Leave-One-Out / Isolated** ablasyon yapar.
4. Kendi katkımız olan **QuaSAR-SAP**'ı (System-level Activation Prior) sunar — dört aşama fikri user prompt yerine system prompt'a taşınır.

Tümü **FastAPI + React** tabanlı küçük bir web uygulamasında çalışır.

### Ana Bulgular (`gpt-4o-mini`, n=50, seed=42)

#### E1 — Temiz GSM8K Doğruluğu

| Yöntem | Doğruluk |
|---|---|
| Standard | **92.0%** |
| Zero-Shot CoT | 90.0% |
| CoT (6-shot) | 88.0% |
| QuaSAR (full) | 86.0% |

Küçük modellerde QuaSAR temiz problemde en iyi değil — orijinal makale de aynı şeyi söylüyor.

#### E2 — Adversarial Robustluk

| Yöntem | Original | Num. swap | Entity swap | **Struct. swap** | Avg. drop |
|---|---|---|---|---|---|
| Standard | 92.0% | 62.5% | 88.2% | 71.4% | −17.9 pp |
| Zero-Shot CoT | 90.0% | 62.5% | 88.2% | 71.4% | −15.9 pp |
| CoT (6-shot) | 88.0% | 62.5% | 91.2% | 71.4% | −13.0 pp |
| **QuaSAR (full)** | 86.0% | 62.5% | 82.3% | **73.5%** | −13.2 pp |

QuaSAR'ın net kazandığı yer **structural swap** (operasyon flipi) — yapı değiştiğinde dört aşama modelin eski aritmetiği kopyalamasını engelliyor.

#### E3 — Aşama Düzeyinde Ablasyon

| Aşama | Cumulative | Cum. Δ | LOO Acc | LOO Δ | Isolated |
|---|---|---|---|---|---|
| 1. Abstraction | 4.0% | +4.0 pp | 82.0% | +4.0 pp | 4.0% |
| **2. Formalisation** | 74.0% | **+70.0 pp** | 82.0% | +4.0 pp | 80.0% |
| 3. Explanation | 82.0% | +8.0 pp | 86.0% | 0.0 pp | 82.0% |
| 4. Answering | 86.0% | +4.0 pp | 82.0% | +4.0 pp | 94.0% |

**Formalisation** (denklemi yazma) gerçek işi yapan aşama — model denklemi yazınca doğruluk %4 → %74'e fırlıyor.

#### E4 — QuaSAR-SAP (Bizim Katkımız)

SAP, %82.0 vs full QuaSAR %86.0 (Δ = −4.0 pp; McNemar p = 0.68). Küçük bir doğruluk kaybı karşılığında **çok daha az token** kullanıyor — bütçe sıkışıkken ucuz bir alternatif.

### Adversarial Suite (LLM çağrısı yok, tamamen algoritmik)

| Tip | Strateji | Cevap |
|---|---|---|
| `numerical_swap` | Tüm sayılar × rastgele faktör ∈ {2,3,4,5,7,8,10} | `original × factor` |
| `entity_swap` | 50 isim → Entity_A/B/C; 35 nesne → nötr token | değişmez |
| `structural_swap` | add/subtract fiil tespiti, operasyon ters çevrilir | cebirsel olarak yeniden hesaplanır |

Numerical swap yalnızca cebirsel olarak ölçeklenebilir problemlere uygulanır (`each`, `per`, `%`, `times`, `ratio` içeren non-linear problemler atlanır).

### Prompting Yöntemleri

| ID | Badge | Grup | Referans |
|----|-------|------|----------|
| `standard` | STD | baseline | Direkt soru |
| `zeroshotcot` | ZS-CoT | baseline | Kojima et al., NeurIPS 2022 |
| `cot` | CoT | baseline | Wei et al., NeurIPS 2022 — 6-shot |
| `quasar` | QuaSAR | quasar | Ranaldi et al., ACL 2025 — full 4-stage |
| `quasar_{1,2,3}` | QS-* | ablation | Cumulative depth |
| `quasar_loo_{1..4}` | LOO-* | ablation | Leave-One-Out |
| `quasar_iso_{1..4}` | ISO-* | ablation | Isolated stage |
| `quasar_sap` | SAP | **katkı** | System-level Activation Prior |

### Kurulum

#### 1. API Anahtarı

Üç farklı sağlayıcı destekleniyor:

- **Gemini** (ücretsiz tier): https://aistudio.google.com/app/apikey → `GEMINI_API_KEY`
- **OpenAI**: `OPENAI_API_KEY`
- **Ollama** (yerel/ücretsiz): `ollama serve` çalışıyor olmalı; model id `ollama/llama3.1:8b` formatında

#### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # API key'leri ekle
```

#### 3. Frontend

```bash
cd frontend
npm install
```

#### 4. Çalıştırma (iki terminal)

```bash
# Terminal 1
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend
npm run dev
```

Tarayıcı: **http://localhost:5173**

### Kısıtlar

- **n = 50** McNemar için küçük; özellikle numerical swap'ta yalnızca 50 problemden 8'i lineerlik kontrolünü geçti.
- **Bütçe**: QuaSAR çağrısı normal çağrıdan ~3× daha fazla token harcıyor; ücretsiz API limitleri hızla doluyor.
- **rsLoRA fine-tuning** orijinal proposal'da vardı, GPU yetersizliği nedeniyle kapsam dışı bırakıldı.
- **Llama-3-8B** yerel run'ı çalışıyor ama n=20 için ~5 saat sürüyor — appendix sanity-check olarak tutuldu.

---

## 🇬🇧 English

### Project Overview

Large Language Models (LLMs) sometimes give different answers to the same math problem when small things like numbers or names are changed. This is called **content-induced reasoning bias**. This project:

1. Re-builds the four-stage **QuaSAR** framework (Ranaldi et al., 2025) on GSM8K
   (*Abstraction → Formalisation → Explanation → Answering*).
2. Measures robustness using three **adversarial** variants: **numerical**, **entity**, **structural swap**.
3. Performs **Cumulative / Leave-One-Out / Isolated** ablation to find which QuaSAR stage really matters.
4. Introduces our own contribution **QuaSAR-SAP** (System-level Activation Prior) — the four-stage idea is moved into the system prompt instead of the user prompt.

Everything runs in a small **FastAPI + React** web application.

### Main Findings (`gpt-4o-mini`, n=50, seed=42)

#### E1 — Clean GSM8K Accuracy

| Method | Accuracy |
|---|---|
| Standard | **92.0%** |
| Zero-Shot CoT | 90.0% |
| CoT (6-shot) | 88.0% |
| QuaSAR (full) | 86.0% |

On smaller models, QuaSAR is not the best on clean problems — the original paper reports the same.

#### E2 — Adversarial Robustness

| Method | Original | Num. swap | Entity swap | **Struct. swap** | Avg. drop |
|---|---|---|---|---|---|
| Standard | 92.0% | 62.5% | 88.2% | 71.4% | −17.9 pp |
| Zero-Shot CoT | 90.0% | 62.5% | 88.2% | 71.4% | −15.9 pp |
| CoT (6-shot) | 88.0% | 62.5% | 91.2% | 71.4% | −13.0 pp |
| **QuaSAR (full)** | 86.0% | 62.5% | 82.3% | **73.5%** | −13.2 pp |

QuaSAR's clear win is on **structural swap** (operation flip) — when the structure changes, the four stages prevent the model from copying the old arithmetic.

#### E3 — Stage-Level Ablation

| Stage | Cumulative | Cum. Δ | LOO Acc | LOO Δ | Isolated |
|---|---|---|---|---|---|
| 1. Abstraction | 4.0% | +4.0 pp | 82.0% | +4.0 pp | 4.0% |
| **2. Formalisation** | 74.0% | **+70.0 pp** | 82.0% | +4.0 pp | 80.0% |
| 3. Explanation | 82.0% | +8.0 pp | 86.0% | 0.0 pp | 82.0% |
| 4. Answering | 86.0% | +4.0 pp | 82.0% | +4.0 pp | 94.0% |

**Formalisation** (writing the equation) is the stage doing the real work — once the model writes the equation, accuracy jumps from 4% to 74%.

#### E4 — QuaSAR-SAP (Our Contribution)

SAP scores 82.0% vs full QuaSAR 86.0% (Δ = −4.0 pp; McNemar p = 0.68). For a small accuracy loss, it uses **far fewer tokens** — a cheap alternative when the budget is tight.

### Adversarial Suite (no LLM calls, fully algorithmic)

| Type | Strategy | Answer |
|---|---|---|
| `numerical_swap` | All numbers × random factor ∈ {2,3,4,5,7,8,10} | `original × factor` |
| `entity_swap` | 50 names → Entity_A/B/C; 35 objects → neutral tokens | unchanged |
| `structural_swap` | Detect add/subtract verbs, invert operation | recomputed algebraically |

Numerical swap is applied only to algebraically scalable problems (non-linear problems with `each`, `per`, `%`, `times`, `ratio` are skipped).

### Prompting Methods

| ID | Badge | Group | Reference |
|----|-------|-------|-----------|
| `standard` | STD | baseline | Direct question |
| `zeroshotcot` | ZS-CoT | baseline | Kojima et al., NeurIPS 2022 |
| `cot` | CoT | baseline | Wei et al., NeurIPS 2022 — 6-shot |
| `quasar` | QuaSAR | quasar | Ranaldi et al., ACL 2025 — full 4-stage |
| `quasar_{1,2,3}` | QS-* | ablation | Cumulative depth |
| `quasar_loo_{1..4}` | LOO-* | ablation | Leave-One-Out |
| `quasar_iso_{1..4}` | ISO-* | ablation | Isolated stage |
| `quasar_sap` | SAP | **contribution** | System-level Activation Prior |

### Setup

#### 1. API Key

Three providers are supported:

- **Gemini** (free tier): https://aistudio.google.com/app/apikey → `GEMINI_API_KEY`
- **OpenAI**: `OPENAI_API_KEY`
- **Ollama** (local/free): `ollama serve` must be running; model id format `ollama/llama3.1:8b`

#### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # add your API keys
```

#### 3. Frontend

```bash
cd frontend
npm install
```

#### 4. Running (two terminals)

```bash
# Terminal 1
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend
npm run dev
```

Browser: **http://localhost:5173**

### Limitations

- **n = 50** is small for McNemar; only 8 of 50 problems passed the linearity check for numerical swap.
- **Budget**: a QuaSAR call uses ~3× more tokens than a normal call; free API limits run out fast.
- **rsLoRA fine-tuning** was in the original proposal but dropped due to lack of GPU.
- **Llama-3-8B** local run works but takes ~5 hours for n=20 — kept in appendix as a sanity check.

---

## 📁 Project Structure

```
QuaSAR_LLM_Project/
├── backend/
│   ├── main.py              FastAPI app (all endpoints)
│   ├── methods.py           8 prompting strategies
│   ├── evaluator.py         Answer extraction + McNemar test
│   ├── gsm8k_loader.py      HuggingFace GSM8K loader
│   ├── adversarial.py       Algorithmic perturbation suite
│   ├── ablation.py          Stage contribution analysis
│   ├── cache.py             SHA-256 disk cache (with PROMPT_VERSION)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/{Compare,Batch,Adversarial,Ablation,Dashboard}Page.jsx
        ├── components/MethodPanel.jsx
        ├── api.js
        └── App.jsx
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/methods` | List all 8 methods |
| GET | `/api/cache/stats` | Cache size / entry count |
| GET | `/api/gsm8k/sample?n=5&seed=42` | N problems from GSM8K |
| POST | `/api/compare` | Single problem, all methods |
| POST | `/api/batch` | Batch eval + McNemar matrix |
| POST | `/api/adversarial` | Adversarial suite on one problem |
| POST | `/api/adversarial/batch` | N problems × methods × types |
| POST | `/api/ablation/run` | Full QuaSAR ablation + SAP delta |
| GET | `/api/results` | List all saved runs |
| GET | `/api/results/{run_id}` | Full run detail |

## 🧪 Experiment Recipes

```bash
# E1 — Clean accuracy
curl -X POST localhost:8000/api/batch \
  -H 'content-type: application/json' \
  -d '{"n":50,"seed":42,"model":"gpt-4o-mini",
       "methods":["standard","zeroshotcot","cot","quasar"]}'

# E2 — Adversarial robustness (headline result)
curl -X POST localhost:8000/api/adversarial/batch \
  -d '{"n":50,"seed":42,"model":"gpt-4o-mini",
       "methods":["standard","zeroshotcot","cot","quasar"]}'

# E3 — Stage ablation + SAP
curl -X POST localhost:8000/api/ablation/run \
  -d '{"n":50,"seed":42,"model":"gpt-4o-mini","include_sap":true}'
```

## ⚠️ Gotchas

- **Cache version**: any edit to prompts in `methods.py` → bump `PROMPT_VERSION` in `cache.py`. Old entries become unreachable (intentional).
- **Token budgets**: QuaSAR/SAP `max_tokens=3500` (paper Appendix I); baselines `1024`. Mid-Explanation truncation silently corrupts answers.
- **Answer markers**: QuaSAR/SAP emit `The answer is: N` (paper §2.1.4); CoT exemplars emit `#### N` (Wei 2022). Evaluator handles both.
- **Adversarial scoring**: only `scoreable=True` variants enter ✓/✗ accuracy. Non-linear problems are listed under "Skipped — not algebraically scoreable".
- **Concurrency**: `openai`/`gemini`=4, `ollama`=1 (local GPU is serial).
- **Default seed**: `42` for batch and ablation routes. `/api/gsm8k/sample` defaults to random (`seed=None`).

## 📚 References

1. Ranaldi, L., Valentino, M., Freitas, A. (2025). *Quasi-Symbolic Abstract Reasoning.* ACL 2025. [arXiv:2502.12616](https://arxiv.org/abs/2502.12616)
2. Mirzadeh, I. et al. (2024). *GSM-Symbolic.* [arXiv:2410.05229](https://arxiv.org/abs/2410.05229)
3. Cobbe, K. et al. (2021). *GSM8K.* [arXiv:2110.14168](https://arxiv.org/abs/2110.14168)
4. Wei, J. et al. (2022). *Chain-of-Thought Prompting.* NeurIPS 2022. [arXiv:2201.11903](https://arxiv.org/abs/2201.11903)
5. Kojima, T. et al. (2022). *Zero-Shot Reasoners.* NeurIPS 2022. [arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
6. Turpin, M. et al. (2023). *Unfaithful CoT.* [arXiv:2305.04388](https://arxiv.org/abs/2305.04388)
7. Dror, R. et al. (2018). *Statistical Significance in NLP.* ACL 2018.
