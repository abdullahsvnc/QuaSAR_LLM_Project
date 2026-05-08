# QuaSAR Ablation Lab

> **Decomposing Quasi-Symbolic Reasoning: Stage-Level Ablation and Adversarial Robustness of QuaSAR**
> LLM Dersi Final Projesi — 2026
>
> Abdullah Sevinç (20220808013) · Ahmet Melih Bostancıeri (20220808063)

---

## Proje Özeti

Büyük Dil Modelleri (LLM'ler), aynı matematik problemine sayılar veya isimler değiştirildiğinde farklı cevaplar verebiliyor. Bu duruma **content-induced reasoning bias** (içerik kaynaklı akıl yürütme yanlılığı) deniyor. Bu proje:

1. **QuaSAR** (Ranaldi et al., 2025) dört aşamalı çerçevesini GSM8K üzerinde yeniden inşa eder
   (*Abstraction → Formalisation → Explanation → Answering*).
2. Üç tip **adversarial** varyant ile robustluğu ölçer: **numerical**, **entity**, **structural swap**.
3. QuaSAR'ın hangi aşamasının gerçekten işe yaradığını anlamak için **Cumulative / Leave-One-Out / Isolated** ablasyon yapar.
4. Kendi katkımız olan **QuaSAR-SAP**'ı (System-level Activation Prior) sunar — dört aşama fikri user prompt yerine system prompt'a taşınır.

Tümü **FastAPI + React** tabanlı küçük bir web uygulamasında çalışır.

---

## Ana Bulgular (`gpt-4o-mini`, n=50, seed=42)

### E1 — Temiz GSM8K Doğruluğu

| Yöntem | Doğruluk |
|---|---|
| Standard | **92.0%** |
| Zero-Shot CoT | 90.0% |
| CoT (6-shot) | 88.0% |
| QuaSAR (full) | 86.0% |

Küçük modellerde QuaSAR temiz problemde en iyi değil — orijinal makale de aynı şeyi söylüyor.

### E2 — Adversarial Robustluk

| Yöntem | Original | Num. swap | Entity swap | **Struct. swap** | Avg. drop |
|---|---|---|---|---|---|
| Standard | 92.0% | 62.5% | 88.2% | 71.4% | −17.9 pp |
| Zero-Shot CoT | 90.0% | 62.5% | 88.2% | 71.4% | −15.9 pp |
| CoT (6-shot) | 88.0% | 62.5% | 91.2% | 71.4% | −13.0 pp |
| **QuaSAR (full)** | 86.0% | 62.5% | 82.3% | **73.5%** | −13.2 pp |

QuaSAR'ın net kazandığı yer **structural swap** (operasyon flipi) — yapı değiştiğinde dört aşama modelin eski aritmetiği kopyalamasını engelliyor.

### E3 — Aşama Düzeyinde Ablasyon

| Aşama | Cumulative | Cum. Δ | LOO Acc | LOO Δ | Isolated |
|---|---|---|---|---|---|
| 1. Abstraction | 4.0% | +4.0 pp | 82.0% | +4.0 pp | 4.0% |
| **2. Formalisation** | 74.0% | **+70.0 pp** | 82.0% | +4.0 pp | 80.0% |
| 3. Explanation | 82.0% | +8.0 pp | 86.0% | 0.0 pp | 82.0% |
| 4. Answering | 86.0% | +4.0 pp | 82.0% | +4.0 pp | 94.0% |

**Formalisation** (denklemi yazma) gerçek işi yapan aşama — model denklemi yazınca doğruluk %4 → %74'e fırlıyor.

### E4 — QuaSAR-SAP (Bizim Katkımız)

SAP, %82.0 vs full QuaSAR %86.0 (Δ = −4.0 pp; McNemar p = 0.68). Küçük bir doğruluk kaybı karşılığında **çok daha az token** kullanıyor — bütçe sıkışıkken ucuz bir alternatif.

---

## Adversarial Suite (LLM çağrısı yok, tamamen algoritmik)

| Tip | Strateji | Cevap |
|---|---|---|
| `numerical_swap` | Tüm sayılar × rastgele faktör ∈ {2,3,4,5,7,8,10} | `original × factor` |
| `entity_swap` | 50 isim → Entity_A/B/C; 35 nesne → nötr token | değişmez |
| `structural_swap` | add/subtract fiil tespiti, operasyon ters çevrilir | cebirsel olarak yeniden hesaplanır |

Numerical swap yalnızca cebirsel olarak ölçeklenebilir problemlere uygulanır (`each`, `per`, `%`, `times`, `ratio` içeren non-linear problemler atlanır).

---

## Prompting Yöntemleri

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

---

## Proje Yapısı

```
QuaSAR_LLM_Project/
├── backend/
│   ├── main.py              FastAPI uygulaması (tüm endpoint'ler)
│   ├── methods.py           8 prompting stratejisi
│   ├── evaluator.py         Cevap çıkarımı + McNemar testi
│   ├── gsm8k_loader.py      HuggingFace GSM8K yükleyici
│   ├── adversarial.py       Algoritmik perturbasyon suite
│   ├── ablation.py          Aşama katkı analizi (Cumulative/LOO/Isolated)
│   ├── cache.py             SHA-256 disk cache (PROMPT_VERSION ile)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── ComparePage.jsx
        │   ├── BatchPage.jsx
        │   ├── AdversarialPage.jsx
        │   ├── AblationPage.jsx
        │   └── DashboardPage.jsx
        ├── components/MethodPanel.jsx
        ├── api.js
        └── App.jsx
```

---

## Kurulum

### 1. API Anahtarı

Üç farklı sağlayıcı destekleniyor:

- **Gemini** (ücretsiz tier): https://aistudio.google.com/app/apikey → `GEMINI_API_KEY`
- **OpenAI**: `OPENAI_API_KEY`
- **Ollama** (yerel/ücretsiz): `ollama serve` çalışıyor olmalı; model id `ollama/llama3.1:8b` formatında

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # API key'leri ekle
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Çalıştırma (iki terminal)

```bash
# Terminal 1
cd backend && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend
npm run dev
```

Tarayıcı: **http://localhost:5173**

---

## API Endpoint'leri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/methods` | 8 yöntemi listeler |
| GET | `/api/cache/stats` | Cache boyutu/girdi sayısı |
| GET | `/api/gsm8k/sample?n=5&seed=42` | GSM8K'dan N problem |
| POST | `/api/compare` | Tek problem, tüm yöntemler |
| POST | `/api/batch` | Batch eval + McNemar matrisi |
| POST | `/api/adversarial` | Tek problem üzerinde adversarial suite |
| POST | `/api/adversarial/batch` | N problem × method × tip robustluk |
| POST | `/api/ablation/run` | Tam QuaSAR ablasyonu + SAP delta |
| GET | `/api/results` | Kayıtlı tüm run'lar |
| GET | `/api/results/{run_id}` | Bir run'ın tam detayı |

---

## Deney Tarifleri

```bash
# E1 — Temel doğruluk
curl -X POST localhost:8000/api/batch \
  -H 'content-type: application/json' \
  -d '{"n":50,"seed":42,"model":"gpt-4o-mini",
       "methods":["standard","zeroshotcot","cot","quasar"]}'

# E2 — Adversarial robustluk (manşet sonuç)
curl -X POST localhost:8000/api/adversarial/batch \
  -d '{"n":50,"seed":42,"model":"gpt-4o-mini",
       "methods":["standard","zeroshotcot","cot","quasar"]}'

# E3 — Aşama ablasyonu + SAP
curl -X POST localhost:8000/api/ablation/run \
  -d '{"n":50,"seed":42,"model":"gpt-4o-mini","include_sap":true}'
```

---

## Önemli Notlar (Gotchas)

- **Cache versiyonu**: `methods.py` içinde prompt değişirse `cache.py` içindeki `PROMPT_VERSION` artırılmalı. Eski girdiler ulaşılamaz olur (kasıtlı).
- **Token bütçeleri**: QuaSAR/SAP `max_tokens=3500` (paper Appendix I); baseline'lar `1024`. Explanation ortasında kesilirse cevaplar sessizce bozulur.
- **Cevap markerları**: QuaSAR/SAP `The answer is: N` (paper §2.1.4); CoT örnekleri `#### N` (Wei 2022). Evaluator ikisini de tanır.
- **Adversarial skorlama**: yalnızca `scoreable=True` varyantlar ✓/✗ doğruluğa girer. Non-linear problemler "Skipped — not algebraically scoreable" altında raporlanır.
- **Concurrency**: `openai`/`gemini`=4, `ollama`=1 (yerel GPU seri).
- **Default seed**: batch ve ablation route'larında `42`. `/api/gsm8k/sample` default'u rastgele (`seed=None`).

---

## Kısıtlar

- **n = 50** McNemar için küçük; özellikle numerical swap'ta yalnızca 50 problemden 8'i lineerlik kontrolünü geçti.
- **Bütçe**: QuaSAR çağrısı normal çağrıdan ~3× daha fazla token harcıyor; ücretsiz API limitleri hızla doluyor.
- **rsLoRA fine-tuning** orijinal proposal'da vardı, GPU yetersizliği nedeniyle kapsam dışı bırakıldı.
- **Llama-3-8B** yerel run'ı çalışıyor (Ek bkz.) ama n=20 için ~5 saat sürüyor — appendix sanity-check olarak tutuldu.

---

## Referanslar

1. Ranaldi, L., Valentino, M., Freitas, A. (2025). *Quasi-Symbolic Abstract Reasoning.* ACL 2025. [arXiv:2502.12616](https://arxiv.org/abs/2502.12616)
2. Mirzadeh, I. et al. (2024). *GSM-Symbolic.* [arXiv:2410.05229](https://arxiv.org/abs/2410.05229)
3. Cobbe, K. et al. (2021). *GSM8K.* [arXiv:2110.14168](https://arxiv.org/abs/2110.14168)
4. Wei, J. et al. (2022). *Chain-of-Thought Prompting.* NeurIPS 2022. [arXiv:2201.11903](https://arxiv.org/abs/2201.11903)
5. Kojima, T. et al. (2022). *Zero-Shot Reasoners.* NeurIPS 2022. [arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
6. Turpin, M. et al. (2023). *Unfaithful CoT.* [arXiv:2305.04388](https://arxiv.org/abs/2305.04388)
7. Dror, R. et al. (2018). *Statistical Significance in NLP.* ACL 2018.
