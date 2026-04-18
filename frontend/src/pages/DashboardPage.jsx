import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { api } from '../api'

const METHOD_COLORS = {
  standard:    '#888780',
  zeroshotcot: '#378ADD',
  cot:         '#639922',
  quasar:      '#BA7517',
  quasar_1:    '#7F77DD',
  quasar_2:    '#5498d6',
  quasar_3:    '#639922',
  quasar_sap:  '#D85A30',
}
const METHOD_LABELS = {
  standard:    'STD',
  zeroshotcot: 'ZS-CoT',
  cot:         'CoT',
  quasar:      'QuaSAR',
  quasar_1:    'QS-1',
  quasar_2:    'QS-2',
  quasar_3:    'QS-3',
  quasar_sap:  'SAP',
}

const DARK_TEXT = '#5e5d57'
const DARK_GRID = 'rgba(255,255,255,0.05)'
const DARK_MUTED = '#9c9a92'

function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
}

export default function DashboardPage() {
  const [runs,     setRuns]     = useState([])
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadRuns = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await api.listResults()
      setRuns(data.runs || [])
      if (data.runs?.[0] && !selected) {
        setSelected(data.runs[0].run_id)
      }
    } catch {}
    finally { setRefreshing(false) }
  }, [selected])

  // Auto-refresh on mount
  useEffect(() => { loadRuns() }, []) // eslint-disable-line

  // Load detail when selection changes
  useEffect(() => {
    if (!selected) return
    setDetail(null)
    setLoading(true)
    api.getResult(selected)
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selected])

  if (!runs.length && !refreshing) return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Dashboard</h1>
      <p className="muted" style={{ fontSize: 12 }}>
        No results yet. Run a Compare, Batch Evaluation, or Ablation experiment first.
      </p>
    </div>
  )

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Dashboard</h1>
      </div>

      <div style={{ 
        background: 'rgba(186,117,23,0.05)', 
        border: '1px solid rgba(186,117,23,0.15)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '12px 16px', 
        marginBottom: 24,
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--text2)'
      }}>
        <strong style={{ color: '#BA7517' }}>Welcome to the QuaSAR Analytics Hub.</strong> This page aggregates all your past experiments. 
        You can select any previous run to inspect detailed reasoning traces, accuracy metrics, 
        and statistical significance tests. Use this to track improvements and identify 
        where the QuaSAR pipeline excels or requires refinement.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span className="label" style={{ whiteSpace: 'nowrap' }}>Select Experiment:</span>
        <select
          value={selected || ''}
          onChange={e => setSelected(e.target.value)}
          style={{ padding: '5px 10px', fontSize: 11, background: 'var(--bg2)', borderColor: 'var(--border2)', maxWidth: 440 }}
        >
          {runs.map(r => (
            <option key={r.run_id} value={r.run_id}>
              {r.type === 'compare'
                ? `[CMP] ${r.run_id} · ${(r.problem || '').slice(0, 50)}…`
                : r.type === 'ablation'
                ? `[ABL] ${r.run_id} · n=${r.config?.n} · ${r.config?.model}`
                : `[BAT] ${r.run_id} · n=${r.config?.n} · ${r.config?.model}`
              } {formatTs(r.timestamp) ? `· ${formatTs(r.timestamp)}` : ''}
            </option>
          ))}
        </select>

        <button
          onClick={() => loadRuns()}
          disabled={refreshing}
          style={{
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            color: 'var(--text2)', fontSize: 11, padding: '5px 12px',
          }}
        >
          {refreshing ? '…' : '↻ Refresh'}
        </button>
      </div>

      {loading && <p className="muted" style={{ fontSize: 12 }}>Loading…</p>}

      {detail && !loading && (
        <>
          {detail.type === 'compare'   && <CompareDetail detail={detail} />}
          {detail.type === 'ablation'  && <AblationDetail detail={detail} />}
          {(!detail.type || detail.type === 'batch') && <BatchDetail detail={detail} />}
        </>
      )}
    </div>
  )
}

// ── Compare detail ─────────────────────────────────────────────────────────────

function CompareDetail({ detail }) {
  const { problem, ground_truth, model, results, methods } = detail
  const methodList = methods || Object.keys(results || {})

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '12px 16px',
      }}>
        <div className="label" style={{ marginBottom: 6 }}>Problem</div>
        <div style={{ fontSize: 13, lineHeight: 1.65 }}>{problem}</div>
        {ground_truth !== null && ground_truth !== undefined && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
            Ground truth: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{ground_truth}</strong>
            {' · '}{model}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {methodList.map(m => {
          const r = (results || {})[m]
          if (!r) return null
          const color = METHOD_COLORS[m] || '#888'
          const ans   = r.extracted_answer
          const correct = ground_truth !== null && ground_truth !== undefined && ans !== null && ans !== undefined
            ? Math.abs(ans - ground_truth) < 0.001 : null

          return (
            <div key={m} style={{
              border:        `1px solid ${color}28`,
              borderRadius:  'var(--radius-lg)',
              overflow:      'hidden',
            }}>
              <div style={{
                padding:       '8px 12px',
                borderBottom:  `1px solid ${color}20`,
                display:       'flex',
                alignItems:    'center',
                gap:           8,
                background:    `${color}06`,
              }}>
                <span style={{
                  background:    color,
                  color:         '#fff',
                  fontSize:      9,
                  fontWeight:    600,
                  padding:       '2px 7px',
                  borderRadius:  3,
                  fontFamily:    'var(--font-mono)',
                  letterSpacing: '0.08em',
                }}>
                  {METHOD_LABELS[m] || m}
                </span>
                {correct !== null && (
                  <span style={{ fontSize: 11, color: correct ? '#639922' : '#E24B4A' }}>
                    {correct ? `✓ ${ans}` : `✗ got ${ans ?? '?'}`}
                  </span>
                )}
                {r.cache_hit && <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>CACHED</span>}
              </div>
              <div style={{ padding: 12, maxHeight: 240, overflowY: 'auto' }}>
                <pre style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  lineHeight: 1.75, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word', color: 'var(--text2)', margin: 0,
                }}>
                  {r.text || '—'}
                </pre>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Batch detail ──────────────────────────────────────────────────────────────

function BatchDetail({ detail }) {
  const { accuracy, mcnemar, config } = detail
  const methods = Object.keys(accuracy || {})

  const accData = methods.map(m => ({
    name:     METHOD_LABELS[m] || m,
    accuracy: parseFloat(((accuracy[m]?.accuracy || 0) * 100).toFixed(1)),
    color:    METHOD_COLORS[m] || '#888',
  }))

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {methods.map(m => <StatCard key={m} method={m} accuracy={accuracy[m]} />)}
      </div>

      <ChartCard title="Accuracy per method"
        subtitle={`${config?.n} problems · ${config?.model} · GSM8K ${config?.split}`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={accData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
            <XAxis dataKey="name" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#222', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}
              formatter={v => [`${v}%`, 'Accuracy']}
            />
            <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
              {accData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {mcnemar && methods.length > 1 && <McNemarGrid mcnemar={mcnemar} methods={methods} />}
    </div>
  )
}

// ── Ablation detail ───────────────────────────────────────────────────────────

function AblationDetail({ detail }) {
  const { analysis, sap_delta, config } = detail
  if (!analysis) return <p className="muted" style={{ fontSize: 12 }}>No analysis data.</p>

  const { per_stage, full_accuracy, stage_colors } = analysis
  const fallbackColors = ['#7F77DD', '#378ADD', '#639922', '#BA7517']

  // Row per QuaSAR stage — keeps the legacy chart keys (`accuracy`, `marginal`)
  // for the cumulative view and adds LOO + isolated columns.
  const stageData = (per_stage || []).map((s, i) => ({
    name:         s.name,
    color:        s.color || (stage_colors || fallbackColors)[i],
    cumAcc:       parseFloat(((s.cumulative_accuracy || 0) * 100).toFixed(1)),
    cumMarginal:  parseFloat(((s.cumulative_marginal || 0) * 100).toFixed(1)),
    looAcc:       parseFloat(((s.loo_accuracy || 0) * 100).toFixed(1)),
    looDelta:     parseFloat(((s.loo_contribution || 0) * 100).toFixed(1)),
    isoAcc:       parseFloat(((s.isolated_accuracy || 0) * 100).toFixed(1)),
    looWins:      s.loo_wins || 0,
    looLosses:    s.loo_losses || 0,
  }))

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        QuaSAR stage ablation · {config?.n} problems · {config?.model}
        {typeof full_accuracy === 'number' && (
          <> · full QuaSAR <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
            {(full_accuracy * 100).toFixed(1)}%
          </strong></>
        )}
      </div>

      {/* Cumulative accuracy */}
      <ChartCard title="Cumulative accuracy (progressive depth)"
        subtitle="Accuracy when stages 1..k are all active — each bar includes all previous stages">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stageData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
            <XAxis dataKey="name" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#222', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}
              formatter={v => [`${v}%`, 'Cumulative acc']}
            />
            <Bar dataKey="cumAcc" radius={[4, 4, 0, 0]}>
              {stageData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Leave-one-out contribution */}
      <ChartCard title="Leave-one-out contribution per stage"
        subtitle="Acc(full) − Acc(full without stage k). Higher = stage is more indispensable.">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={stageData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
            <XAxis dataKey="name" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis unit="pp" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#222', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}
              formatter={v => [`${v}pp`, 'LOO Δ']}
            />
            <Bar dataKey="looDelta" radius={[4, 4, 0, 0]}>
              {stageData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Isolated (single-stage) accuracy */}
      <ChartCard title="Isolated — single-stage accuracy"
        subtitle="Accuracy when only that single stage is active">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={stageData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DARK_GRID} />
            <XAxis dataKey="name" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: DARK_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#222', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}
              formatter={v => [`${v}%`, 'Isolated acc']}
            />
            <Bar dataKey="isoAcc" radius={[4, 4, 0, 0]}>
              {stageData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Per-stage attribution table */}
      <ChartCard title="Per-stage attribution"
        subtitle="Cumulative, leave-one-out and isolated views side by side">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['Stage', 'Cum acc', 'Cum Δ', 'LOO acc', 'LOO Δ', 'Isolated acc', 'Full-only wins', 'LOO-only wins'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stageData.map((d, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ background: d.color, color: '#fff', fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>
                    {d.name}
                  </span>
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{d.cumAcc}%</td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', color: d.cumMarginal > 0 ? '#639922' : d.cumMarginal < 0 ? '#E24B4A' : 'var(--text3)' }}>
                  {d.cumMarginal > 0 ? '+' : ''}{d.cumMarginal}pp
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)' }}>{d.looAcc}%</td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', color: d.looDelta > 0 ? '#639922' : d.looDelta < 0 ? '#E24B4A' : 'var(--text3)' }}>
                  {d.looDelta > 0 ? '+' : ''}{d.looDelta}pp
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)' }}>{d.isoAcc}%</td>
                <td style={{ padding: '9px 12px', color: '#639922', fontFamily: 'var(--font-mono)' }}>+{d.looWins}</td>
                <td style={{ padding: '9px 12px', color: d.looLosses > 0 ? '#E24B4A' : 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                  {d.looLosses > 0 ? `-${d.looLosses}` : '0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {/* SAP delta */}
      {sap_delta && Object.keys(sap_delta).length > 0 && (
        <ChartCard title="QuaSAR-SAP vs Full QuaSAR"
          subtitle="Original contribution — Structured Activation Priming delta">
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Full QuaSAR', value: `${(sap_delta.quasar_accuracy * 100).toFixed(1)}%`, color: '#BA7517' },
              { label: 'QuaSAR-SAP', value: `${(sap_delta.sap_accuracy * 100).toFixed(1)}%`, color: '#D85A30' },
              { label: 'Delta', value: `${sap_delta.delta >= 0 ? '+' : ''}${(sap_delta.delta * 100).toFixed(1)}pp`, color: sap_delta.delta >= 0 ? '#639922' : '#E24B4A' },
              { label: 'SAP wins', value: String(sap_delta.sap_wins), color: '#639922' },
              { label: 'SAP loses', value: String(sap_delta.sap_losses), color: '#E24B4A' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                <div className="label" style={{ marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, fontFamily: 'var(--font-mono)', color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function StatCard({ method, accuracy }) {
  const color = METHOD_COLORS[method] || '#888'
  const label = METHOD_LABELS[method] || method
  const pct   = ((accuracy?.accuracy || 0) * 100).toFixed(1)

  return (
    <div style={{
      background:   'var(--bg2)',
      border:       `1px solid ${color}28`,
      borderRadius: 'var(--radius-lg)',
      padding:      '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          background:    color, color: '#fff',
          fontSize:      9, fontWeight: 600,
          padding:       '2px 7px', borderRadius: 3,
          fontFamily:    'var(--font-mono)', letterSpacing: '0.08em',
        }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 500, fontFamily: 'var(--font-mono)', color }}>
        {pct}<span style={{ fontSize: 15 }}>%</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        {accuracy?.correct} / {accuracy?.total} correct
      </div>
      <div style={{ marginTop: 8, background: 'var(--bg3)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        {subtitle && <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>{subtitle}</span>}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function McNemarGrid({ mcnemar, methods }) {
  return (
    <ChartCard title="McNemar's test" subtitle="Dror et al., ACL 2018 · α = 0.05 · continuity correction">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 12px', color: 'var(--text3)', fontWeight: 400, fontSize: 10 }}>Row vs Col →</th>
              {methods.map(m => (
                <th key={m} style={{ padding: '6px 14px', color: 'var(--text2)', fontWeight: 500, fontSize: 11, textAlign: 'center' }}>
                  {METHOD_LABELS[m] || m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map(row => (
              <tr key={row} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500, fontSize: 11, color: 'var(--text2)' }}>
                  {METHOD_LABELS[row] || row}
                </td>
                {methods.map(col => {
                  if (row === col) return <td key={col} style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text3)' }}>—</td>
                  const t = mcnemar[row]?.[col]
                  if (!t) return <td key={col} style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text3)' }}>—</td>
                  const sig = t.significant
                  return (
                    <td key={col} style={{ padding: '8px 14px', textAlign: 'center' }}>
                      <span style={{
                        display:    'inline-block',
                        padding:    '3px 9px',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize:   11,
                        background: sig ? 'rgba(99,153,34,0.14)' : 'rgba(255,255,255,0.04)',
                        border:     sig ? '1px solid rgba(99,153,34,0.35)' : '1px solid transparent',
                        color:      sig ? '#639922' : 'var(--text2)',
                        fontWeight: sig ? 500 : 400,
                      }}>
                        p={t.p_value}{sig ? ' *' : ''}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          * p &lt; 0.05 — statistically significant difference between the two methods.
        </p>
      </div>
    </ChartCard>
  )
}
