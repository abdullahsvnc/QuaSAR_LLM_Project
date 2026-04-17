import { useState } from 'react'
import { api } from '../api'
import MethodPanel from '../components/MethodPanel'
import { DEFAULT_MODEL_FRONT, MODELS } from '../shared/models'

const SAMPLES = [
  "A store sells apples for $0.75 each. Maria buys 8 apples and pays with a $10 bill. How much change does she receive?",
  "A train travels 240 miles in 4 hours. At this speed, how long will it take to travel 360 miles?",
  "Tom has 3 times as many marbles as Jake. Together they have 48 marbles. How many marbles does Tom have?",
  "Sarah baked 3 dozen cookies. She gave 1/4 of them to her neighbor and ate 3 herself. How many cookies does she have left?",
  "A rectangular garden is 12 meters long and 8 meters wide. If fencing costs $5 per meter, how much will it cost to fence the garden?",
]

const METHODS_ORDER = ['standard', 'zeroshotcot', 'cot', 'quasar']
const METHODS_INFO = {
  standard:    { name: 'Standard Prompt',  description: 'Direct question — no prompting strategy' },
  zeroshotcot: { name: 'Zero-shot CoT',    description: "Kojima et al., 2022 · 'Let's think step by step'" },
  cot:         { name: 'Chain-of-Thought', description: 'Wei et al., 2022 · 6-shot exemplars' },
  quasar:      { name: 'QuaSAR',           description: 'Ranaldi et al., ACL 2025 · 4-stage quasi-symbolic pipeline' },
}

const METHOD_COLORS = {
  standard:    '#888780',
  zeroshotcot: '#378ADD',
  cot:         '#639922',
  quasar:      '#BA7517',
}

export default function ComparePage() {
  const [problem,    setProblem]    = useState('')
  const [groundTruth, setGT]        = useState('')
  const [results,    setResults]    = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [gsm8kProb,  setGsm8k]      = useState(null)
  const [model,      setModel]      = useState(DEFAULT_MODEL_FRONT)
  const [loadingGSM, setLoadingGSM] = useState(false)
  const [lastRunId,  setLastRunId]  = useState(null)

  const loadRandom = async () => {
    setLoadingGSM(true)
    try {
      const { problems } = await api.sampleGSM8K(1)
      if (problems[0]) {
        setProblem(problems[0].question)
        setGT(String(problems[0].numeric_answer))
        setGsm8k(problems[0])
      }
    } catch { }
    finally { setLoadingGSM(false) }
  }

  const run = async () => {
    if (!problem.trim()) return
    setLoading(true)
    setResults(null)
    setError(null)
    setLastRunId(null)
    try {
      const gt = groundTruth !== '' ? parseFloat(groundTruth) : undefined
      const data = await api.compare({
        problem: problem.trim(),
        model,
        ground_truth: gt ?? null,
      })
      setResults(data.results)
      setLastRunId(data.run_id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const gt = groundTruth !== '' ? parseFloat(groundTruth) : undefined

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Method Comparator</h1>
        <p className="muted" style={{ fontSize: 12, marginTop: 3 }}>
          Run a problem through all four strategies simultaneously. Results auto-saved to Dashboard.
        </p>
      </div>

      {/* Input area */}
      <div style={{
        background:    'var(--bg2)',
        border:        '1px solid var(--border)',
        borderRadius:  'var(--radius-lg)',
        padding:       16,
        marginBottom:  20,
      }}>
        {/* Sample buttons + model picker */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {SAMPLES.slice(0, 3).map((s, i) => (
            <button key={i} onClick={() => { setProblem(s); setGsm8k(null); setGT('') }} style={{
              background: 'var(--bg3)', border: '1px solid var(--border2)',
              color: 'var(--text2)', fontSize: 11, padding: '3px 11px', borderRadius: 4,
            }}>
              Sample {i + 1}
            </button>
          ))}
          <button onClick={loadRandom} disabled={loadingGSM} style={{
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            color: 'var(--text2)', fontSize: 11, padding: '3px 11px', borderRadius: 4,
          }}>
            {loadingGSM ? '…' : '↻ GSM8K'}
          </button>

          <select value={model} onChange={e => setModel(e.target.value)} style={{
            marginLeft: 'auto', padding: '3px 10px', fontSize: 11,
            background: 'var(--bg3)', borderColor: 'var(--border2)',
          }}>
            {MODELS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <textarea
          value={problem}
          onChange={e => setProblem(e.target.value)}
          placeholder="Enter a math word problem…"
          rows={3}
          style={{ width: '100%', padding: '10px 12px', lineHeight: 1.65, resize: 'vertical' }}
        />

        {/* Ground truth input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <span className="label">Ground truth</span>
          <input
            type="number"
            value={groundTruth}
            onChange={e => setGT(e.target.value)}
            placeholder="optional"
            style={{ width: 110, padding: '4px 10px', fontFamily: 'var(--font-mono)' }}
          />
          {gsm8kProb && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              GSM8K id:{gsm8kProb.id}
            </span>
          )}
        </div>

        <button
          onClick={run}
          disabled={loading || !problem.trim()}
          style={{
            marginTop: 12, background: '#BA7517', color: '#fff',
            padding: '8px 20px', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          {loading ? '⏳ Running…' : '▶ Run Experiment'}
        </button>

        {lastRunId && (
          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 12 }}>
            saved as <code style={{ fontFamily: 'var(--font-mono)' }}>{lastRunId}</code>
          </span>
        )}
        {error && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 8 }}>{error}</p>}
      </div>

      {/* Summary table (shown once results are available) */}
      {results && <SummaryTable results={results} groundTruth={gt} />}

      {/* 2×2 grid of panels */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap:                 12,
        marginTop:           16,
      }}>
        {METHODS_ORDER.map(m => (
          <MethodPanel
            key={m}
            methodId={m}
            name={METHODS_INFO[m].name}
            description={METHODS_INFO[m].description}
            result={results?.[m]}
            loading={loading}
            groundTruth={gt}
          />
        ))}
      </div>
    </div>
  )
}

function SummaryTable({ results, groundTruth }) {
  const methods = METHODS_ORDER.filter(m => results[m])

  const getStatus = (r) => {
    const ans = r?.extracted_answer
    if (ans === null || ans === undefined) return 'error'
    if (groundTruth !== undefined) {
      return Math.abs(ans - groundTruth) < 0.001 ? 'correct' : 'wrong'
    }
    return 'answered'
  }

  return (
    <div className="fade-in" style={{
      background:   'var(--bg2)',
      border:       '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow:     'hidden',
    }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
        <span className="label">Run summary</span>
        {groundTruth !== undefined && (
          <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
            ground truth: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{groundTruth}</strong>
          </span>
        )}
      </div>
      <div style={{ display: 'flex' }}>
        {methods.map(m => {
          const r      = results[m]
          const status = getStatus(r)
          const color  = METHOD_COLORS[m] || '#888'
          const statusColor = status === 'correct' ? '#639922'
                            : status === 'wrong'   ? '#E24B4A'
                            : status === 'error'   ? '#888780'
                            : 'var(--text2)'
          const statusLabel = status === 'correct' ? '✓ Correct'
                            : status === 'wrong'   ? `✗ Wrong (got ${r?.extracted_answer ?? '?'})`
                            : status === 'error'   ? '— No answer'
                            : `→ ${r?.extracted_answer ?? '?'}`
          return (
            <div key={m} style={{
              flex:         1,
              padding:      '12px 14px',
              borderRight:  '1px solid var(--border)',
              display:      'flex',
              flexDirection:'column',
              gap:          5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  background:    color,
                  color:         '#fff',
                  fontSize:      9,
                  fontWeight:    600,
                  letterSpacing: '0.08em',
                  padding:       '1px 6px',
                  borderRadius:  3,
                  fontFamily:    'var(--font-mono)',
                }}>
                  {m === 'zeroshotcot' ? 'ZS-CoT' : m === 'standard' ? 'STD' : m.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: statusColor }}>
                {statusLabel}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                {r?.tokens ? `${r.tokens} tok` : ''}
                {r?.cache_hit ? ' · cached' : ''}
                {r?.time_ms && !r?.cache_hit ? ` · ${r.time_ms}ms` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
