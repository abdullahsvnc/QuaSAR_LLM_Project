import { useState } from 'react'
import { api } from '../api'
import { DEFAULT_MODEL_FRONT, MODELS } from '../shared/models'

const METHOD_META = {
  standard:    { label:'STD',    color:'#888780', name:'Standard' },
  zeroshotcot: { label:'ZS-CoT', color:'#378ADD', name:'ZS-CoT' },
  cot:         { label:'CoT',    color:'#639922', name:'CoT' },
  quasar:      { label:'QuaSAR', color:'#BA7517', name:'QuaSAR' },
}

export default function BatchPage() {
  const [config, setConfig] = useState({ n:20, split:'test', seed:42, model: DEFAULT_MODEL_FRONT })
  const [methods, setMethods] = useState(['standard','zeroshotcot','cot','quasar'])
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  const toggleMethod = (m) => {
    setMethods(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    )
  }

  const run = async () => {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const data = await api.batch({ ...config, methods })
      setResult(data)
    } catch(e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ maxWidth:900 }}>
      <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Batch Evaluation</h1>
      <div style={{ 
        background: 'rgba(99,153,34,0.05)', 
        border: '1px solid rgba(99,153,34,0.15)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '12px 16px', 
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--text2)'
      }}>
        <strong>Quantitative Benchmark:</strong> Run large-scale evaluations on the GSM8K dataset. 
        Batch runs provide statistical power to compare method accuracies and determine if 
        observed improvements are statistically significant using the McNemar Test.
      </div>
      <p className="muted" style={{ fontSize:12, marginBottom:20 }}>
        Run all methods on N GSM8K problems. Results are saved to <code style={{ fontFamily:'var(--font-mono)', color:'var(--text2)' }}>backend/results/</code> and visible in the Dashboard.
      </p>

      {/* Config */}
      <div style={{
        background:'var(--bg2)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', padding:16, marginBottom:20,
      }}>
        <div className="label" style={{ marginBottom:12 }}>Configuration</div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16 }}>
          {[
            { key:'n',     label:'Problems (n)',  type:'number', min:1, max:200 },
            { key:'seed',  label:'Random seed',   type:'number' },
          ].map(f => (
            <label key={f.key} style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <span className="label">{f.label}</span>
              <input
                type={f.type}
                value={config[f.key]}
                min={f.min} max={f.max}
                onChange={e => setConfig(c => ({ ...c, [f.key]: parseInt(e.target.value) || 0 }))}
                style={{ padding:'6px 10px', width:'100%' }}
              />
            </label>
          ))}

          <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <span className="label">Split</span>
            <select value={config.split} onChange={e => setConfig(c => ({...c, split:e.target.value}))} style={{ padding:'6px 10px' }}>
              <option value="test">test</option>
              <option value="train">train</option>
            </select>
          </label>

          <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <span className="label">Model</span>
            <select value={config.model} onChange={e => setConfig(c => ({...c, model:e.target.value}))} style={{ padding:'6px 10px' }}>
              {MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="label" style={{ marginBottom:8 }}>Methods to evaluate</div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {Object.entries(METHOD_META).map(([id, m]) => (
            <button key={id} onClick={() => toggleMethod(id)} style={{
              background: methods.includes(id) ? m.color : 'var(--bg3)',
              color: methods.includes(id) ? '#fff' : 'var(--text2)',
              border: `1px solid ${methods.includes(id) ? m.color : 'var(--border2)'}`,
              padding:'4px 14px', fontSize:11, fontWeight:600, borderRadius:4,
            }}>
              {m.label}
            </button>
          ))}
        </div>

        {config.n >= 50 && (
          <p style={{ fontSize:11, color:'#BA7517', marginBottom:12 }}>
            ⚠ Running {config.n} problems × {methods.length} methods = ~{config.n * methods.length} API calls. This may take several minutes and incur significant API costs.
          </p>
        )}

        <button onClick={run} disabled={running || methods.length === 0} style={{
          background:'#BA7517', color:'#fff', padding:'8px 20px',
          fontSize:11, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase',
        }}>
          {running ? '⏳ Evaluating…' : `▶ Run ${config.n} Problems`}
        </button>

        {error && <p style={{ fontSize:12, color:'#E24B4A', marginTop:8 }}>{error}</p>}
      </div>

      {/* Results */}
      {result && <BatchResults result={result} />}
    </div>
  )
}

function BatchResults({ result }) {
  const { accuracy, mcnemar, n_problems, run_id } = result
  const methods = Object.keys(accuracy)

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, fontSize:12 }}>
        <span className="label">Run</span>
        <code style={{ fontFamily:'var(--font-mono)', color:'var(--text2)' }}>{run_id}</code>
        <span className="muted">·</span>
        <span className="muted">{n_problems} problems evaluated</span>
      </div>

      {/* Accuracy table */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
          <span className="label">Accuracy per method</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'var(--bg3)' }}>
              {['Method','Correct','Total','Accuracy','Acc %'].map(h => (
                <th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:10, color:'var(--text3)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map((m, i) => {
              const acc = accuracy[m]
              const meta = METHOD_META[m] || { color:'#888', label: m }
              const pct = (acc.accuracy * 100).toFixed(1)
              return (
                <tr key={m} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ background:meta.color, color:'#fff', fontSize:9, fontWeight:600, letterSpacing:'0.08em', padding:'2px 7px', borderRadius:3, fontFamily:'var(--font-mono)' }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', fontSize:13 }}>{acc.correct}</td>
                  <td style={{ padding:'10px 16px', color:'var(--text2)' }}>{acc.total}</td>
                  <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', fontSize:13, fontWeight:500 }}>{pct}%</td>
                  <td style={{ padding:'10px 16px', minWidth:160 }}>
                    <div style={{ background:'var(--bg3)', borderRadius:4, overflow:'hidden', height:8 }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:meta.color, borderRadius:4, transition:'width 0.6s ease' }}/>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* McNemar matrix */}
      {mcnemar && <McNemarMatrix mcnemar={mcnemar} methods={methods} />}
    </div>
  )
}

function McNemarMatrix({ mcnemar, methods }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
        <span className="label">McNemar's Test</span>
        <span className="muted" style={{ fontSize:11, marginLeft:8 }}>Dror et al., ACL 2018 · α = 0.05 · continuity correction applied</span>
      </div>
      <div style={{ padding:16, overflowX:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ padding:'6px 12px', color:'var(--text3)', fontWeight:400, fontSize:10 }}>Row vs Col →</th>
              {methods.map(m => (
                <th key={m} style={{ padding:'6px 14px', color:'var(--text2)', fontWeight:500, fontSize:11, textAlign:'center' }}>
                  {METHOD_META[m]?.label || m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map(rowMethod => (
              <tr key={rowMethod} style={{ borderTop:'1px solid var(--border)' }}>
                <td style={{ padding:'8px 12px', fontWeight:500, fontSize:11, color:'var(--text2)' }}>
                  {METHOD_META[rowMethod]?.label || rowMethod}
                </td>
                {methods.map(colMethod => {
                  if (rowMethod === colMethod) return (
                    <td key={colMethod} style={{ padding:'8px 14px', textAlign:'center', color:'var(--text3)' }}>—</td>
                  )
                  const test = mcnemar[rowMethod]?.[colMethod]
                  if (!test) return <td key={colMethod} style={{ padding:'8px 14px', textAlign:'center', color:'var(--text3)' }}>—</td>
                  const sig = test.significant
                  return (
                    <td key={colMethod} style={{ padding:'8px 14px', textAlign:'center' }}>
                      <div style={{
                        display:'inline-flex', flexDirection:'column', alignItems:'center', gap:1,
                        padding:'4px 10px', borderRadius:4,
                        background: sig ? 'rgba(99,153,34,0.12)' : 'rgba(255,255,255,0.04)',
                        border: sig ? '1px solid rgba(99,153,34,0.3)' : '1px solid transparent',
                      }}>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:sig?500:400, color: sig ? '#639922':'var(--text2)' }}>
                          p={test.p_value}
                        </span>
                        {sig && <span style={{ fontSize:9, color:'#639922', letterSpacing:'0.1em' }}>SIG</span>}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize:11, color:'var(--text3)', marginTop:10 }}>
          SIG = statistically significant difference (p &lt; 0.05). Green = row method significantly outperforms column method.
        </p>
      </div>
    </div>
  )
}
