import { useState } from 'react'
import { api } from '../api'
import { DEFAULT_MODEL_FRONT, MODELS } from '../shared/models'

const STAGE_COLORS = ['#7F77DD', '#378ADD', '#639922', '#BA7517']
const STAGE_NAMES  = ['Abstraction', 'Formalisation', 'Explanation', 'Answering']
const STAGE_BLURBS = ['Abstract variables', 'Formal notation', 'Derive solution', 'Instantiate answer']

const METHODS_PER_PROBLEM = 12     // 4 cumulative + 4 LOO + 4 isolated
const METHODS_PER_PROBLEM_SAP = 13 // + quasar_sap

export default function AblationPage() {
  const [config,     setConfig]     = useState({ n: 20, split: 'test', seed: 42, model: DEFAULT_MODEL_FRONT })
  const [includeSAP, setIncludeSAP] = useState(true)
  const [useMock,    setUseMock]    = useState(false)
  const [running,    setRunning]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)

  const run = async () => {
    setRunning(true); setResult(null); setError(null)
    try {
      const data = await api.runAblation({
        n:           config.n,
        split:       config.split,
        seed:        config.seed,
        model:       config.model,
        include_sap: includeSAP,
        use_mock:    useMock,
      })
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  const perProblem = includeSAP ? METHODS_PER_PROBLEM_SAP : METHODS_PER_PROBLEM

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>QuaSAR Stage Ablation</h1>
      <div style={{ 
        background: 'rgba(186,117,23,0.05)', 
        border: '1px solid rgba(186,117,23,0.15)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '12px 16px', 
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--text2)'
      }}>
        <strong>Causal Inference:</strong> Deconstruct the QuaSAR pipeline to isolate the impact of 
        each reasoning stage. By running cumulative, leave-one-out, and isolated tests, 
        we can pinpoint exactly where the value is being added and identify potential bottlenecks 
        in the quasi-symbolic chain.
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
        <strong style={{ color: 'var(--text)' }}>Goal:</strong> measure how much each of the four QuaSAR
        reasoning stages actually contributes to solving a math problem. We can't just run the full pipeline
        and guess — we need controlled experiments where we turn stages on and off and watch accuracy change.
      </p>

      {/* Stage diagram */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        {STAGE_NAMES.map((name, i) => (
          <div key={i} style={{
            flex: 1, padding: '10px 14px',
            borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            background: `${STAGE_COLORS[i]}08`,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 10,
              background: STAGE_COLORS[i],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: '#fff', fontWeight: 600, marginBottom: 6,
            }}>{i + 1}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: STAGE_COLORS[i] }}>{name}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{STAGE_BLURBS[i]}</div>
          </div>
        ))}
      </div>

      {/* Three testing strategies explainer */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20,
      }}>
        {[
          {
            tag: 'LOO',
            title: 'Leave-one-out',
            pitch: 'Remove one stage, keep the other three. If accuracy drops → that stage was pulling its weight.',
            example: 'Full pipeline 80% → without Formalisation 55% ⇒ Formalisation contributes +25pp',
            color: '#BA7517',
            isPrimary: true,
          },
          {
            tag: 'CUM',
            title: 'Cumulative',
            pitch: 'Add stages one by one (S1, then S1+S2, …). Shows the marginal lift each new stage provides.',
            example: 'S1 30% → S1+S2 45% ⇒ adding S2 on top of S1 gives +15pp',
            color: '#378ADD',
          },
          {
            tag: 'ISO',
            title: 'Isolated',
            pitch: 'Run only one stage by itself. Reveals whether a stage can solve problems on its own.',
            example: 'Low isolated accuracy is expected — stages are designed to cooperate, not work alone.',
            color: '#639922',
          },
        ].map(v => (
          <div key={v.tag} style={{
            background: 'var(--bg2)',
            border: `1px solid ${v.isPrimary ? v.color + '55' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)', padding: '12px 14px',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 3,
                background: `${v.color}22`, color: v.color,
                fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.08em',
              }}>{v.tag}</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{v.title}</span>
              {v.isPrimary && <span className="muted" style={{ fontSize: 10 }}>← canonical signal</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 }}>{v.pitch}</div>
            <div style={{
              fontSize: 10, color: 'var(--text3)', fontStyle: 'italic',
              borderLeft: `2px solid ${v.color}44`, paddingLeft: 8, lineHeight: 1.5,
            }}>{v.example}</div>
          </div>
        ))}
      </div>

      {/* Config */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeSAP} onChange={e => setIncludeSAP(e.target.checked)} />
          <span style={{ fontSize: 12 }}>Include QuaSAR-SAP comparison</span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 3,
            background: 'rgba(216,90,48,0.15)', color: '#D85A30',
            fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.08em',
          }}>SAP</span>
          <span className="muted" style={{ fontSize: 11 }}>Original contribution — system-level quasi-symbolic priming</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={useMock} onChange={e => setUseMock(e.target.checked)} />
          <span style={{ fontSize: 12 }}>Use mock fixture (replay last run, no LLM)</span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 3,
            background: 'rgba(99,153,34,0.15)', color: '#639922',
            fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.08em',
          }}>MOCK</span>
          <span className="muted" style={{ fontSize: 11 }}>
            Match key: model · n · seed · split · sap. First run saves fixture; reruns return saved data.
          </span>
        </label>

        <p style={{ fontSize: 11, color: config.n >= 25 ? '#BA7517' : 'var(--text3)', marginBottom: 12 }}>
          ▸ {config.n} problems × {perProblem} methods = ~{config.n * perProblem} API calls (cumulative×4 + LOO×4 + isolated×4{includeSAP ? ' + SAP' : ''}). Cache makes repeats free.
        </p>

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
  const { analysis, sap_delta, run_id, n_problems, from_mock, mock_saved, mock_file } = result
  if (!analysis) return null

  const { per_stage, full_accuracy, narrative_summary } = analysis

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(from_mock || mock_saved) && (
        <div style={{
          fontSize: 11, padding: '8px 12px',
          background: 'rgba(99,153,34,0.08)',
          border: '1px solid rgba(99,153,34,0.25)',
          borderRadius: 'var(--radius)', color: 'var(--text2)',
        }}>
          <strong style={{ color: '#639922' }}>
            {from_mock ? 'Replayed from mock' : 'Saved as mock fixture'}
          </strong>{' · '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>{mock_file}</code>
          {from_mock && ' — no LLM calls were made'}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
        Run <code style={{ fontFamily: 'var(--font-mono)' }}>{run_id}</code> · {n_problems} problems ·
        full QuaSAR accuracy <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
          {(full_accuracy * 100).toFixed(1)}%
        </strong> · saved to Dashboard
      </div>

      <InterpretationGuide narrative={narrative_summary} />

      <PerStageTable perStage={per_stage} />

      <StageDemoPanel perStage={per_stage} />

      <ViewCards perStage={per_stage} view="loo" />
      <ViewCards perStage={per_stage} view="cumulative" />
      <ViewCards perStage={per_stage} view="isolated" />

      {includeSAP && sap_delta && Object.keys(sap_delta).length > 0 && (
        <SapDelta sap_delta={sap_delta} />
      )}
    </div>
  )
}

/* ─── How to read results ──────────────────────────────────────────────── */

function InterpretationGuide({ narrative }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '12px 16px',
    }}>
      {narrative && (
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          background: 'rgba(186,117,23,0.06)',
          border: '1px solid rgba(186,117,23,0.18)',
          borderRadius: 'var(--radius)',
          fontSize: 12, lineHeight: 1.65, color: 'var(--text2)',
          whiteSpace: 'pre-line',
        }}>
          <div className="label" style={{ marginBottom: 6, color: '#BA7517' }}>Auto-narrative — why these numbers</div>
          {narrative}
        </div>
      )}
      <div className="label" style={{ marginBottom: 8 }}>How to read these results</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, fontSize: 11, lineHeight: 1.6 }}>
        <div>
          <strong style={{ color: '#639922' }}>▲ Green Δ</strong>
          <span className="muted"> — stage helps; removing it hurts accuracy.</span>
        </div>
        <div>
          <strong style={{ color: '#E24B4A' }}>▼ Red Δ</strong>
          <span className="muted"> — stage is redundant or harmful here; removing it improved accuracy.</span>
        </div>
        <div>
          <strong>LOO Δ is the headline number</strong>
          <span className="muted"> — it's the causal contribution of a stage while all others are held fixed.</span>
        </div>
        <div>
          <strong>Isolated ≈ 0%</strong>
          <span className="muted"> is expected — QuaSAR stages are designed to cooperate, not work solo.</span>
        </div>
        <div>
          <strong>wins / losses</strong>
          <span className="muted"> — problems where only the full pipeline got it right vs. only the LOO variant did. Large gap = robust signal.</span>
        </div>
        <div>
          <strong>pp = percentage points</strong>
          <span className="muted"> — absolute difference in accuracy (80% − 55% = 25pp), not a relative change.</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Canonical per-stage summary table ─────────────────────────────────── */

function PerStageTable({ perStage }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="label">Per-stage contribution summary</span>
        <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
          one row per stage · all three views side-by-side · green Δ = stage helps, red Δ = stage hurts
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg3)' }}>
            {['Stage', 'Cumulative acc', 'Cumulative Δ', 'LOO acc', 'LOO contribution Δ', 'LOO p', 'Isolated acc'].map(h => (
              <th key={h} style={{
                padding: '8px 16px', textAlign: 'left', fontSize: 10,
                color: 'var(--text3)', fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {perStage.map((s, i) => (
            <tr key={s.stage} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <td style={{ padding: '10px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 9,
                    background: s.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                  }}>{s.stage}</div>
                  <span style={{ color: s.color, fontWeight: 500 }}>{s.name}</span>
                  {s.divergence?.narrative && (
                    <span
                      title={s.divergence.narrative}
                      style={{
                        cursor: 'help',
                        fontSize: 10, color: 'var(--text3)',
                        border: '1px solid var(--border2)', borderRadius: '50%',
                        width: 14, height: 14, display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >ⓘ</span>
                  )}
                </div>
              </td>
              <Pct value={s.cumulative_accuracy} />
              <Delta value={s.cumulative_marginal} />
              <Pct value={s.loo_accuracy} />
              <Delta value={s.loo_contribution} />
              <PValue value={s.loo_p_value} significant={s.loo_significant} />
              <Pct value={s.isolated_accuracy} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pct({ value }) {
  return (
    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {(value * 100).toFixed(1)}%
    </td>
  )
}

function PValue({ value, significant }) {
  if (value == null) {
    return <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>—</td>
  }
  const color = significant ? '#639922' : 'var(--text3)'
  const text = value >= 0.001 ? value.toFixed(4) : '<0.001'
  return (
    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color }}>
      {text}{significant && ' ★'}
    </td>
  )
}

function Delta({ value }) {
  const color = value > 0 ? '#639922' : value < 0 ? '#E24B4A' : 'var(--text3)'
  return (
    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color }}>
      {value > 0 ? '+' : ''}{(value * 100).toFixed(1)}pp
    </td>
  )
}

/* ─── Cards per view (LOO, cumulative, isolated) ───────────────────────── */

const VIEW_META = {
  loo: {
    title: 'Leave-one-out — per-stage necessity',
    subtitle: 'Each card: pipeline run with that stage removed, the other three kept. Δ = accuracy lost by removing the stage. Bigger Δ ⇒ stage was more indispensable.',
    accKey: 'loo_accuracy', dKey: 'loo_contribution', dLabel: 'LOO Δ',
  },
  cumulative: {
    title: 'Cumulative — marginal lift as stages are added',
    subtitle: 'Each card: pipeline truncated to stages 1..k. Δ = lift this stage added on top of the previous depth. Shows where the biggest jumps happen as the pipeline grows.',
    accKey: 'cumulative_accuracy', dKey: 'cumulative_marginal', dLabel: 'marginal Δ',
  },
  isolated: {
    title: 'Isolated — stage-only performance',
    subtitle: 'Each card: only that single stage is active, no others. Low values are expected — this answers "can this stage solve problems on its own?", not "does this stage help the pipeline?".',
    accKey: 'isolated_accuracy', dKey: null, dLabel: null,
  },
}

function ViewCards({ perStage, view }) {
  const meta = VIEW_META[view]
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="label">{meta.title}</span>
        <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{meta.subtitle}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12 }}>
        {perStage.map(s => {
          const acc = s[meta.accKey]
          const delta = meta.dKey ? s[meta.dKey] : null
          const dcolor = delta == null ? 'var(--text3)'
                        : delta > 0 ? '#639922'
                        : delta < 0 ? '#E24B4A'
                        : 'var(--text3)'
          return (
            <div key={s.stage} style={{
              background: 'var(--bg3)',
              border: `1px solid ${s.color}28`,
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 9, background: s.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#fff', fontWeight: 700,
                }}>{s.stage}</div>
                <span style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.name}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 500, fontFamily: 'var(--font-mono)', color: s.color }}>
                {(acc * 100).toFixed(1)}%
              </div>
              {delta != null && (
                <div style={{ fontSize: 11, marginTop: 4, color: dcolor, fontFamily: 'var(--font-mono)' }}>
                  {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}pp {meta.dLabel}
                </div>
              )}
              {view === 'loo' && (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  +{s.loo_wins} full-only / -{s.loo_losses} LOO-only
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Stage demo panel — explains WHY each stage's number is what it is ── */

function StageDemoPanel({ perStage }) {
  const [active, setActive] = useState(0)
  const [pairIdx, setPairIdx] = useState(0)

  const stage = perStage[active]
  const div = stage?.divergence
  if (!div) return null

  const pairs = div.sample_pairs || []
  const pair = pairs[pairIdx % Math.max(pairs.length, 1)]

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="label">Stage demo — full QuaSAR vs ¬Sk side-by-side</span>
        <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
          Concrete LLM traces showing where removing a stage changed the answer.
        </span>
      </div>

      {/* Tab strip — one per stage */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {perStage.map((s, i) => {
          const isActive = i === active
          const dec = s.divergence?.decisive_count ?? 0
          return (
            <button
              key={s.stage}
              onClick={() => { setActive(i); setPairIdx(0) }}
              style={{
                flex: 1, padding: '10px 12px',
                background: isActive ? `${s.color}14` : 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${s.color}` : '2px solid transparent',
                color: isActive ? s.color : 'var(--text2)',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 8,
                  background: s.color, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                }}>{s.stage}</span>
                <span>{s.name}</span>
                <span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>
                  {dec} decisive
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ padding: 16 }}>
        {/* Narrative */}
        <div style={{
          padding: '10px 12px', marginBottom: 14,
          background: `${stage.color}10`,
          border: `1px solid ${stage.color}30`,
          borderRadius: 'var(--radius)',
          fontSize: 12, lineHeight: 1.6, color: 'var(--text2)',
        }}>
          {div.narrative}
        </div>

        {pairs.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>
            No decisive divergences for this stage in the current sample. Increase n to surface examples.
          </p>
        ) : (
          <>
            {/* Problem header */}
            <div style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.6 }}>
              <div className="label" style={{ marginBottom: 4 }}>Problem #{pair.problem_id}</div>
              <div style={{ color: 'var(--text2)' }}>{pair.question}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                Ground truth <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{pair.ground_truth}</strong>
                {' · '}full extracted <strong style={{ fontFamily: 'var(--font-mono)', color: '#639922' }}>{String(pair.full_answer)}</strong>
                {' · '}LOO extracted <strong style={{ fontFamily: 'var(--font-mono)', color: '#E24B4A' }}>{String(pair.loo_answer)}</strong>
                {pair.divergence_line >= 0 && (<> {' · '} first divergence at line {pair.divergence_line + 1}</>)}
              </div>
            </div>

            {/* Side-by-side traces */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <DivergenceTrace
                title="Full QuaSAR (S1-S4)"
                color="#BA7517"
                text={pair.full_text}
                divergenceLine={pair.divergence_line}
              />
              <DivergenceTrace
                title={`¬S${stage.stage} (drop ${stage.name})`}
                color="#E24B4A"
                text={pair.loo_text}
                divergenceLine={pair.divergence_line}
              />
            </div>

            {pairs.length > 1 && (
              <button
                onClick={() => setPairIdx(i => (i + 1) % pairs.length)}
                style={{
                  marginTop: 12, background: 'var(--bg3)',
                  border: '1px solid var(--border2)', color: 'var(--text2)',
                  fontSize: 11, padding: '6px 14px',
                }}
              >
                Show next example ({((pairIdx + 1) % pairs.length) + 1}/{pairs.length})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DivergenceTrace({ title, color, text, divergenceLine }) {
  const lines = (text || '—').split('\n')
  return (
    <div style={{
      border: `1px solid ${color}28`, borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 10px', fontSize: 11, fontWeight: 500, color,
        borderBottom: `1px solid ${color}20`, background: `${color}08`,
      }}>{title}</div>
      <div style={{ padding: 8, maxHeight: 360, overflowY: 'auto' }}>
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.65,
          margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          color: 'var(--text2)',
        }}>
          {lines.map((ln, i) => (
            <div key={i} style={{
              background: i === divergenceLine ? 'rgba(226,75,74,0.12)' : 'transparent',
              padding: i === divergenceLine ? '1px 4px' : '0 4px',
              borderLeft: i === divergenceLine ? '2px solid #E24B4A' : '2px solid transparent',
            }}>{ln || ' '}</div>
          ))}
        </pre>
      </div>
    </div>
  )
}

/* ─── SAP delta panel ───────────────────────────────────────────────────── */

function SapDelta({ sap_delta }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid rgba(216,90,48,0.25)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
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
          { label: 'SAP-only wins',  value: `+${sap_delta.sap_wins}`,   color: '#639922' },
          { label: 'SAP-only losses', value: `-${sap_delta.sap_losses}`, color: '#E24B4A' },
          {
            label: 'McNemar p',
            value: sap_delta.p_value == null
              ? '—'
              : (sap_delta.p_value >= 0.001 ? sap_delta.p_value.toFixed(4) : '<0.001')
                + (sap_delta.significant ? ' ★' : ''),
            color: sap_delta.significant ? '#639922' : 'var(--text3)',
          },
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
  )
}
