import { Routes, Route, NavLink } from 'react-router-dom'
import ComparePage     from './pages/ComparePage'
import BatchPage       from './pages/BatchPage'
import AdversarialPage from './pages/AdversarialPage'
import AblationPage    from './pages/AblationPage'
import DashboardPage   from './pages/DashboardPage'

const TABS = [
  { to: '/',            label: 'Compare',     exact: true },
  { to: '/batch',       label: 'Batch Eval'               },
  { to: '/adversarial', label: 'Adversarial'              },
  { to: '/ablation',    label: 'Ablation'                 },
  { to: '/dashboard',   label: 'Dashboard'                },
]

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding:      '0 24px',
        display:      'flex',
        alignItems:   'stretch',
        position:     'sticky',
        top:          0,
        zIndex:       10,
        background:   'var(--bg)',
      }}>
        {/* Logo */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          marginRight:  28,
          paddingRight: 24,
          borderRight:  '1px solid var(--border)',
          flexShrink:   0,
        }}>
          <div style={{
            background:   'linear-gradient(135deg, #BA7517, #7F77DD)',
            width:        20,
            height:       20,
            borderRadius: 5,
            flexShrink:   0,
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13 }}>QuaSAR Lab</span>
          <span className="label" style={{ marginLeft: 2 }}>LLM · 2026</span>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex' }}>
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.exact}
              style={({ isActive }) => ({
                display:       'flex',
                alignItems:    'center',
                padding:       '0 16px',
                height:        50,
                fontSize:      12,
                color:         isActive ? 'var(--text)' : 'var(--text2)',
                textDecoration:'none',
                borderBottom:  isActive ? '2px solid #BA7517' : '2px solid transparent',
                transition:    'color 0.15s',
                whiteSpace:    'nowrap',
              })}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, padding: '24px 24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Routes>
          <Route path="/"            element={<ComparePage />}     />
          <Route path="/batch"       element={<BatchPage />}       />
          <Route path="/adversarial" element={<AdversarialPage />} />
          <Route path="/ablation"    element={<AblationPage />}    />
          <Route path="/dashboard"   element={<DashboardPage />}   />
        </Routes>
      </main>
    </div>
  )
}
