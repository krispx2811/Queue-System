import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { padNumber } from '../../utils/formatters'
import './Landing.css'

export default function Landing() {
  const { state } = useSocket()
  const waiting = state.tickets.filter(t => t.status === 'waiting').length
  const served = state.tickets.filter(t => t.status === 'served').length
  const activeCounters = state.counters.filter(c => c.status === 'open').length

  return (
    <div className="land">
      <div className="land-bg">
        <div className="land-orb land-orb--1" />
        <div className="land-orb land-orb--2" />
        <div className="land-orb land-orb--3" />
      </div>

      <div className="land-scroll">
        <div className="land-inner">
          {/* Hero */}
          <motion.div
            className="land-hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="land-title">Queue System</h1>
            <p className="land-subtitle ar">نظام إدارة الطوابير</p>
          </motion.div>

          {/* Live stats */}
          <motion.div
            className="land-stats"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <div className="land-stat">
              <span className="land-stat-val">{waiting}</span>
              <span className="land-stat-label">Waiting</span>
            </div>
            <div className="land-stat-sep" />
            <div className="land-stat">
              <span className="land-stat-val">{served}</span>
              <span className="land-stat-label">Served</span>
            </div>
            <div className="land-stat-sep" />
            <div className="land-stat">
              <span className="land-stat-val">{activeCounters}</span>
              <span className="land-stat-label">Counters</span>
            </div>
          </motion.div>

          {/* Primary action */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            <Link to="/dashboard" className="land-primary">
              <div className="land-primary-inner">
                <svg className="land-primary-icon" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="2" y="2" width="7" height="7" rx="2" />
                  <rect x="13" y="2" width="7" height="7" rx="2" />
                  <rect x="2" y="13" width="7" height="7" rx="2" />
                  <rect x="13" y="13" width="7" height="7" rx="2" />
                </svg>
                <div>
                  <span className="land-primary-label">Dashboard</span>
                  <span className="land-primary-desc">Full overview and controls</span>
                </div>
                <svg className="land-primary-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 4l5 5-5 5"/></svg>
              </div>
            </Link>
          </motion.div>

          {/* Cards grid */}
          <motion.div
            className="land-grid"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <Link to="/admin" className="land-card">
              <div className="land-card-icon" style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 7v3l2 2" />
                </svg>
              </div>
              <span className="land-card-label">Control Panel</span>
              <span className="land-card-label-ar ar">لوحة التحكم</span>
            </Link>

            <Link to="/display" className="land-card">
              <div className="land-card-icon" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <rect x="2" y="3" width="16" height="11" rx="2" />
                  <path d="M7 17h6M10 14v3" />
                </svg>
              </div>
              <span className="land-card-label">Live Display</span>
              <span className="land-card-label-ar ar">شاشة العرض</span>
            </Link>

            <Link to="/kiosk" className="land-card">
              <div className="land-card-icon" style={{ background: 'var(--amber-dim)', color: 'var(--amber)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <rect x="4" y="2" width="12" height="16" rx="2" />
                  <path d="M8 8h4M8 11h4M8 14h2" />
                  <path d="M4 6h12" />
                </svg>
              </div>
              <span className="land-card-label">Take a Number</span>
              <span className="land-card-label-ar ar">أخذ رقم</span>
            </Link>

            <Link to="/track" className="land-card">
              <div className="land-card-icon" style={{ background: 'rgba(148, 163, 184, 0.1)', color: 'var(--gray-1)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l3 3" />
                  <path d="M15 2l2 2M3 2L1 4" />
                </svg>
              </div>
              <span className="land-card-label">Track Position</span>
              <span className="land-card-label-ar ar">تتبع موقعك</span>
            </Link>
          </motion.div>

          {/* Currently serving preview */}
          {state.counters.some(c => c.currentTicket) && (
            <motion.div
              className="land-serving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="land-serving-label">Now Serving</span>
              <div className="land-serving-nums">
                {state.counters.filter(c => c.currentTicket).map(c => {
                  const t = state.tickets.find(tk => tk.number === c.currentTicket)
                  if (!t) return null
                  const cat = state.categories.find(ct => ct.id === t.categoryId)
                  return (
                    <div key={c.id} className="land-serving-item">
                      <span className="land-serving-counter">{c.name}</span>
                      <span className="land-serving-num">{padNumber(t.number)}</span>
                      {cat && <span className="land-serving-cat" style={{ color: cat.color }}>{cat.name}</span>}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
