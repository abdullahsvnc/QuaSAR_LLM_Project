const BASE = '/api'

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

export const api = {
  getMethods:  ()                          => get('/methods'),
  cacheStats:  ()                          => get('/cache/stats'),
  sampleGSM8K: (n = 5, split = 'test')    => get(`/gsm8k/sample?n=${n}&split=${split}`),
  compare:     (body)                      => post('/compare', body),
  batch:       (body)                      => post('/batch', body),
  adversarial: (body)                      => post('/adversarial', body),
  adversarialBatch: (body)                 => post('/adversarial/batch', body),
  runAblation: (body)                      => post('/ablation/run', body),
  listResults: ()                          => get('/results'),
  getResult:   (id)                        => get(`/results/${id}`),
}
