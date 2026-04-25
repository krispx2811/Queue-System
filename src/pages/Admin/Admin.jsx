import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { testSpeak, fetchElevenLabsVoices } from '../../hooks/useVoice'
import { padNumber, formatTime } from '../../utils/formatters'
import { ticketsToCSV, downloadCSV } from '../../utils/csv'
import { SOUND_THEMES, playChime } from '../../utils/sounds'
import { LANGUAGES } from '../../utils/i18n'
import './Admin.css'

export default function Admin() {
  const { state, emit, emitVoid } = useSocket()
  const [counterId, setCounterId] = useState(() => {
    const saved = sessionStorage.getItem('queueCounterId')
    return saved ? parseInt(saved) : null
  })
  const [operatorName, setOperatorName] = useState(() => sessionStorage.getItem('queueOperatorName') || '')
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('queueIsAdmin') === 'true')
  const [adminPwInput, setAdminPwInput] = useState('')
  const [adminPwError, setAdminPwError] = useState(false)
  const [adminToast, setAdminToast] = useState(false)
  const [savedToast, setSavedToast] = useState(false)
  const savedToastTimerRef = useRef(null)

  const updateSettings = useCallback((updates) => {
    emit('settings:update', updates).then(() => {
      setSavedToast(true)
      if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current)
      savedToastTimerRef.current = setTimeout(() => setSavedToast(false), 1200)
    })
  }, [emit])
  const [elevenVoices, setElevenVoices] = useState([])
  const [elevenLoading, setElevenLoading] = useState(false)

  // Persist session
  useEffect(() => {
    if (counterId) sessionStorage.setItem('queueCounterId', counterId)
    else sessionStorage.removeItem('queueCounterId')
  }, [counterId])
  useEffect(() => {
    if (operatorName) sessionStorage.setItem('queueOperatorName', operatorName)
    else sessionStorage.removeItem('queueOperatorName')
  }, [operatorName])
  useEffect(() => {
    sessionStorage.setItem('queueIsAdmin', isAdmin)
  }, [isAdmin])

  const handleAdminLogin = async () => {
    const ok = await emit('auth:check', { password: adminPwInput, role: 'admin' })
    if (ok) {
      setIsAdmin(true); setAdminPwError(false); setAdminPwInput(''); setTab('queue')
      setAdminToast(true); setTimeout(() => setAdminToast(false), 2500)
    } else setAdminPwError(true)
  }
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'queue'
  const sectionParam = searchParams.get('section') || ''
  const sectionDefaults = { categories: 'services', audit: 'log', settings: 'appearance' }
  const section = sectionParam || sectionDefaults[initialTab] || ''
  const showSection = (id) => section === id
  const [tab, setTab] = useState(initialTab)
  const [confirmReset, setConfirmReset] = useState(false)
  const [transferModal, setTransferModal] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [announcementText, setAnnouncementText] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [advAnalytics, setAdvAnalytics] = useState(null)
  const [slideUrl, setSlideUrl] = useState('')
  const [renameId, setRenameId] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#4f8ff7')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [monthlyData, setMonthlyData] = useState(null)

  const heldTickets = state.tickets.filter(t => t.status === 'held')

  const counter = state.counters.find(c => c.id === counterId)
  const currentTicket = counter?.currentTicket
    ? state.tickets.find(t => t.number === counter.currentTicket)
    : null

  // Stage info for current ticket
  const currentTicketCategory = currentTicket ? state.categories.find(c => c.id === currentTicket.categoryId) : null
  const currentStages = currentTicketCategory?.stages || []
  const currentStageIdx = currentTicket?.currentStage || 0
  const currentStageObj = currentStages[currentStageIdx] || null
  const nextStageObj = currentStages[currentStageIdx + 1] || null
  const hasMultiStage = currentStages.length > 1

  const waiting = state.tickets.filter(t => t.status === 'waiting')
  const served = state.tickets.filter(t => t.status === 'served')

  // Keyboard shortcuts
  useEffect(() => {
    if (!counterId || confirmReset || transferModal || noteModal) return
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'n' || e.key === 'N') handleCallNext()
      if (e.key === 'r' || e.key === 'R') handleRecall()
      if (e.key === 's' || e.key === 'S') handleSkip()
      if (e.key === 'c' || e.key === 'C') handleComplete()
      if (e.key === 'h' || e.key === 'H') handleHold()
      if (e.key === 'a' || e.key === 'A') {
        if (hasMultiStage) setSendToOpen(o => !o)
        else handleAdvance()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [counterId, confirmReset, transferModal, noteModal])

  const handleJoin = () => {
    if (!counterId || !operatorName.trim()) return
    emitVoid('counter:register', { counterId, operatorName: operatorName.trim() })
  }

  const handleCallNext = useCallback(() => {
    if (!counterId) return
    emit('ticket:call', { counterId })
  }, [counterId, emit])

  const handleRecall = useCallback(() => {
    if (!counterId) return
    emit('ticket:recall', { counterId })
  }, [counterId, emit])

  const handleSkip = useCallback(() => {
    if (!counterId) return
    emit('ticket:skip', { counterId })
  }, [counterId, emit])

  const handleComplete = useCallback(() => {
    if (!counterId) return
    emit('ticket:complete', { counterId })
  }, [counterId, emit])

  const handleAdvance = useCallback((targetStageId = null) => {
    if (!counterId) return
    emit('ticket:advance', { counterId, targetStageId })
  }, [counterId, emit])

  const [sendToOpen, setSendToOpen] = useState(false)

  const handleHold = useCallback(() => {
    if (!counterId) return
    emit('ticket:hold', { counterId })
  }, [counterId, emit])

  const handleUnhold = useCallback((ticketNumber) => {
    if (!counterId) return
    emit('ticket:unhold', { ticketNumber, counterId })
  }, [counterId, emit])

  const handleReset = () => {
    emitVoid('admin:reset')
    setConfirmReset(false)
  }

  const handleTransfer = (toCategoryId) => {
    if (!transferModal) return
    emit('ticket:transfer', { ticketNumber: transferModal.number, toCategoryId })
    setTransferModal(null)
  }

  const handleTransferToRoom = (toCounterId) => {
    if (!transferModal) return
    emit('ticket:transferToRoom', { ticketNumber: transferModal.number, toCounterId, fromCounterId: counterId })
    setTransferModal(null)
  }

  const handleSaveNote = () => {
    if (!noteModal) return
    emitVoid('ticket:note', { ticketNumber: noteModal.number, note: noteText })
    setNoteModal(null)
    setNoteText('')
  }

  const handleAddAnnouncement = () => {
    if (!announcementText.trim()) return
    emitVoid('admin:announcement', { text: announcementText.trim(), action: 'add' })
    setAnnouncementText('')
  }

  const loadAnalytics = async () => {
    const [data, adv, monthly] = await Promise.all([
      emit('admin:analytics', {}),
      emit('admin:advancedAnalytics', {}),
      emit('admin:monthlyAnalytics', {}),
    ])
    setAnalytics(data)
    setAdvAnalytics(adv)
    setMonthlyData(monthly)
  }

  // Fetch ElevenLabs voices when API key changes (server-side fetch)
  useEffect(() => {
    const key = state.settings.elevenLabsApiKey
    if (!key || state.settings.ttsProvider !== 'elevenlabs') { setElevenVoices([]); return }
    setElevenLoading(true)
    fetchElevenLabsVoices().then(voices => {
      setElevenVoices(voices)
      setElevenLoading(false)
    })
  }, [state.settings.elevenLabsApiKey, state.settings.ttsProvider])

  // Auto-refresh analytics every 30s when on that tab
  useEffect(() => {
    if (tab !== 'analytics') return
    loadAnalytics()
    const i = setInterval(loadAnalytics, 30000)
    return () => clearInterval(i)
  }, [tab])

  const handleExport = async () => {
    const tickets = await emit('admin:export', {})
    const csv = ticketsToCSV(tickets, state.categories)
    downloadCSV(csv)
  }

  // Counter selection screen — only block when on queue tab
  if (!counter?.operatorName && tab === 'queue') {
    return (
      <div className="adm">
        <div className="adm-join">
          <Link to="/" className="adm-back-link">← Back</Link>
          <h1 className="adm-join-title">Select Counter</h1>
          <p className="adm-join-sub">Choose your counter and enter your name</p>

          <div className="adm-join-counters">
            {state.counters.map(c => (
              <div key={c.id} className={`adm-join-counter ${counterId === c.id ? 'active' : ''} ${c.operatorName ? 'taken' : ''}`}>
                <button className="ajc-main" onClick={() => { setCounterId(c.id); if (c.operatorName) setOperatorName(c.operatorName) }}>
                  {renameId === c.id ? (
                    <input className="ajc-rename" value={renameName} onChange={e => setRenameName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { emitVoid('counter:update', { counterId: c.id, name: renameName }); setRenameId(null) } }}
                      onClick={e => e.stopPropagation()} autoFocus />
                  ) : (
                    <span className="ajc-name">{c.name}</span>
                  )}
                  {c.operatorName && <span className="ajc-op">{c.operatorName}</span>}
                </button>
                <button className="ajc-rename-btn" onClick={(e) => { e.stopPropagation(); setRenameId(renameId === c.id ? null : c.id); setRenameName(c.name) }}
                  title="Rename counter">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 2l3 3-6 6H1V8z"/></svg>
                </button>
              </div>
            ))}
            <button
              className="adm-join-counter adm-join-add"
              onClick={() => emit('counter:add', {})}
            >
              + Add Counter
            </button>
          </div>

          {counterId && (
            <motion.div className="adm-join-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <input
                className="adm-input"
                type="text"
                placeholder="Your name..."
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                autoFocus
              />
              <button className="adm-join-btn" onClick={handleJoin} disabled={!operatorName.trim()}>
                Join
              </button>
            </motion.div>
          )}
        </div>
      </div>
    )
  }

  const NAV_ITEMS = [
    { id: 'queue', name: 'Queue', adminOnly: false, icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h12M2 12h8"/></svg> },
    { id: 'analytics', name: 'Analytics', adminOnly: true, icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13V3M2 13h12M5 10V7M8 10V5M11 10V8"/></svg> },
    { id: 'announce', name: 'Announcements', adminOnly: true, icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6v4l8 3V3l-8 3zM3 6H2v4h1"/></svg> },
    { id: 'categories', name: 'Categories', adminOnly: true, icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg> },
    { id: 'audit', name: 'Audit Log', adminOnly: true, icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg> },
    { id: 'settings', name: 'Settings', adminOnly: true, icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></svg> },
  ]

  return (
    <div className="adm">
      {/* Sidebar */}
      <aside className="adm-sidenav">
        <div className="adm-sidenav-head">
          <Link to="/" className="adm-sidenav-back" title="Home">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
          </Link>
          <div className="adm-sidenav-counter">
            <span className="adm-sidenav-counter-name">{counter?.name || 'Admin'}</span>
            <span className="adm-sidenav-counter-op">{counter?.operatorName || 'Not joined'}</span>
          </div>
        </div>

        <div className="adm-sidenav-list">
          <div className="adm-sidenav-section">Operations</div>
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
            <button
              key={item.id}
              className={`adm-sidenav-item ${tab === item.id ? 'adm-sidenav-item--active' : ''}`}
              onClick={() => { setTab(item.id); if (item.id === 'analytics') loadAnalytics() }}
            >
              <span className="adm-sidenav-icon">{item.icon}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </div>

        <div className="adm-sidenav-foot">
          {counter && (
            <button
              className={`adm-toggle ${counter.status === 'closed' ? 'adm-toggle--off' : ''}`}
              onClick={() => emitVoid('counter:toggle', { counterId })}
              style={{ justifyContent: 'center' }}
            >
              <span className="adm-toggle-dot" />
              {counter.status === 'open' ? 'Counter Open' : 'Counter Closed'}
            </button>
          )}
          {counter && (
            <button
              className="adm-leave"
              onClick={() => {
                emitVoid('counter:update', { counterId, operatorName: '' })
                setCounterId(null)
                setOperatorName('')
              }}
            >
              Leave Counter
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="adm-shell">
      <nav className="adm-tabs">
        {(isAdmin
          ? ['queue', 'analytics', 'announce', 'categories', 'audit', 'settings']
          : ['queue']
        ).map(t => (
          <button
            key={t}
            className={`adm-tab ${tab === t ? 'adm-tab--active' : ''}`}
            onClick={() => { setTab(t); if (t === 'analytics') loadAnalytics() }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="adm-body">
        {/* Admin login prompt */}
        {tab === 'admin-login' && (
          <div className="adm-admin-login">
            <div className="adm-admin-login-card">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <h3>Admin Access</h3>
              <p>Enter the admin password to access settings, analytics, and management tools.</p>
              {!state.roles?.hasAdmin && (
                <p className="adm-admin-login-hint">No admin password set. Access is open — go to Audit tab to set one.</p>
              )}
              <input
                className="adm-input"
                type="password"
                placeholder="Admin password..."
                value={adminPwInput}
                onChange={e => { setAdminPwInput(e.target.value); setAdminPwError(false) }}
                onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                autoFocus
              />
              {adminPwError && <span className="adm-admin-login-err">Wrong password</span>}
              <div className="adm-admin-login-btns">
                <button className="adm-act" onClick={() => setTab('queue')}>Cancel</button>
                <button className="adm-join-btn" onClick={handleAdminLogin}>Login</button>
                {!state.roles?.hasAdmin && (
                  <button className="adm-join-btn" onClick={() => { setIsAdmin(true); setTab('queue'); setAdminToast(true); setTimeout(() => setAdminToast(false), 2500) }} style={{ background: 'var(--green)' }}>
                    Skip (no password)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* QUEUE TAB */}
        {tab === 'queue' && (
          <div className="adm-queue">
            <div className="adm-main">
              {/* Status */}
              <div className="adm-stats">
                <div className="adm-stat adm-stat--current">
                  <span className="adm-stat-label">Serving</span>
                  <span className="adm-stat-num">{currentTicket ? (currentTicket.displayNumber || padNumber(currentTicket.number)) : '—'}</span>
                  {currentTicket && (
                    <span className="adm-stat-cat" style={{ color: currentTicketCategory?.color }}>
                      {currentTicketCategory?.name}
                    </span>
                  )}
                  {hasMultiStage && currentStageObj && (
                    <span className="adm-stage-badge">
                      Stage {currentStageIdx + 1}/{currentStages.length}: {currentStageObj.name}
                    </span>
                  )}
                </div>
                <div className="adm-stat">
                  <span className="adm-stat-label">Waiting</span>
                  <span className="adm-stat-num adm-stat-num--dim">{waiting.length}</span>
                </div>
                <div className="adm-stat">
                  <span className="adm-stat-label">Served</span>
                  <span className="adm-stat-num adm-stat-num--dim">{served.length}</span>
                </div>
              </div>

              {/* Actions */}
              <motion.button className="adm-next" onClick={handleCallNext} whileTap={{ scale: 0.97 }}
                disabled={counter.status === 'closed'}>
                Call Next<kbd>N</kbd>
              </motion.button>

              <div className="adm-actions">
                <button className="adm-act" onClick={handleRecall} disabled={!currentTicket}>
                  Recall<kbd>R</kbd>
                </button>
                {hasMultiStage ? (
                  <div className="adm-sendto-wrap">
                    <button className="adm-act adm-act--advance"
                      onClick={() => setSendToOpen(o => !o)}
                      disabled={!currentTicket}>
                      Send To…<kbd>A</kbd>
                    </button>
                    {sendToOpen && currentTicket && (
                      <div className="adm-sendto-pop">
                        <div className="adm-sendto-label">Route patient to:</div>
                        {currentStages.map((stage, idx) => (
                          <button
                            key={stage.id}
                            className={`adm-sendto-item ${idx === currentStageIdx ? 'adm-sendto-item--current' : ''}`}
                            onClick={() => { handleAdvance(stage.id); setSendToOpen(false) }}
                          >
                            <span className="adm-sendto-num">{idx + 1}</span>
                            <span className="adm-sendto-name">{stage.name}</span>
                            {idx === currentStageIdx && <span className="adm-sendto-tag">again</span>}
                          </button>
                        ))}
                        <div className="adm-sendto-divider" />
                        <button className="adm-sendto-item adm-sendto-item--finish"
                          onClick={() => { handleComplete(); setSendToOpen(false) }}>
                          ✓ Finish (patient done)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="adm-act" onClick={handleComplete} disabled={!currentTicket}>
                    Complete<kbd>C</kbd>
                  </button>
                )}
                <button className="adm-act" onClick={handleSkip} disabled={!currentTicket}>
                  Skip<kbd>S</kbd>
                </button>
                <button className="adm-act" onClick={handleHold} disabled={!currentTicket}>
                  Hold<kbd>H</kbd>
                </button>
              </div>

              {/* Current ticket actions */}
              {currentTicket && (
                <div className="adm-ticket-actions">
                  <button className="adm-act adm-act--sm" onClick={() => setTransferModal(currentTicket)}>
                    Transfer
                  </button>
                  <button className="adm-act adm-act--sm" onClick={() => { setNoteModal(currentTicket); setNoteText(currentTicket.notes || '') }}>
                    {currentTicket.notes ? 'Edit Note' : 'Add Note'}
                  </button>
                </div>
              )}
              {currentTicket?.notes && (
                <div className="adm-note-preview">Note: {currentTicket.notes}</div>
              )}

              {/* Held tickets */}
              {heldTickets.length > 0 && (
                <div className="adm-held">
                  <div className="adm-held-label">On Hold ({heldTickets.length})</div>
                  {heldTickets.map(t => {
                    const cat = state.categories.find(c => c.id === t.categoryId)
                    return (
                      <div key={t.number} className="adm-held-row">
                        <span className="adm-held-num">{(t.displayNumber || padNumber(t.number))}</span>
                        <span className="adm-held-cat" style={{ color: cat?.color }}>{cat?.name}</span>
                        {t.notes && <span className="adm-held-note" title={t.notes}>📝</span>}
                        <button className="adm-held-resume" onClick={() => handleUnhold(t.number)}>Resume</button>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>

            {/* Waiting list sidebar */}
            <div className="adm-sidebar">
              <h3 className="adm-sidebar-title">Waiting ({waiting.length})</h3>
              <div className="adm-sidebar-list">
                {waiting.sort((a, b) => a.number - b.number).map(t => {
                  const cat = state.categories.find(c => c.id === t.categoryId)
                  const stage = cat?.stages?.[t.currentStage || 0]
                  return (
                    <div key={t.number} className="adm-wait-row">
                      <span className="adm-wait-num">{(t.displayNumber || padNumber(t.number))}</span>
                      <span className="adm-wait-cat" style={{ color: cat?.color }}>{cat?.name}</span>
                      {stage && <span className="adm-wait-stage">{stage.name}</span>}
                      <span className="adm-wait-time">{formatTime(t.createdAt)}</span>
                    </div>
                  )
                })}
                {waiting.length === 0 && <p className="adm-empty">No one waiting</p>}
              </div>

              <h3 className="adm-sidebar-title" style={{ marginTop: 20 }}>History</h3>
              <div className="adm-sidebar-list">
                {served.sort((a, b) => b.completedAt - a.completedAt).slice(0, 20).map(t => (
                  <div key={t.number} className="adm-wait-row">
                    <span className="adm-wait-num">{(t.displayNumber || padNumber(t.number))}</span>
                    <span className="adm-wait-time">{formatTime(t.completedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {tab === 'analytics' && (
          <div className="adm-analytics">
            {analytics ? (
              <>
                <div className="adm-ana-grid">
                  <div className="adm-ana-card"><span className="adm-ana-val">{analytics.totalServed}</span><span className="adm-ana-label">Served</span></div>
                  <div className="adm-ana-card"><span className="adm-ana-val">{analytics.totalWaiting}</span><span className="adm-ana-label">Waiting</span></div>
                  <div className="adm-ana-card"><span className="adm-ana-val">{analytics.totalSkipped}</span><span className="adm-ana-label">Skipped</span></div>
                  <div className="adm-ana-card"><span className="adm-ana-val">{analytics.avgWaitTime}s</span><span className="adm-ana-label">Avg Wait</span></div>
                  <div className="adm-ana-card"><span className="adm-ana-val">{analytics.avgServiceTime}s</span><span className="adm-ana-label">Avg Service</span></div>
                  <div className="adm-ana-card"><span className="adm-ana-val">{analytics.totalIssued}</span><span className="adm-ana-label">Issued</span></div>
                </div>

                <div className="adm-ana-2col">
                  <div className="adm-ana-section">
                    <h3>Peak Hours</h3>
                    <div className="adm-ana-chart">
                      {analytics.hourCounts.map((count, h) => (
                        <div key={h} className="adm-ana-bar-wrap">
                          <div className="adm-ana-bar" style={{ height: `${Math.max(2, (count / Math.max(1, ...analytics.hourCounts)) * 100)}%` }} />
                          <span className="adm-ana-bar-label">{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="adm-ana-section">
                    <h3>By Category</h3>
                    <div className="adm-ana-cats">
                      {Object.entries(analytics.categoryBreakdown).map(([catId, count]) => {
                        const cat = state.categories.find(c => c.id === catId)
                        return (
                          <div key={catId} className="adm-ana-cat-row">
                            <span className="adm-ana-cat-dot" style={{ background: cat?.color }} />
                            <span className="adm-ana-cat-name">{cat?.name || catId}</span>
                            <span className="adm-ana-cat-count">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {advAnalytics && (
                  <div className="adm-ana-2col">
                    <div className="adm-ana-section">
                      <h3>Weekly Trend</h3>
                      <div className="adm-ana-chart">
                        {advAnalytics.weeklyTrends.map((d, i) => (
                          <div key={i} className="adm-ana-bar-wrap">
                            <div className="adm-ana-bar" style={{ height: `${Math.max(2, (d.served / Math.max(1, ...advAnalytics.weeklyTrends.map(x => x.served))) * 100)}%` }} />
                            <span className="adm-ana-bar-label">{d.dayName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="adm-ana-section">
                      <h3>Busiest Day of Week</h3>
                      <div className="adm-ana-chart">
                        {advAnalytics.dayOfWeekCounts.map((count, i) => (
                          <div key={i} className="adm-ana-bar-wrap">
                            <div className="adm-ana-bar" style={{ height: `${Math.max(2, (count / Math.max(1, ...advAnalytics.dayOfWeekCounts)) * 100)}%`, background: 'var(--green)' }} />
                            <span className="adm-ana-bar-label">{advAnalytics.dayNames[i]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {advAnalytics && (
                  <div className="adm-ana-2col">
                    <div className="adm-ana-section">
                      <h3>Operator Performance</h3>
                      <div className="adm-ana-cats">
                        {Object.entries(advAnalytics.operatorStats).map(([name, stats]) => (
                          <div key={name} className="adm-ana-cat-row">
                            <span className="adm-ana-cat-dot" style={{ background: 'var(--blue)' }} />
                            <span className="adm-ana-cat-name">{name} <span style={{ color: 'var(--gray-3)', fontSize: 10 }}>({stats.counterName})</span></span>
                            <span className="adm-ana-cat-count">{stats.totalServed} · {stats.avgServiceTime}s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="adm-ana-section">
                      <h3>Service Time by Category</h3>
                      <div className="adm-ana-cats">
                        {Object.values(advAnalytics.categoryServiceTimes).map(cat => (
                          <div key={cat.name} className="adm-ana-cat-row">
                            <span className="adm-ana-cat-dot" style={{ background: cat.color }} />
                            <span className="adm-ana-cat-name">{cat.name}</span>
                            <span className="adm-ana-cat-count">{cat.totalServed} · {cat.avgServiceTime}s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {monthlyData && (
                  <div className="adm-ana-2col">
                    <div className="adm-ana-section">
                      <h3>Monthly Trend (30 days)</h3>
                      <div className="adm-ana-chart" style={{ height: 80 }}>
                        {monthlyData.monthlyTrends.map((d, i) => (
                          <div key={i} className="adm-ana-bar-wrap" title={`${d.date}: ${d.served} served`}>
                            <div className="adm-ana-bar" style={{ height: `${Math.max(2, (d.served / Math.max(1, ...monthlyData.monthlyTrends.map(x => x.served))) * 100)}%`, background: 'var(--blue)' }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="adm-ana-section">
                      <h3>Wait Time Distribution</h3>
                      <div className="adm-ana-chart" style={{ height: 80 }}>
                        {monthlyData.waitHistogram.buckets.map((count, i) => (
                          <div key={i} className="adm-ana-bar-wrap">
                            <div className="adm-ana-bar" style={{ height: `${Math.max(2, (count / Math.max(1, ...monthlyData.waitHistogram.buckets)) * 100)}%`, background: 'var(--amber)' }} />
                            <span className="adm-ana-bar-label">{monthlyData.waitHistogram.labels[i]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="adm-act" onClick={loadAnalytics}>Refresh</button>
                  <button className="adm-act" onClick={handleExport}>Export CSV</button>
                  <button className="adm-act" onClick={() => {
                    const content = document.querySelector('.adm-analytics')
                    if (!content) return
                    const win = window.open('', '_blank')
                    win.document.write(`<html><head><title>Queue Report</title><style>
                      body{font-family:system-ui;padding:40px;color:#333}
                      h2{margin:0 0 20px;font-size:24px}
                      h3{margin:20px 0 8px;font-size:14px;color:#666}
                      .card{display:inline-block;padding:12px 20px;margin:4px;border:1px solid #ddd;border-radius:8px;text-align:center}
                      .val{font-size:24px;font-weight:700;display:block}
                      .lbl{font-size:10px;color:#888;text-transform:uppercase}
                      .row{padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between}
                      @media print{body{padding:20px}}
                    </style></head><body>
                    <h2>Queue Report — ${new Date().toLocaleDateString()}</h2>
                    <div class="card"><span class="val">${analytics.totalServed}</span><span class="lbl">Served</span></div>
                    <div class="card"><span class="val">${analytics.totalWaiting}</span><span class="lbl">Waiting</span></div>
                    <div class="card"><span class="val">${analytics.avgWaitTime}s</span><span class="lbl">Avg Wait</span></div>
                    <div class="card"><span class="val">${analytics.avgServiceTime}s</span><span class="lbl">Avg Service</span></div>
                    ${advAnalytics ? `
                    <h3>Operator Performance</h3>
                    ${Object.entries(advAnalytics.operatorStats).map(([n,s]) => `<div class="row"><span>${n} (${s.counterName})</span><span>${s.totalServed} served · ${s.avgServiceTime}s avg</span></div>`).join('')}
                    <h3>Service by Category</h3>
                    ${Object.values(advAnalytics.categoryServiceTimes).map(c => `<div class="row"><span>${c.name}</span><span>${c.totalServed} served · ${c.avgServiceTime}s avg</span></div>`).join('')}
                    ` : ''}
                    <script>setTimeout(()=>window.print(),500)</script>
                    </body></html>`)
                  }}>Print Report / PDF</button>
                </div>
              </>
            ) : (
              <p className="adm-empty">Loading analytics...</p>
            )}
          </div>
        )}

        {/* ANNOUNCEMENTS TAB */}
        {tab === 'announce' && (
          <div className="adm-announce">
            <div className="adm-announce-form">
              <input
                className="adm-input"
                type="text"
                placeholder="Type announcement..."
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddAnnouncement()}
              />
              <button className="adm-join-btn" onClick={handleAddAnnouncement}>Add</button>
            </div>
            <div className="adm-announce-list">
              {state.announcements.map((a, i) => (
                <div key={i} className="adm-announce-item">
                  <span>{a}</span>
                  <button className="adm-announce-rm" onClick={() => emitVoid('admin:announcement', { text: a, action: 'remove' })}>×</button>
                </div>
              ))}
              {state.announcements.length === 0 && <p className="adm-empty">No announcements. Add one to show on the display screen.</p>}
            </div>
          </div>
        )}

        {/* CATEGORIES TAB */}
        {tab === 'categories' && (
          <div className="adm-settings">
            {showSection('services') && (
            <div className="adm-set-section">
              <h3>Service Categories</h3>
              <div className="adm-cat-list">
                {state.categories.map(cat => (
                  <div key={cat.id} className="adm-cat-card">
                    <div className="adm-cat-row">
                      <span className="adm-cat-dot" style={{ background: cat.color }} />
                      <input className="adm-cat-prefix" value={cat.prefix || ''} maxLength={3}
                        onChange={e => emitVoid('category:update', { id: cat.id, prefix: e.target.value.toUpperCase() })}
                        title="Ticket prefix" placeholder="—" />
                      <span className="adm-cat-name">{cat.name}</span>
                      <span className="adm-cat-name-ar">{cat.nameAr}</span>
                      <input type="color" value={cat.color} className="adm-cat-color"
                        onChange={e => emitVoid('category:update', { id: cat.id, color: e.target.value })} />
                      <button className="adm-cat-rm" onClick={() => emitVoid('category:remove', { id: cat.id })}>×</button>
                    </div>
                    {/* Stage editor */}
                    <div className="adm-stages">
                      <div className="adm-stages-label">Stages (multi-step workflow)</div>
                      <div className="adm-stages-row">
                        {(cat.stages || []).map((stage, idx) => (
                          <div key={stage.id} className="adm-stage-item">
                            <span className="adm-stage-num">{idx + 1}</span>
                            <input className="adm-stage-input" value={stage.name}
                              onChange={e => {
                                const newStages = [...cat.stages]
                                newStages[idx] = { ...stage, name: e.target.value }
                                emitVoid('category:update', { id: cat.id, stages: newStages })
                              }} />
                            <button className="adm-stage-rm"
                              onClick={() => emitVoid('category:update', { id: cat.id, stages: cat.stages.filter((_, i) => i !== idx) })}>×</button>
                          </div>
                        ))}
                        <button className="adm-stage-add"
                          onClick={() => {
                            const newStage = { id: `stage-${Date.now()}`, name: 'New Stage' }
                            emitVoid('category:update', { id: cat.id, stages: [...(cat.stages || []), newStage] })
                          }}>+ Add Stage</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {showSection('services') && (
            <div className="adm-set-section">
              <h3>Add Category</h3>
              <div className="adm-announce-form">
                <input className="adm-input" placeholder="Category name" value={newCatName}
                  onChange={e => setNewCatName(e.target.value)} />
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                  style={{ width: 40, height: 38, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                <button className="adm-join-btn" onClick={() => {
                  if (newCatName.trim()) {
                    emit('category:add', { name: newCatName.trim(), color: newCatColor })
                    setNewCatName('')
                  }
                }}>Add</button>
              </div>
            </div>
            )}

            {showSection('counters') && (
            <div className="adm-set-section">
              <h3>Counters</h3>
              <div className="adm-cat-list">
                {state.counters.map(c => (
                  <div key={c.id} className="adm-cat-row">
                    <span className="adm-cat-name">{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--gray-2)' }}>{c.operatorName || 'unassigned'}</span>
                    <span className={`adm-cat-status ${c.status}`}>{c.status}</span>
                    {state.counters.length > 1 && (
                      <button className="adm-cat-rm" onClick={() => emitVoid('counter:delete', { counterId: c.id })}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <button className="adm-act" style={{ marginTop: 8 }} onClick={() => emit('counter:add', {})}>+ Add Counter</button>
            </div>
            )}

            {/* Branches */}
            {showSection('branches') && (
            <div className="adm-set-section">
              <h3>Branches</h3>
              <div className="adm-cat-list">
                {state.branches.map(b => (
                  <div key={b.id} className="adm-cat-row">
                    <span className="adm-cat-name">{b.name}</span>
                    {state.activeBranch === b.id && <span className="adm-cat-active">Active</span>}
                    {state.activeBranch !== b.id && (
                      <button className="adm-held-resume" onClick={() => emitVoid('branch:switch', { branchId: b.id })}>Switch</button>
                    )}
                    {state.branches.length > 1 && state.activeBranch !== b.id && (
                      <button className="adm-cat-rm" onClick={() => emitVoid('branch:remove', { branchId: b.id })}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="adm-announce-form" style={{ marginTop: 8 }}>
                <input className="adm-input" placeholder="Branch name" id="new-branch" />
                <button className="adm-join-btn" onClick={() => {
                  const input = document.getElementById('new-branch')
                  if (input?.value.trim()) { emit('branch:add', { name: input.value.trim() }); input.value = '' }
                }}>Add</button>
              </div>
            </div>
            )}

            {/* Webhooks */}
            {showSection('webhooks') && (
            <div className="adm-set-section">
              <h3>Webhooks</h3>
              <p className="adm-set-hint">POST notifications to external URLs on queue events</p>
              <div className="adm-cat-list">
                {(state.webhooks || []).map(wh => (
                  <div key={wh.id} className="adm-cat-row">
                    <span className="adm-cat-name" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{wh.url}</span>
                    <button className="adm-cat-rm" onClick={() => emitVoid('webhook:remove', { id: wh.id })}>×</button>
                  </div>
                ))}
              </div>
              <div className="adm-announce-form" style={{ marginTop: 8 }}>
                <input className="adm-input" placeholder="https://example.com/webhook" value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)} />
                <button className="adm-join-btn" onClick={() => {
                  if (webhookUrl.trim()) { emit('webhook:add', { url: webhookUrl.trim() }); setWebhookUrl('') }
                }}>Add</button>
              </div>
            </div>
            )}
          </div>
        )}

        {/* AUDIT TAB */}
        {tab === 'audit' && (
          <div className="adm-settings">
            {showSection('log') && (
            <div className="adm-set-section">
              <h3>Audit Log</h3>
              <div className="adm-audit-list">
                {(state.auditLog || []).slice(0, 100).map((entry, i) => (
                  <div key={i} className="adm-audit-row">
                    <span className="adm-audit-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className="adm-audit-action">{entry.action}</span>
                    <span className="adm-audit-actor">{entry.actor}</span>
                    <span className="adm-audit-details">{entry.details}</span>
                  </div>
                ))}
                {(!state.auditLog || state.auditLog.length === 0) && <p className="adm-empty">No activity logged yet</p>}
              </div>
            </div>
            )}

            {showSection('shifts') && (
            <div className="adm-set-section">
              <h3>Shift History</h3>
              <div className="adm-audit-list">
                {(state.shifts || []).slice(-30).reverse().map((s, i) => (
                  <div key={i} className="adm-audit-row">
                    <span className="adm-audit-actor">{s.operatorName}</span>
                    <span className="adm-audit-details">
                      In: {new Date(s.clockIn).toLocaleString()}
                      {s.clockOut ? ` — Out: ${new Date(s.clockOut).toLocaleString()}` : ' (active)'}
                    </span>
                  </div>
                ))}
                {(!state.shifts || state.shifts.length === 0) && <p className="adm-empty">No shifts recorded</p>}
              </div>
            </div>
            )}

            {/* Passwords */}
            {showSection('access') && (
            <div className="adm-set-section">
              <h3>Access Passwords</h3>
              <p className="adm-set-hint">Set passwords to restrict access (leave empty for no restriction)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, width: 70, color: 'var(--gray-2)' }}>Admin</span>
                  <input className="adm-input" type="password" placeholder="Admin password" id="pw-admin" />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, width: 70, color: 'var(--gray-2)' }}>Operator</span>
                  <input className="adm-input" type="password" placeholder="Operator password" id="pw-operator" />
                </div>
                <button className="adm-act" style={{ width: 'fit-content' }} onClick={() => {
                  emitVoid('auth:setPasswords', {
                    adminPassword: document.getElementById('pw-admin')?.value || '',
                    operatorPassword: document.getElementById('pw-operator')?.value || '',
                  })
                }}>Save Passwords</button>
              </div>
            </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div className="adm-settings adm-settings--redesign">

            {/* GROUP: Appearance */}
            {showSection('appearance') && (
            <div className="sg">
              <div className="sg-head">
                <svg className="sg-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="7"/><path d="M9 2a7 7 0 000 14"/></svg>
                <h2 className="sg-title">Appearance</h2>
              </div>
              <div className="sg-body">
                <div className="sg-row">
                  <div className="sg-field">
                    <label className="sg-label">Theme</label>
                    <div className="adm-set-options">
                      {['light', 'dark'].map(th => (
                        <button key={th} className={`adm-set-opt ${state.settings.theme === th ? 'adm-set-opt--active' : ''}`}
                          onClick={() => updateSettings({ theme: th })}>{th === 'light' ? 'Light' : 'Dark'}</button>
                      ))}
                    </div>
                  </div>
                  <div className="sg-field">
                    <label className="sg-label">Interface Language</label>
                    <div className="adm-set-options">
                      {LANGUAGES.map(lang => (
                        <button key={lang.code} className={`adm-set-opt ${state.settings.uiLang === lang.code ? 'adm-set-opt--active' : ''}`}
                          onClick={() => updateSettings({ uiLang: lang.code })}>{lang.native}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="sg-field">
                  <label className="sg-label">Accent Color</label>
                  <div className="adm-set-colors">
                    {['#4f8ff7', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#fbbf24', '#34d399', '#06b6d4', '#64748b'].map(c => (
                      <button key={c} className={`adm-set-color ${state.settings.accentColor === c ? 'adm-set-color--active' : ''}`}
                        style={{ background: c }} onClick={() => updateSettings({ accentColor: c })} />
                    ))}
                    <label className="adm-set-color-custom">
                      <input type="color" value={state.settings.accentColor || '#4f8ff7'}
                        onChange={e => updateSettings({ accentColor: e.target.value })} />
                      Custom
                    </label>
                  </div>
                </div>
                <div className="sg-field">
                  <label className="sg-label">Logo URL</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="adm-input" type="text" placeholder="https://example.com/logo.png"
                      value={state.settings.logoUrl || ''} onChange={e => updateSettings({ logoUrl: e.target.value })} />
                    {state.settings.logoUrl && <img src={state.settings.logoUrl} style={{ height: 32, borderRadius: 6 }} alt="" />}
                  </div>
                </div>
                <div className="sg-field">
                  <label className="sg-label">Background Animation</label>
                  <div className="adm-set-options">
                    {['none', 'particles', 'waves', 'gradient', 'aurora'].map(bg => (
                      <button key={bg} className={`adm-set-opt ${state.settings.backgroundTheme === bg ? 'adm-set-opt--active' : ''}`}
                        onClick={() => updateSettings({ backgroundTheme: bg })}>{bg}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* GROUP: Sound & Voice */}
            {showSection('sound') && (
            <div className="sg">
              <div className="sg-head">
                <svg className="sg-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7v4h3l4 4V3L6 7H3z"/><path d="M13 6.5a3.5 3.5 0 010 5"/></svg>
                <h2 className="sg-title">Sound & Voice</h2>
              </div>
              <div className="sg-body">
                {/* TTS Provider */}
                <div className="sg-field">
                  <label className="sg-label">Voice Provider</label>
                  <div className="adm-set-options">
                    {[
                      { id: 'google', name: 'Google TTS (free)' },
                      { id: 'elevenlabs', name: 'ElevenLabs (HD AI voices)' },
                    ].map(p => (
                      <button key={p.id} className={`adm-set-opt ${(state.settings.ttsProvider || 'google') === p.id ? 'adm-set-opt--active' : ''}`}
                        onClick={() => updateSettings({ ttsProvider: p.id })}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ElevenLabs config */}
                {state.settings.ttsProvider === 'elevenlabs' && (
                  <>
                    <div className="sg-field">
                      <label className="sg-label">ElevenLabs API Key</label>
                      <p className="sg-hint">Get yours at elevenlabs.io — free tier includes 10k chars/month</p>
                      <input className="adm-input" type="password"
                        placeholder="sk_..."
                        value={state.settings.elevenLabsApiKey || ''}
                        onChange={e => updateSettings({ elevenLabsApiKey: e.target.value })} />
                    </div>

                    {state.settings.elevenLabsApiKey && (
                      <div className="sg-field">
                        <label className="sg-label">Voice {elevenLoading && <span className="sg-label-hint">(loading...)</span>}</label>
                        {elevenVoices.length > 0 ? (
                          <div className="adm-voice-grid">
                            {[...elevenVoices].sort((a, b) => {
                              const aId = a.voiceId || a.voice_id
                              const bId = b.voiceId || b.voice_id
                              const sel = state.settings.elevenLabsVoiceId
                              if (aId === sel) return -1
                              if (bId === sel) return 1
                              return 0
                            }).map(v => {
                              const id = v.voiceId || v.voice_id
                              const preview = v.previewUrl || v.preview_url
                              return (
                                <button key={id}
                                  className={`adm-voice-card ${state.settings.elevenLabsVoiceId === id ? 'adm-voice-card--active' : ''}`}
                                  onClick={() => updateSettings({ elevenLabsVoiceId: id })}>
                                  <div className="adm-voice-name">{v.name}</div>
                                  {v.labels && (
                                    <div className="adm-voice-labels">
                                      {Object.values(v.labels).slice(0, 3).map((l, i) => (
                                        <span key={i} className="adm-voice-tag">{l}</span>
                                      ))}
                                    </div>
                                  )}
                                  {preview && (
                                    <button className="adm-voice-preview" onClick={(e) => { e.stopPropagation(); new Audio(preview).play() }}>
                                      ▶ Preview
                                    </button>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        ) : !elevenLoading ? (
                          <p className="sg-hint" style={{ color: 'var(--red)' }}>No voices found. Check your API key.</p>
                        ) : null}
                      </div>
                    )}

                    <div className="sg-field">
                      <label className="sg-label">Model</label>
                      <div className="adm-set-options">
                        {[
                          { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (best)' },
                          { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (fast)' },
                          { id: 'eleven_flash_v2_5', name: 'Flash v2.5 (fastest)' },
                        ].map(m => (
                          <button key={m.id} className={`adm-set-opt ${state.settings.elevenLabsModel === m.id ? 'adm-set-opt--active' : ''}`}
                            onClick={() => updateSettings({ elevenLabsModel: m.id })}>
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="sg-row">
                  <div className="sg-field">
                    <label className="sg-label">Sound Theme <span className="sg-label-hint">(click to preview)</span></label>
                    <div className="adm-set-options">
                      {SOUND_THEMES.map(theme => (
                        <button key={theme} className={`adm-set-opt ${state.settings.soundTheme === theme ? 'adm-set-opt--active' : ''}`}
                          onClick={() => { updateSettings({ soundTheme: theme }); playChime(theme, state.settings.volume) }}>{theme}</button>
                      ))}
                    </div>
                  </div>
                  <div className="sg-field">
                    <label className="sg-label">Volume</label>
                    <input type="range" min="0" max="1" step="0.1" className="adm-range"
                      value={state.settings.volume} onChange={e => updateSettings({ volume: parseFloat(e.target.value) })} />
                  </div>
                </div>
                <div className="sg-field">
                  <label className="sg-label">Voice Languages</label>
                  <div className="adm-set-options">
                    {LANGUAGES.map(lang => (
                      <button key={lang.code} className={`adm-set-opt ${state.settings.languages.includes(lang.code) ? 'adm-set-opt--active' : ''}`}
                        onClick={() => {
                          const langs = state.settings.languages.includes(lang.code) ? state.settings.languages.filter(l => l !== lang.code) : [...state.settings.languages, lang.code]
                          if (langs.length > 0) updateSettings({ languages: langs })
                        }}>{lang.native}</button>
                    ))}
                  </div>
                </div>
                <div className="sg-field">
                  <label className="sg-label">Test Voice</label>
                  <div className="adm-tts-test">
                    {LANGUAGES.map(lang => (
                      <button key={lang.code} className="adm-tts-btn"
                        onClick={() => testSpeak(lang.code === 'en' ? 'Now serving number 42 at Counter 1' : lang.code === 'ar' ? 'الرقم ٤٢ تفضل إلى الشباك ١' : lang.code === 'ur' ? 'نمبر 42 کاؤنٹر 1 پر آئیں' : 'Numéro 42 au guichet 1 s\'il vous plaît', lang.code, state.settings)}>
                        <span className="adm-tts-play">&#9654;</span>
                        <span>{lang.native}</span>
                      </button>
                    ))}
                  </div>
                  <div className="adm-tts-custom">
                    <input className="adm-input" type="text" placeholder="Type custom text to test..." id="tts-custom-input"
                      onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) testSpeak(e.target.value, state.settings.languages[0] || 'en', state.settings) }} />
                    <div className="adm-tts-custom-btns">
                      {LANGUAGES.filter(l => state.settings.languages.includes(l.code)).map(lang => (
                        <button key={lang.code} className="adm-tts-mini" onClick={() => { const v = document.getElementById('tts-custom-input')?.value; if (v?.trim()) testSpeak(v, lang.code, state.settings) }}>{lang.code.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* GROUP: Display */}
            {showSection('display') && (
            <div className="sg sg--wide">
              <div className="sg-head">
                <svg className="sg-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="16" height="11" rx="2"/><path d="M6 16h6M9 13v3"/></svg>
                <h2 className="sg-title">Display Screen</h2>
              </div>
              <div className="sg-body">
                <div className="sg-field">
                  <label className="sg-label">Layout</label>
                  <div className="adm-layout-grid">
                    {[
                      { id: 'classic', name: 'Classic', desc: 'Counter grid' },
                      { id: 'minimal', name: 'Minimal', desc: 'Single number' },
                      { id: 'ticker', name: 'Ticker', desc: 'Horizontal cards' },
                      { id: 'list', name: 'List', desc: 'Split queue' },
                      { id: 'spotlight', name: 'Spotlight', desc: 'Hero + sidebar' },
                      { id: 'dual', name: 'Dual', desc: 'Left/right split' },
                      { id: 'board', name: 'Board', desc: 'Airport style' },
                      { id: 'cards', name: 'Cards', desc: '3D floating' },
                      { id: 'stadium', name: 'Stadium', desc: 'Score matrix' },
                      { id: 'terminal', name: 'Terminal', desc: 'Retro DOS' },
                      { id: 'news', name: 'News', desc: 'TV channel' },
                      { id: 'table', name: 'Table', desc: 'Spreadsheet' },
                      { id: 'orbit', name: 'Orbit', desc: 'Rotating ring' },
                      { id: 'bubble', name: 'Bubble', desc: 'Float circles' },
                      { id: 'tower', name: 'Tower', desc: 'Depth stack' },
                      { id: 'mosaic', name: 'Mosaic', desc: 'Color tiles' },
                      { id: 'split', name: 'Split', desc: 'Top + strip' },
                      { id: 'sidebar', name: 'Sidebar', desc: 'List + hero' },
                      { id: 'zen', name: 'Zen', desc: 'Just number' },
                      { id: 'banner', name: 'Banner', desc: 'Scroll text' },
                      { id: 'hospital', name: 'Hospital', desc: 'Room cards' },
                      { id: 'bank', name: 'Bank', desc: 'LED display' },
                      { id: 'restaurant', name: 'Restaurant', desc: 'Order ready' },
                    ].map(l => (
                      <button key={l.id} className={`adm-layout-opt ${state.settings.displayLayout === l.id ? 'adm-layout-opt--active' : ''}`}
                        onClick={() => updateSettings({ displayLayout: l.id })}>
                        <span className="adm-layout-name">{l.name}</span>
                        <span className="adm-layout-desc">{l.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sg-row">
                  <div className="sg-field">
                    <label className="sg-label">Floor Map</label>
                    <button className={`adm-set-toggle ${state.settings.floorMapEnabled ? 'adm-set-toggle--on' : ''}`}
                      onClick={() => updateSettings({ floorMapEnabled: !state.settings.floorMapEnabled })}>
                      {state.settings.floorMapEnabled ? 'Shown' : 'Hidden'}</button>
                  </div>
                  <div className="sg-field">
                    <label className="sg-label">Smart Routing</label>
                    <button className={`adm-set-toggle ${state.settings.smartRouting ? 'adm-set-toggle--on' : ''}`}
                      onClick={() => updateSettings({ smartRouting: !state.settings.smartRouting })}>
                      {state.settings.smartRouting ? 'Enabled' : 'Disabled'}</button>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* GROUP: Automation */}
            {showSection('automation') && (
            <div className="sg">
              <div className="sg-head">
                <svg className="sg-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M3.3 14.7l1.4-1.4M13.3 4.7l1.4-1.4"/></svg>
                <h2 className="sg-title">Automation</h2>
              </div>
              <div className="sg-body">
                <div className="sg-row">
                  <div className="sg-field">
                    <label className="sg-label">Idle Timeout</label>
                    <p className="sg-hint">Auto-close counter after inactivity (0 = off)</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="adm-input" type="number" min="0" style={{ width: 80 }}
                        value={state.settings.idleTimeout || 0}
                        onChange={e => updateSettings({ idleTimeout: parseInt(e.target.value) || 0 })} />
                      <span style={{ fontSize: 12, color: 'var(--gray-2)' }}>min</span>
                    </div>
                  </div>
                  {counter && (
                  <div className="sg-field">
                    <label className="sg-label">Counter Categories</label>
                    <p className="sg-hint">This counter serves (empty = all)</p>
                    <div className="adm-set-options">
                      {state.categories.map(cat => (
                        <button key={cat.id} className={`adm-set-opt ${counter.categoryIds.includes(cat.id) ? 'adm-set-opt--active' : ''}`}
                          style={counter.categoryIds.includes(cat.id) ? { borderColor: cat.color, color: cat.color } : {}}
                          onClick={() => {
                            const ids = counter.categoryIds.includes(cat.id) ? counter.categoryIds.filter(id => id !== cat.id) : [...counter.categoryIds, cat.id]
                            emitVoid('counter:update', { counterId, categoryIds: ids })
                          }}>{cat.name}</button>
                      ))}
                    </div>
                  </div>
                  )}
                </div>

                {/* Stage assignment */}
                {counter && (() => {
                  const allStages = []
                  const seen = new Set()
                  state.categories.forEach(cat => {
                    if (counter.categoryIds.length > 0 && !counter.categoryIds.includes(cat.id)) return
                    cat.stages?.forEach(s => {
                      if (!seen.has(s.id)) { seen.add(s.id); allStages.push({ ...s, category: cat.name, color: cat.color }) }
                    })
                  })
                  if (allStages.length === 0) return null
                  return (
                    <div className="sg-field">
                      <label className="sg-label">Stage Assignment</label>
                      <p className="sg-hint">Restrict this counter to one stage (empty = all stages)</p>
                      <div className="adm-set-options">
                        <button className={`adm-set-opt ${!counter.stageId ? 'adm-set-opt--active' : ''}`}
                          onClick={() => emitVoid('counter:update', { counterId, stageId: null })}>
                          All stages
                        </button>
                        {allStages.map(stage => (
                          <button key={stage.id} className={`adm-set-opt ${counter.stageId === stage.id ? 'adm-set-opt--active' : ''}`}
                            style={counter.stageId === stage.id ? { borderColor: stage.color, color: stage.color } : {}}
                            onClick={() => emitVoid('counter:update', { counterId, stageId: stage.id })}>
                            {stage.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
            )}

            {/* GROUP: Media */}
            {showSection('signage') && (
            <div className="sg">
              <div className="sg-head">
                <svg className="sg-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="14" height="12" rx="2"/><path d="M7 7l4 2.5L7 12V7z"/></svg>
                <h2 className="sg-title">Digital Signage</h2>
              </div>
              <div className="sg-body">
                <div className="sg-field">
                  <label className="sg-label">Slides</label>
                  <p className="sg-hint">Add image/video URLs to rotate on display</p>
                  <div className="adm-announce-form">
                    <input className="adm-input" type="text" placeholder="https://example.com/slide.jpg"
                      value={slideUrl} onChange={e => setSlideUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && slideUrl.trim()) { updateSettings({ mediaSlides: [...(state.settings.mediaSlides || []), slideUrl.trim()] }); setSlideUrl('') } }} />
                    <button className="adm-join-btn" onClick={() => { if (slideUrl.trim()) { updateSettings({ mediaSlides: [...(state.settings.mediaSlides || []), slideUrl.trim()] }); setSlideUrl('') } }}>Add</button>
                  </div>
                  {(state.settings.mediaSlides || []).map((s, i) => (
                    <div key={i} className="adm-announce-item" style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s}</span>
                      <button className="adm-announce-rm" onClick={() => updateSettings({ mediaSlides: state.settings.mediaSlides.filter((_, j) => j !== i) })}>×</button>
                    </div>
                  ))}
                </div>
                {(state.settings.mediaSlides || []).length > 0 && (
                  <div className="sg-field">
                    <label className="sg-label">Slide Interval</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="adm-input" type="number" min="5" style={{ width: 80 }}
                        value={state.settings.signageInterval || 10}
                        onChange={e => updateSettings({ signageInterval: parseInt(e.target.value) || 10 })} />
                      <span style={{ fontSize: 12, color: 'var(--gray-2)' }}>seconds</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* GROUP: Advanced */}
            {showSection('advanced') && (
            <div className="sg">
              <div className="sg-head">
                <svg className="sg-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2H6l-4 7 4 7h6l4-7-4-7z"/></svg>
                <h2 className="sg-title">Advanced</h2>
              </div>
              <div className="sg-body">
                <div className="sg-field">
                  <label className="sg-label">Custom CSS</label>
                  <p className="sg-hint">Inject custom styles across all pages</p>
                  <textarea className="adm-textarea" rows={3} placeholder="/* .dsp-counter { border-radius: 0; } */"
                    value={state.settings.customCSS || ''}
                    onChange={e => updateSettings({ customCSS: e.target.value })} />
                </div>
              </div>
            </div>
            )}

          </div>
        )}
      </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {confirmReset && (
          <motion.div className="adm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="adm-modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}>
              <h3>Reset Queue</h3>
              <p>This clears all tickets and history.</p>
              <div className="adm-modal-btns">
                <button className="adm-modal-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
                <button className="adm-modal-btn adm-modal-btn--danger" onClick={handleReset}>Reset</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {transferModal && (
          <motion.div className="adm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="adm-modal adm-modal--wide" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}>
              <h3>Transfer #{(transferModal.displayNumber || padNumber(transferModal.number))}</h3>

              <div className="adm-transfer-section">
                <p className="adm-transfer-label">Send to another room (emergency, switch operator):</p>
                <div className="adm-transfer-rooms">
                  {state.counters.filter(c => c.id !== counterId && c.status === 'open').map(c => {
                    const stage = c.stageId
                      ? state.categories.find(cat => cat.stages?.find(s => s.id === c.stageId))?.stages?.find(s => s.id === c.stageId)
                      : null
                    return (
                      <button key={c.id} className="adm-transfer-room"
                        onClick={() => handleTransferToRoom(c.id)}>
                        <span className="adm-transfer-room-name">{c.name}</span>
                        {c.operatorName && <span className="adm-transfer-room-op">{c.operatorName}</span>}
                        {stage && <span className="adm-transfer-room-stage">{stage.name}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="adm-transfer-divider" />

              <div className="adm-transfer-section">
                <p className="adm-transfer-label">Or change visit type (different workflow):</p>
                <div className="adm-transfer-cats">
                  {state.categories.filter(c => c.id !== transferModal.categoryId).map(cat => (
                    <button key={cat.id} className="adm-transfer-cat" style={{ borderColor: cat.color }}
                      onClick={() => handleTransfer(cat.id)}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <button className="adm-modal-btn" onClick={() => setTransferModal(null)} style={{ marginTop: 12, width: '100%' }}>Cancel</button>
            </motion.div>
          </motion.div>
        )}

        {noteModal && (
          <motion.div className="adm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="adm-modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}>
              <h3>Note for #{(noteModal.displayNumber || padNumber(noteModal.number))}</h3>
              <textarea
                className="adm-textarea"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="e.g. Customer stepped out..."
                autoFocus
              />
              <div className="adm-modal-btns">
                <button className="adm-modal-btn" onClick={() => setNoteModal(null)}>Cancel</button>
                <button className="adm-modal-btn adm-modal-btn--primary" onClick={handleSaveNote}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin logged in toast */}
      <AnimatePresence>
        {adminToast && (
          <motion.div className="adm-toast"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3 3 7-7"/></svg>
            Logged in as Admin
          </motion.div>
        )}
        {savedToast && (
          <motion.div className="adm-toast adm-toast--saved"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3 3 7-7"/></svg>
            Saved
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
