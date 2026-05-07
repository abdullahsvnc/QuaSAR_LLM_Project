import { useState } from 'react'
import { api } from '../api'
import { DEFAULT_MODEL_FRONT, MODELS } from '../shared/models'

const TYPE_META = {
  numerical_swap:  { label:'Numerical Swap',  color:'#7F77DD', desc:'Same structure, different numbers' },
  entity_swap:     { label:'Entity Swap',     color:'#378ADD', desc:'Neutral tokens replace named entities' },
  structural_swap: { label:'Structural Swap', color:'#D85A30', desc:'Different underlying arithmetic operation' },
}

const METHOD_META = {
  standard:    { label:'STD',    color:'#888780' },
  zeroshotcot: { label:'ZS-CoT', color:'#378ADD' },
  cot:         { label:'CoT',    color:'#639922' },
  quasar:      { label:'QuaSAR', color:'#BA7517' },
}

export default function AdversarialPage() {
  const [problem, setProblem] = useState('')
  const [answer,  setAnswer]  = useState('')
  const [types,   setTypes]   = useState(['numerical_swap','entity_swap','structural_swap'])
  const [methods, setMethods] = useState(['standard','zeroshotcot','cot','quasar'])
  const [model,   setModel]   = useState(DEFAULT_MODEL_FRONT)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  const [loadingGSM, setLoadingGSM] = useState(false)

  // Batch Robustness panel — aggregate paper-Table-4-style metrics over many GSM8K problems
  const [batchN,        setBatchN]        = useState(20)
  const [batchSeed,     setBatchSeed]     = useState(42)
  const [batchLoading,  setBatchLoading]  = useState(false)
  const [batchResult,   setBatchResult]   = useState(null)
  const [batchError,    setBatchError]    = useState(null)

  const runBatch = async () => {
    setBatchLoading(true); setBatchResult(null); setBatchError(null)
    try {
      const data = await api.adversarialBatch({
        n: parseInt(batchN, 10),
        seed: parseInt(batchSeed, 10),
        methods, types, model,
      })
      setBatchResult(data)
    } catch(e) { setBatchError(e.message) }
    finally { setBatchLoading(false) }
  }

  const loadRandom = async () => {
    setLoadingGSM(true)
    try {
      const { problems } = await api.sampleGSM8K(1)
      if (problems[0]) {
        setProblem(problems[0].question)
        setAnswer(String(problems[0].numeric_answer))
      }
    } catch {} finally { setLoadingGSM(false) }
  }

  const toggleType   = t => setTypes(p => p.includes(t) ? p.filter(x=>x!==t) : [...p, t])
  const toggleMethod = m => setMethods(p => p.includes(m) ? p.filter(x=>x!==m) : [...p, m])

  const run = async () => {
    if (!problem.trim() || !answer) return
    setLoading(true); setResult(null); setError(null)
    try {
      const data = await api.adversarial({
        problem: problem.trim(),
        answer: parseFloat(answer),
        types, methods, model,
      })
      setResult(data)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth:1100 }}>
      <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Adversarial Evaluation Suite</h1>
      <div style={{ 
        background: 'rgba(127,119,221,0.05)', 
        border: '1px solid rgba(127,119,221,0.15)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '12px 16px', 
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--text2)'
      }}>
        <strong>Robustness Stress Test:</strong> How fragile is the model's reasoning? This suite generates 
        three types of adversarial "shuffles" (Numbers, Entities, or Logic) to see if the 
        model is truly solving the problem or just memorizing patterns.
      </div>
      <p className="muted" style={{ fontSize:12, marginBottom:20 }}>
        Generate perturbed variants of a problem and compare method robustness across perturbation types.
      </p>

      {/* Input */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:16, marginBottom:20 }}>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <button onClick={loadRandom} disabled={loadingGSM} style={{
            background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)', fontSize:11, padding:'3px 12px', borderRadius:4,
          }}>
            {loadingGSM ? '...' : '↻ Random GSM8K'}
          </button>
          <select value={model} onChange={e=>setModel(e.target.value)} style={{ padding:'3px 10px', fontSize:11, background:'var(--bg3)', borderColor:'var(--border2)', marginLeft:'auto' }}>
            {MODELS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <textarea
          value={problem}
          onChange={e=>setProblem(e.target.value)}
          placeholder="Enter a math word problem…"
          rows={2}
          style={{ width:'100%', padding:'10px 12px', lineHeight:1.65, resize:'vertical', marginBottom:8 }}
        />

        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <span className="label">Ground truth answer</span>
          <input
            type="number"
            value={answer}
            onChange={e=>setAnswer(e.target.value)}
            placeholder="42"
            style={{ width:100, padding:'4px 10px', fontFamily:'var(--font-mono)' }}
          />
        </div>

        <div style={{ display:'flex', gap:20, marginBottom:14, flexWrap:'wrap' }}>
          <div>
            <div className="label" style={{ marginBottom:6 }}>Perturbation types</div>
            <div style={{ display:'flex', gap:6 }}>
              {Object.entries(TYPE_META).map(([id, m]) => (
                <button key={id} onClick={()=>toggleType(id)} style={{
                  background: types.includes(id) ? m.color : 'var(--bg3)',
                  color: types.includes(id) ? '#fff' : 'var(--text2)',
                  border:`1px solid ${types.includes(id) ? m.color : 'var(--border2)'}`,
                  padding:'4px 12px', fontSize:11, borderRadius:4,
                }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom:6 }}>Methods</div>
            <div style={{ display:'flex', gap:6 }}>
              {Object.entries(METHOD_META).map(([id, m]) => (
                <button key={id} onClick={()=>toggleMethod(id)} style={{
                  background: methods.includes(id) ? m.color : 'var(--bg3)',
                  color: methods.includes(id) ? '#fff' : 'var(--text2)',
                  border:`1px solid ${methods.includes(id) ? m.color : 'var(--border2)'}`,
                  padding:'4px 12px', fontSize:11, fontWeight:600, borderRadius:4,
                }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={run} disabled={loading || !problem.trim() || !answer} style={{
          background:'#BA7517', color:'#fff', padding:'8px 20px',
          fontSize:11, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase',
        }}>
          {loading ? '⏳ Generating & evaluating…' : '▶ Run Adversarial Suite'}
        </button>

        {error && <p style={{ fontSize:12, color:'#E24B4A', marginTop:8 }}>{error}</p>}
      </div>

      {/* Results */}
      {result && <AdversarialResults result={result} methods={methods} />}

      {/* Batch Robustness — aggregate over N GSM8K problems */}
      <div style={{ marginTop:32, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:16 }}>
        <h2 style={{ fontSize:15, fontWeight:500, marginBottom:4 }}>Batch Robustness</h2>
        <p className="muted" style={{ fontSize:12, marginBottom:12 }}>
          Sample N GSM8K problems, generate perturbed variants algorithmically, run all methods on each.
          Aggregates paper-Table-4-style robustness drop. Cached calls re-use prior runs.
        </p>
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
          <span className="label">N</span>
          <input type="number" min={5} max={200} value={batchN} onChange={e=>setBatchN(e.target.value)}
            style={{ width:70, padding:'4px 8px', fontFamily:'var(--font-mono)' }} />
          <span className="label">seed</span>
          <input type="number" value={batchSeed} onChange={e=>setBatchSeed(e.target.value)}
            style={{ width:70, padding:'4px 8px', fontFamily:'var(--font-mono)' }} />
          <button onClick={runBatch} disabled={batchLoading || methods.length===0 || types.length===0}
            style={{ background:'#7F77DD', color:'#fff', padding:'6px 16px', fontSize:11,
                     fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>
            {batchLoading ? '⏳ Running…' : '▶ Run batch'}
          </button>
          {batchError && <span style={{ fontSize:12, color:'#E24B4A' }}>{batchError}</span>}
        </div>
        {batchResult && <BatchRobustness data={batchResult} methods={methods} types={types} />}
      </div>
    </div>
  )
}

function BatchRobustness({ data, methods, types }) {
  const variantTypes = ['original', ...types]
  const fmtPct = v => v == null ? '—' : `${(v*100).toFixed(1)}%`
  const fmtDrop = v => v == null ? '—' : `${v >= 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}pp`

  // Find best (lowest drop) for highlighting
  const drops = methods.map(m => data.method_robustness[m]?.avg_drop_pp).filter(v => v != null)
  const minDrop = drops.length ? Math.min(...drops) : null

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--radius)',
                    padding:'8px 12px', fontSize:11, color:'var(--text2)', display:'flex', gap:18, flexWrap:'wrap' }}>
        <span><strong>n problems:</strong> {data.n_problems}</span>
        {variantTypes.map(t => (
          <span key={t}>
            <strong>{t === 'original' ? 'orig' : (TYPE_META[t]?.label || t)}:</strong>{' '}
            {data.n_scoreable_per_type[t]} scoreable
          </span>
        ))}
      </div>

      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:'var(--bg3)' }}>
            <th style={{ padding:'8px 14px', textAlign:'left', fontSize:10, color:'var(--text3)',
                         fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>Method</th>
            {variantTypes.map(t => (
              <th key={t} style={{ padding:'8px 14px', textAlign:'center', fontSize:10, color:'var(--text3)',
                                   fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>
                {t === 'original' ? 'Original' : (TYPE_META[t]?.label || t)}
              </th>
            ))}
            <th style={{ padding:'8px 14px', textAlign:'center', fontSize:10, color:'var(--text3)',
                         fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>Avg Drop</th>
          </tr>
        </thead>
        <tbody>
          {methods.map((m, i) => {
            const row = data.method_robustness[m] || {}
            const meta = METHOD_META[m] || { label:m, color:'#888' }
            const isBest = row.avg_drop_pp != null && row.avg_drop_pp === minDrop
            return (
              <tr key={m} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding:'10px 14px' }}>
                  <span style={{ background:meta.color, color:'#fff', fontSize:9, fontWeight:600,
                                 padding:'2px 7px', borderRadius:3, fontFamily:'var(--font-mono)' }}>
                    {meta.label}
                  </span>
                </td>
                {variantTypes.map(t => (
                  <td key={t} style={{ padding:'10px 14px', textAlign:'center', fontFamily:'var(--font-mono)' }}>
                    {fmtPct(row[t])}
                  </td>
                ))}
                <td style={{ padding:'10px 14px', textAlign:'center', fontFamily:'var(--font-mono)',
                             fontWeight:isBest ? 600 : 400,
                             color: isBest ? '#639922' : 'var(--text2)' }}>
                  {fmtDrop(row.avg_drop_pp)} {isBest && '★'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Bar chart of avg drop */}
      <div>
        <div className="label" style={{ marginBottom:6 }}>Avg robustness drop (pp)</div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {methods.map(m => {
            const v = data.method_robustness[m]?.avg_drop_pp
            const meta = METHOD_META[m] || { label:m, color:'#888' }
            const maxAbs = Math.max(...drops.map(Math.abs), 1)
            const pct = v == null ? 0 : (Math.abs(v) / maxAbs) * 100
            return (
              <div key={m} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
                <span style={{ width:60, fontFamily:'var(--font-mono)', fontSize:10 }}>{meta.label}</span>
                <div style={{ flex:1, height:14, background:'var(--bg3)', borderRadius:2, position:'relative' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:meta.color, borderRadius:2 }} />
                </div>
                <span style={{ width:60, textAlign:'right', fontFamily:'var(--font-mono)', fontSize:10 }}>
                  {fmtDrop(v)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AdversarialResults({ result, methods }) {
  const { evaluation } = result
  const [selected, setSelected] = useState(0)
  const skipped = evaluation.filter(ev => ev.scoreable === false)

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {skipped.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed var(--border2)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px', fontSize: 12, lineHeight: 1.6, color: 'var(--text2)',
        }}>
          <div className="label" style={{ marginBottom: 6 }}>Skipped — not algebraically scoreable</div>
          {skipped.map((ev, i) => (
            <div key={i} style={{ marginTop: 4 }}>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                background: 'rgba(255,255,255,0.06)', color: 'var(--text3)',
                fontFamily: 'var(--font-mono)', marginRight: 6,
              }}>{ev.label}</span>
              <span className="muted" style={{ fontSize: 11 }}>
                {ev.reliability_reason || 'no derivable ground truth'} — variant shown but excluded from ✓/✗ scoring
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Robustness summary table */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
          <span className="label">Robustness summary</span>
          <span className="muted" style={{ fontSize:11, marginLeft:8 }}>✓ correct · ✗ wrong · ⊘ not scoreable</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'var(--bg3)' }}>
              <th style={{ padding:'8px 16px', textAlign:'left', fontSize:10, color:'var(--text3)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>Problem variant</th>
              {methods.map(m => (
                <th key={m} style={{ padding:'8px 14px', textAlign:'center', fontSize:10, color:'var(--text3)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>
                  {METHOD_META[m]?.label || m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evaluation.map((ev, i) => (
              <tr key={i} style={{ borderTop: i ? '1px solid var(--border)' : 'none', cursor:'pointer', background: selected===i ? 'var(--bg3)' : 'transparent' }} onClick={()=>setSelected(i)}>
                <td style={{ padding:'10px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{
                      background: ev.type==='original' ? 'var(--bg3)' : (TYPE_META[ev.type]?.color || '#888'),
                      color: ev.type==='original' ? 'var(--text2)' : '#fff',
                      fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:3,
                      fontFamily:'var(--font-mono)', letterSpacing:'0.05em',
                    }}>
                      {ev.label}
                    </span>
                    {ev.scoreable === false ? (
                      <span className="muted" style={{ fontSize:11, fontStyle:'italic' }}>not scoreable</span>
                    ) : (
                      <span style={{ color:'var(--text2)', fontSize:11 }}>ans: <strong style={{ fontFamily:'var(--font-mono)' }}>{ev.ground_truth}</strong></span>
                    )}
                  </div>
                </td>
                {methods.map(m => {
                  const mr = ev.methods[m]
                  const correct = mr?.correct
                  const symbol = correct === true ? '✓'
                              : correct === false ? '✗'
                              : '⊘'
                  const color = correct === true ? '#639922'
                              : correct === false ? '#E24B4A'
                              : 'var(--text3)'
                  return (
                    <td key={m} style={{ padding:'10px 14px', textAlign:'center' }} title={correct === null ? (ev.reliability_reason || 'not scoreable') : undefined}>
                      <span style={{ fontSize:14, color }}>{symbol}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected variant detail */}
      {evaluation[selected] && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
            <span className="label">Detail — {evaluation[selected].label}</span>
          </div>
          <div style={{ padding:16 }}>
            <div style={{
              background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)',
              padding:'10px 14px', marginBottom:14, fontFamily:'var(--font-mono)', fontSize:12, lineHeight:1.65,
            }}>
              {evaluation[selected].problem}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10 }}>
              {methods.map(m => {
                const mr = evaluation[selected].methods[m]
                const meta = METHOD_META[m] || { color:'#888', label:m }
                return (
                  <div key={m} style={{ border:`1px solid ${meta.color}28`, borderRadius:'var(--radius)', overflow:'hidden' }}>
                    <div style={{ padding:'7px 12px', borderBottom:`1px solid ${meta.color}20`, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ background:meta.color, color:'#fff', fontSize:9, fontWeight:600, padding:'1px 7px', borderRadius:3, fontFamily:'var(--font-mono)' }}>{meta.label}</span>
                      {mr && (
                        <span style={{
                          marginLeft:'auto', fontSize:11,
                          color: mr.correct === true ? '#639922'
                               : mr.correct === false ? '#E24B4A'
                               : 'var(--text3)',
                        }}>
                          {mr.correct === true  ? '✓ correct'
                          : mr.correct === false ? `✗ extracted: ${mr.extracted_answer ?? '?'}`
                          : `⊘ extracted: ${mr.extracted_answer ?? '?'} (not scoreable)`}
                        </span>
                      )}
                    </div>
                    <div style={{ padding:'10px 12px', maxHeight:160, overflowY:'auto' }}>
                      <pre style={{ fontFamily:'var(--font-mono)', fontSize:10, lineHeight:1.7, whiteSpace:'pre-wrap', wordBreak:'break-word', color:'var(--text2)' }}>
                        {mr?.text || '—'}
                      </pre>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
