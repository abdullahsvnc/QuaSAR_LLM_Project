import { useState } from 'react'
import { api } from '../api'
import { DEFAULT_MODEL_FRONT, MODELS } from '../shared/models'

export default function AblationPage() {
  const [config,   setConfig]  = useState({ n: 20, split: 'test', seed: 42, model: DEFAULT_MODEL_FRONT })
  const [includeSAP, setIncludeSAP] = useState(true)
  const [running,  setRunning] = useState(false)
  const [result,   setResult]  = useState(null)
  const [error,    setError]   = useState(null)

  const run = async () => {
    setRunning(true); setResult(null); setError(null)
    try {
      const data = await api.runAblation({
        n:           config.n,
        split:       config.split,
        seed:        config.seed,
        model:       config.model,
        include_sap: includeSAP,
      })
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  const STAGE_COLORS = ['#7F77DD', '#378ADD', '#639922', '#BA7517']
  const STAGE_NAMES  = ['Abstraction', 'Formalisation', 'Explanation', 'Answering']
  const DEPTH_IDS    = ['quasar_1', 'quasar_2', 'quasar_3', 'quasar']

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>QuaSAR Stage Ablation</h1>
      <p className="muted" style={{ fontSize: 12, marginBottom: 20 }}>
        Evaluates QuaSAR at progressive depths (1–4 stages) to isolate each stage's contribution.
        Optionally compares against QuaSAR-SAP (our original Structured Activation Priming contribution).
      </p>

      {/* Stage diagram */}
      <div style={{
        display:       'flex',
        gap:           0,
        marginBottom:  20,
        border:        '1px solid var(--border)',
        borderRadius:  'var(--radius-lg)',
        overflow:      'hidden',
      }}>
        {STAGE_NAMES.map((name, i) => (
          <div key={i} style={{
            flex:          1,
            padding:       '10px 14px',
            borderRight:   i < 3 ? '1px solid var(--border)' : 'none',
            background:    `${STAGE_COLORS[i]}08`,
          }}>
            <div style={{
              width:         20, height: 20, borderRadius: 10,
              background:    STAGE_COLORS[i],
              display:       'flex', alignItems: 'center', justifyContent: 'center',
              fontSize:      10, color: '#fff', fontWeight: 600, marginBottom: 6,
            }}>
              {i + 1}
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, color: STAGE_COLORS[i] }}>{name}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              {['Abstract variables', 'Formal notation', 'Derive solution', 'Instantiate answer'][i]}
            </div>
          </div>
        ))}
      </div>

      {/* Config */}
      <div style={{
        background:   'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 20,
      }}>
        <div className="label" style={{ marginBottom: 12 }}>Configuration</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
          {[{ key: 'n', label: 'Problems (n)', type: 'number', min: 5, max: 100 },
            { key: 'seed', label: 'Random seed', type: 'number' }].map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="label">{f.label}</span>
              <input
                type={f.type}
                value={config[f.key]}
                min={f.min} max={f.max}
                onChange={e => setConfig(c => ({ ...c, [f.key]: parseInt(e.target.value) || 0 }))}
                style={{ padding: '6px 10px', width: '100%' }}
              />
            </label>
          ))}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="label">Split</span>
            <select value={config.split} onChange={e => setConfig(c => ({ ...c, split: e.target.value }))} style={{ padding: '6px 10px' }}>
              <option value="test">test</option>
              <option value="train">train</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="label">Model</span>
            <select value={config.model} onChange={e => setConfig(c => ({ ...c, model: e.target.value }))} style={{ padding: '6px 10px' }}>
              {MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeSAP} onChange={e => setIncludeSAP(e.target.checked)} />
          <span style={{ fontSize: 12 }}>Include QuaSAR-SAP comparison</span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 3,
            background: 'rgba(216,90,48,0.15)', color: '#D85A30',
            fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.08em',
          }}>
            SAP
          </span>
          <span className="muted" style={{ fontSize: 11 }}>Original contribution — system-level quasi-symbolic priming</span>
        </label>

        {config.n >= 50 && (
          <p style={{ fontSize: 11, color: '#BA7517', marginBottom: 12 }}>
            ⚠ {config.n} problems × {includeSAP ? 5 : 4} methods = ~{config.n * (includeSAP ? 5 : 4)} API calls.
          </p>
        )}

        <button onClick={run} disabled={running} style={{
          background: '#BA7517', color: '#fff', padding: '8px 20px',
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {running ? '⏳ Running ablation…' : `▶ Run Ablation (n=${config.n})`}
        </button>

        {error && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 8 }}>{error}</p>}
      </div>

      {result && <AblationResults result={result} includeSAP={includeSAP} />}
    </div>
  )
}

function AblationResults({ result, includeSAP }) {
  const { analysis, sap_delta, run_id, n_problems } = result
  if (!analysis) return null

  const { accuracy_by_depth, marginal_contribution, stage_wins, stage_losses } = analysis
  const STAGE_COLORS = ['#7F77DD', '#378ADD', '#639922', '#BA7517']
  const STAGE_NAMES  = ['Abstraction', 'Formalisation', 'Explanation', 'Answering']
  const DEPTH_IDS    = ['quasar_1', 'quasar_2', 'quasar_3', 'quasar']

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
        Run <code style={{ fontFamily: 'var(--font-mono)' }}>{run_id}</code> · {n_problems} problems · saved to Dashboard
      </div>

      {/* Cards per depth */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {DEPTH_IDS.map((d, i) => {
          const acc = (accuracy_by_depth[d] * 100).toFixed(1)
          const mg  = marginal_contribution[d]
          const color = STAGE_COLORS[i]
          return (
            <div key={d} style={{
              background:   'var(--bg2)',
              border:       `1px solid ${color}28`,
              borderRadius: 'var(--radius-lg)',
              padding:      '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 11, color }}>{STAGE_NAMES[i]}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 500, fontFamily: 'var(--font-mono)', color }}>{acc}%</div>
              <div style={{ fontSize: 11, marginTop: 4, color: mg > 0 ? '#639922' : mg < 0 ? '#E24B4A' : 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                {mg > 0 ? '+' : ''}{(mg * 100).toFixed(1)}pp marginal
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                +{stage_wins?.[d] || 0} wins / -{stage_losses?.[d] || 0} losses
              </div>
            </div>
          )
        })}
      </div>

      {/* SAP delta */}
      {includeSAP && sap_delta && Object.keys(sap_delta).length > 0 && (
        <div style={{
          background:   'var(--bg2)',
          border:       '1px solid rgba(216,90,48,0.25)',
          borderRadius: 'var(--radius-lg)',
          overflow:     'hidden',
        }}>
          <div style={{ padding: '9px 16px', borderBottom: '1px solid rgba(216,90,48,0.15)' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>QuaSAR-SAP — Original Contribution</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>
              System-level quasi-symbolic priming vs user-level instruction
            </span>
          </div>
          <div style={{ display: 'flex', padding: 16, gap: 12 }}>
            {[
              { label: 'Full QuaSAR', value: `${(sap_delta.quasar_accuracy * 100).toFixed(1)}%`, color: '#BA7517' },
              { label: 'QuaSAR-SAP', value: `${(sap_delta.sap_accuracy * 100).toFixed(1)}%`, color: '#D85A30' },
              { label: 'Δ (SAP − QuaSAR)', value: `${sap_delta.delta >= 0 ? '+' : ''}${(sap_delta.delta * 100).toFixed(1)}pp`, color: sap_delta.delta >= 0 ? '#639922' : '#E24B4A' },
              { label: 'SAP-only wins', value: `+${sap_delta.sap_wins}`, color: '#639922' },
              { label: 'SAP-only losses', value: `-${sap_delta.sap_losses}`, color: '#E24B4A' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                <div className="label" style={{ marginBottom: 5 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 500, fontFamily: 'var(--font-mono)', color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '0 16px 12px', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            SAP injects the quasi-symbolic 4-stage structure as a <em>persistent system-level activation prior</em> rather
            than a user-level instruction — approximating test-time activation steering (rsLoRA proxy) without fine-tuning.
          </div>
        </div>
      )}
    </div>
  )
}
