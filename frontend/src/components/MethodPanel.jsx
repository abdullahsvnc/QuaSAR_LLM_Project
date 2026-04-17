import { useState } from 'react'

const METHOD_META = {
  standard:    { badge: 'STD',    color: '#888780' },
  zeroshotcot: { badge: 'ZS-CoT', color: '#378ADD' },
  cot:         { badge: 'CoT',    color: '#639922' },
  quasar:      { badge: 'QuaSAR', color: '#BA7517' },
  quasar_1:    { badge: 'QS-1',   color: '#7F77DD' },
  quasar_2:    { badge: 'QS-2',   color: '#378ADD' },
  quasar_3:    { badge: 'QS-3',   color: '#639922' },
  quasar_sap:  { badge: 'SAP',    color: '#D85A30' },
}

const STAGE_COLORS = ['#7F77DD', '#378ADD', '#639922', '#BA7517']
const STAGE_LABELS = ['Abstraction', 'Formalisation', 'Explanation', 'Answering']

function parseQuaSAR(text) {
  // Gemini prompt formatını birebir döndürmeyebilir:
  // [STAGE 1 — LABEL]  →  orijinal
  // **STAGE 1 — LABEL**  →  bold variant
  // STAGE 1 - LABEL  →  hyphen variant
  // STAGE 1 – LABEL  →  en-dash variant
  // STAGE 1: LABEL   →  kolon variant
  const rx = /(?:\[|\*\*)?STAGE\s+(\d)\s*[–—\-]+\s*([^\]\n*:]+?)(?:\]|\*\*|:)?\s*\n/gi
  const segments = []
  let match, lastIdx = 0, lastMeta = null
  while ((match = rx.exec(text)) !== null) {
    if (lastMeta) segments.push({ ...lastMeta, content: text.slice(lastIdx, match.index).trim() })
    lastMeta = { num: parseInt(match[1]) - 1, name: match[2].trim() }
    lastIdx  = match.index + match[0].length
  }
  if (lastMeta) segments.push({ ...lastMeta, content: text.slice(lastIdx).trim() })
  return segments
}

function StatusPill({ result, groundTruth }) {
  if (!result) return null
  const ans = result.extracted_answer
  if (ans === null || ans === undefined) {
    return (
      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(226,75,74,0.15)', color: '#E24B4A', fontFamily: 'var(--font-mono)' }}>
        NO ANS
      </span>
    )
  }
  if (groundTruth !== undefined && groundTruth !== null) {
    const correct = Math.abs(ans - groundTruth) < 0.001
    return (
      <span style={{
        fontSize: 9, padding: '2px 7px', borderRadius: 3,
        background: correct ? 'rgba(99,153,34,0.15)' : 'rgba(226,75,74,0.15)',
        color: correct ? '#639922' : '#E24B4A',
        fontFamily: 'var(--font-mono)',
      }}>
        {correct ? '✓' : '✗'} {ans}
      </span>
    )
  }
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
      {ans}
    </span>
  )
}

export default function MethodPanel({ methodId, name, description, result, loading, groundTruth }) {
  const meta = METHOD_META[methodId] || { badge: methodId, color: '#888' }
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{
      border:        `1px solid ${meta.color}28`,
      borderRadius:  'var(--radius-lg)',
      overflow:      'hidden',
      background:    `${meta.color}06`,
      display:       'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding:    '9px 12px',
          borderBottom: `1px solid ${meta.color}20`,
          display:    'flex',
          alignItems: 'center',
          gap:        8,
          cursor:     'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          background:    meta.color,
          color:         '#fff',
          fontSize:      9,
          fontWeight:    600,
          letterSpacing: '0.08em',
          padding:       '2px 7px',
          borderRadius:  3,
          fontFamily:    'var(--font-mono)',
          flexShrink:    0,
        }}>
          {meta.badge}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0 }}>{name}</span>

        <StatusPill result={result} groundTruth={groundTruth} />

        {result?.cache_hit && (
          <span style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '0.08em' }}>CACHED</span>
        )}
        {result?.time_ms && !result?.cache_hit && (
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{result.time_ms}ms</span>
        )}

        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Sub-header */}
      <div style={{
        fontSize:      10,
        color:         'var(--text3)',
        padding:       '4px 12px',
        borderBottom:  `1px solid ${meta.color}14`,
        letterSpacing: '0.04em',
      }}>
        {description}
      </div>

      {/* Collapsible content */}
      {expanded && (
        <div style={{
          padding:   12,
          maxHeight: 380,
          overflowY: 'auto',
          overflowX: 'hidden',
          flex:      1,
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: meta.color }}>
              <div className="spinner" style={{ borderTopColor: meta.color }} />
              <span style={{ fontSize: 11 }}>Querying model…</span>
            </div>
          ) : result?.error ? (
            <p style={{ fontSize: 11, color: '#E24B4A' }}>Error: {result.error}</p>
          ) : result?.text ? (
            <div className="fade-in">
              {(methodId === 'quasar' || methodId === 'quasar_1' || methodId === 'quasar_2' ||
                methodId === 'quasar_3' || methodId === 'quasar_sap')
                ? <QuaSARContent text={result.text} />
                : <PlainContent  text={result.text} />}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>Run the experiment to see results.</p>
          )}
        </div>
      )}
    </div>
  )
}

function PlainContent({ text }) {
  return (
    <pre style={{
      fontFamily: 'var(--font-mono)',
      fontSize:   11,
      lineHeight: 1.75,
      whiteSpace: 'pre-wrap',
      wordBreak:  'break-word',
      color:      'var(--text)',
      margin:     0,
    }}>
      {text}
    </pre>
  )
}

function QuaSARContent({ text }) {
  const segs = parseQuaSAR(text)
  if (!segs.length) return <PlainContent text={text} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {segs.map((seg, i) => {
        const color = STAGE_COLORS[seg.num] || STAGE_COLORS[0]
        const label = seg.name || STAGE_LABELS[seg.num] || `Stage ${seg.num + 1}`
        return (
          <div key={i} style={{ borderLeft: `2px solid ${color}`, paddingLeft: 10 }}>
            <div style={{
              fontSize:      9,
              color,
              fontWeight:    600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom:  5,
              fontFamily:    'var(--font-mono)',
            }}>
              Stage {seg.num + 1} — {label}
            </div>
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   11,
              lineHeight: 1.75,
              whiteSpace: 'pre-wrap',
              wordBreak:  'break-word',
              color:      'var(--text)',
              margin:     0,
            }}>
              {seg.content}
            </pre>
          </div>
        )
      })}
    </div>
  )
}
