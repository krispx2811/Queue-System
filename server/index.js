import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import {
  loadStore, saveStore,
  takeTicket, callNext, recallTicket, skipTicket, completeTicket,
  transferTicket, transferToRoom, addNote, holdTicket, unholdTicket, advanceTicket,
  resetQueue, getAnalytics, getAdvancedAnalytics, getMonthlyAnalytics, getTicketPosition,
  findBestCounter, checkIdleCounters, getCategoryWaitTimes,
  addAudit, clockIn, clockOut,
  validateLicenseKey, generateLicenseKey,
} from './store.js'

const app = express()
app.use(express.json())
const http = createServer(app)
const io = new Server(http, { cors: { origin: '*' } })

const state = await loadStore()

setInterval(() => saveStore(state), 10000)

setInterval(() => {
  const timeout = state.settings.idleTimeout
  if (timeout > 0) {
    const closed = checkIdleCounters(state, timeout * 60 * 1000)
    if (closed.length > 0) { addAudit(state, 'counter:auto-closed', 'system', closed.map(c => c.name).join(', ')); broadcast() }
  }
}, 30000)

// ===== Daily auto-reset at 1:00 AM =====
let lastResetDate = null
setInterval(async () => {
  const now = new Date()
  const todayStr = now.toDateString()
  // Trigger between 1:00 and 1:01 AM, only once per day
  if (now.getHours() === 1 && now.getMinutes() === 0 && lastResetDate !== todayStr) {
    lastResetDate = todayStr
    await resetQueue(state)
    addAudit(state, 'admin:auto-reset', 'system', 'Daily 1:00 AM reset')
    console.log('✓ Daily queue auto-reset triggered at 1:00 AM')
    broadcast()
  }
}, 30000)

function broadcast() {
  io.emit('state:sync', getPublicState())
  // Persist every mutation (saveStore is throttled internally to 2s max)
  saveStore(state)
}

function isLicensed() {
  return validateLicenseKey(state.license)
}

function getPublicState() {
  return {
    licensed: isLicensed(),
    counters: state.counters,
    categories: state.categories,
    tickets: state.tickets,
    nextTicketNumber: state.nextTicketNumber,
    announcements: state.announcements,
    settings: state.settings,
    branches: state.branches,
    activeBranch: state.activeBranch,
    auditLog: state.auditLog.slice(0, 100),
    shifts: state.shifts.slice(-50),
    roles: { hasAdmin: !!state.roles.adminPassword, hasOperator: !!state.roles.operatorPassword },
  }
}

// Webhook helper
async function fireWebhooks(event, data) {
  for (const wh of state.webhooks || []) {
    if (wh.events.includes(event) || wh.events.includes('*')) {
      try {
        fetch(wh.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, data, timestamp: Date.now(), branch: state.activeBranch }),
        }).catch(() => {})
      } catch {}
    }
  }
}

// ===== REST API =====
app.get('/api/status', (_, res) => {
  res.json({
    counters: state.counters.map(c => ({ id: c.id, name: c.name, status: c.status, currentTicket: c.currentTicket, operatorName: c.operatorName })),
    categories: state.categories,
    waiting: state.tickets.filter(t => t.status === 'waiting').length,
    serving: state.tickets.filter(t => t.status === 'serving').length,
    served: state.tickets.filter(t => t.status === 'served').length,
    nextTicketNumber: state.nextTicketNumber,
    branch: state.activeBranch,
  })
})

app.get('/api/tickets', (_, res) => {
  res.json(state.tickets)
})

app.get('/api/ticket/:number', (req, res) => {
  const pos = getTicketPosition(state, parseInt(req.params.number))
  if (!pos) return res.status(404).json({ error: 'Not found' })
  res.json(pos)
})

app.post('/api/ticket', (req, res) => {
  const { categoryId } = req.body
  if (!categoryId) return res.status(400).json({ error: 'categoryId required' })
  const ticket = takeTicket(state, categoryId)
  addAudit(state, 'ticket:take', 'api', `#${ticket.number}`)
  fireWebhooks('ticket:take', ticket)
  broadcast()
  res.json(ticket)
})

app.get('/api/analytics', (_, res) => {
  res.json({ ...getAnalytics(state), ...getAdvancedAnalytics(state), ...getMonthlyAnalytics(state) })
})

app.get('/api/audit', (_, res) => {
  res.json(state.auditLog.slice(0, 200))
})

// Global ElevenLabs key — used as fallback if no per-instance key is set
const GLOBAL_ELEVENLABS_KEY = 'sk_edd298b7eed05da619d536b6ea4d36e5157019b7dcc6cb72'

// ElevenLabs TTS — server-side using the SDK
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: 'text required' })

    const apiKey = state.settings.elevenLabsApiKey || GLOBAL_ELEVENLABS_KEY
    const voiceId = state.settings.elevenLabsVoiceId || 'A9ATTqUUQ6GHu0coCz8t'
    const modelId = state.settings.elevenLabsModel || 'eleven_multilingual_v2'

    if (!apiKey) return res.status(400).json({ error: 'No API key configured' })

    const client = new ElevenLabsClient({ apiKey })
    const audio = await client.textToSpeech.convert(voiceId, {
      text,
      modelId,
      voiceSettings: { stability: 0.5, similarityBoost: 0.75, style: 0, useSpeakerBoost: true },
    })

    res.set('Content-Type', 'audio/mpeg')
    if (audio.pipe) {
      audio.pipe(res)
    } else if (audio[Symbol.asyncIterator]) {
      for await (const chunk of audio) res.write(chunk)
      res.end()
    } else {
      res.send(Buffer.from(audio))
    }
  } catch (e) {
    console.error('TTS error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Fetch ElevenLabs voices via server (keeps API key off the client)
app.get('/api/tts/voices', async (_, res) => {
  try {
    const apiKey = state.settings.elevenLabsApiKey || GLOBAL_ELEVENLABS_KEY
    if (!apiKey) return res.json({ voices: [] })
    const client = new ElevenLabsClient({ apiKey })
    const result = await client.voices.getAll()
    res.json({ voices: result.voices || [] })
  } catch (e) {
    res.json({ voices: [], error: e.message })
  }
})

// ===== Socket.IO =====
io.on('connection', (socket) => {
  socket.emit('state:sync', getPublicState())

  // ---- License ----
  socket.on('license:activate', ({ key }, cb) => {
    const valid = validateLicenseKey(key)
    if (valid) {
      state.license = key.trim().toUpperCase()
      addAudit(state, 'license:activated', '', key)
      saveStore(state)
      broadcast()
    }
    cb?.(valid)
  })

  socket.on('license:deactivate', () => {
    state.license = ''
    addAudit(state, 'license:deactivated', '', '')
    saveStore(state)
    broadcast()
  })

  // ---- Auth ----
  socket.on('auth:check', ({ password, role }, cb) => {
    const pw = role === 'admin' ? state.roles.adminPassword : state.roles.operatorPassword
    cb?.(!pw || password === pw)
  })

  socket.on('auth:setPasswords', ({ adminPassword, operatorPassword }) => {
    if (adminPassword !== undefined) state.roles.adminPassword = adminPassword
    if (operatorPassword !== undefined) state.roles.operatorPassword = operatorPassword
    addAudit(state, 'auth:passwords-updated', 'admin')
    broadcast()
  })

  // ---- Ticket ops ----
  socket.on('ticket:take', ({ categoryId }, cb) => {
    const ticket = takeTicket(state, categoryId)
    addAudit(state, 'ticket:take', 'kiosk', `#${ticket.number} [${categoryId}]`)
    fireWebhooks('ticket:take', ticket)

    if (state.settings.smartRouting) {
      const best = findBestCounter(state, categoryId)
      if (best && !best.currentTicket) {
        ticket.status = 'serving'
        ticket.counterId = best.id
        ticket.calledAt = Date.now()
        best.currentTicket = ticket.number
        best.lastActiveAt = Date.now()
        io.emit('ticket:announced', { ticketNumber: ticket.number, counterId: best.id, action: 'next', counterName: best.name })
        fireWebhooks('ticket:called', ticket)
      }
    }
    broadcast()
    cb?.(ticket)
  })

  socket.on('ticket:call', ({ counterId }, cb) => {
    const ticket = callNext(state, counterId)
    broadcast()
    if (ticket) {
      const cName = state.counters.find(c => c.id === counterId)?.name || ''
      addAudit(state, 'ticket:call', cName, `#${ticket.number}`)
      io.emit('ticket:announced', { ticketNumber: ticket.number, counterId, action: 'next', counterName: cName })
      fireWebhooks('ticket:called', { ticket, counter: cName })
    }
    cb?.(ticket)
  })

  socket.on('ticket:recall', ({ counterId }, cb) => {
    const ticket = recallTicket(state, counterId)
    if (ticket) {
      const cName = state.counters.find(c => c.id === counterId)?.name || ''
      addAudit(state, 'ticket:recall', cName, `#${ticket.number}`)
      io.emit('ticket:announced', { ticketNumber: ticket.number, counterId, action: 'recall', counterName: cName })
    }
    cb?.(ticket)
  })

  socket.on('ticket:skip', ({ counterId }, cb) => {
    const ticket = skipTicket(state, counterId)
    if (ticket) addAudit(state, 'ticket:skip', state.counters.find(c => c.id === counterId)?.name || '', `#${ticket.number}`)
    fireWebhooks('ticket:skipped', ticket)
    broadcast()
    cb?.(ticket)
  })

  socket.on('ticket:complete', ({ counterId }, cb) => {
    const ticket = completeTicket(state, counterId)
    const counter = state.counters.find(c => c.id === counterId)
    if (counter) counter.lastActiveAt = Date.now()
    if (ticket) addAudit(state, 'ticket:complete', counter?.name || '', `#${ticket.number}`)
    fireWebhooks('ticket:completed', ticket)
    broadcast()
    cb?.(ticket)
  })

  socket.on('ticket:advance', ({ counterId, targetStageId }, cb) => {
    const result = advanceTicket(state, counterId, targetStageId)
    if (result) {
      const cName = state.counters.find(c => c.id === counterId)?.name || ''
      const action = result.finished ? 'complete' : `advance → ${result.nextStage?.name}`
      addAudit(state, `ticket:${action}`, cName, `#${result.ticket.number}`)
      fireWebhooks(result.finished ? 'ticket:completed' : 'ticket:advanced', result)
    }
    broadcast()
    cb?.(result)
  })

  socket.on('ticket:hold', ({ counterId }, cb) => {
    const ticket = holdTicket(state, counterId)
    if (ticket) addAudit(state, 'ticket:hold', state.counters.find(c => c.id === counterId)?.name || '', `#${ticket.number}`)
    broadcast()
    cb?.(ticket)
  })

  socket.on('ticket:unhold', ({ ticketNumber, counterId }, cb) => {
    const ticket = unholdTicket(state, ticketNumber, counterId)
    broadcast()
    if (ticket) {
      const cName = state.counters.find(c => c.id === counterId)?.name || ''
      addAudit(state, 'ticket:unhold', cName, `#${ticket.number}`)
      io.emit('ticket:announced', { ticketNumber: ticket.number, counterId, action: 'next', counterName: cName })
    }
    cb?.(ticket)
  })

  socket.on('ticket:transferToRoom', ({ ticketNumber, toCounterId, fromCounterId }, cb) => {
    const ticket = transferToRoom(state, ticketNumber, toCounterId, fromCounterId)
    if (ticket) {
      const fromName = state.counters.find(c => c.id === fromCounterId)?.name || ''
      const toName = state.counters.find(c => c.id === toCounterId)?.name || ''
      addAudit(state, 'ticket:transferToRoom', fromName, `#${ticketNumber} → ${toName}`)
    }
    broadcast()
    cb?.(ticket)
  })

  socket.on('ticket:transfer', ({ ticketNumber, toCategoryId, toCounterId }, cb) => {
    const ticket = transferTicket(state, ticketNumber, toCategoryId, toCounterId)
    if (ticket) addAudit(state, 'ticket:transfer', '', `#${ticketNumber} → ${toCategoryId}`)
    broadcast()
    cb?.(ticket)
  })

  socket.on('ticket:note', ({ ticketNumber, note }) => {
    addNote(state, ticketNumber, note)
    broadcast()
  })

  // ---- Counter ops ----
  socket.on('counter:register', ({ counterId, operatorName }) => {
    const counter = state.counters.find(c => c.id === counterId)
    if (counter) {
      counter.operatorName = operatorName
      counter.lastActiveAt = Date.now()
      addAudit(state, 'counter:join', operatorName, counter.name)
      clockIn(state, operatorName, counterId)
    }
    broadcast()
  })

  socket.on('counter:toggle', ({ counterId }) => {
    const counter = state.counters.find(c => c.id === counterId)
    if (counter) {
      counter.status = counter.status === 'open' ? 'closed' : 'open'
      counter.lastActiveAt = Date.now()
      addAudit(state, `counter:${counter.status}`, counter.operatorName || '', counter.name)
    }
    broadcast()
  })

  socket.on('counter:update', ({ counterId, name, operatorName, categoryIds, stageId }) => {
    const counter = state.counters.find(c => c.id === counterId)
    if (counter) {
      if (name !== undefined) { addAudit(state, 'counter:rename', '', `${counter.name} → ${name}`); counter.name = name }
      if (operatorName !== undefined) {
        if (!operatorName && counter.operatorName) {
          clockOut(state, counter.operatorName)
          addAudit(state, 'counter:leave', counter.operatorName, counter.name)
        }
        counter.operatorName = operatorName
      }
      if (categoryIds !== undefined) counter.categoryIds = categoryIds
      if (stageId !== undefined) counter.stageId = stageId
    }
    broadcast()
  })

  socket.on('counter:add', (_, cb) => {
    const maxId = Math.max(0, ...state.counters.map(c => c.id))
    const counter = { id: maxId + 1, name: `Counter ${maxId + 1}`, operatorName: '', currentTicket: null, status: 'open', categoryIds: [], lastActiveAt: 0 }
    state.counters.push(counter)
    addAudit(state, 'counter:add', '', counter.name)
    broadcast()
    cb?.(counter)
  })

  socket.on('counter:delete', ({ counterId }) => {
    const counter = state.counters.find(c => c.id === counterId)
    if (counter) addAudit(state, 'counter:delete', '', counter.name)
    state.counters = state.counters.filter(c => c.id !== counterId)
    broadcast()
  })

  // ---- Admin ops ----
  socket.on('admin:reset', async () => {
    addAudit(state, 'admin:reset', '', 'Queue reset')
    await resetQueue(state)
    broadcast()
  })

  socket.on('admin:announcement', ({ text, action }) => {
    if (action === 'add' && text.trim()) {
      if (!state.announcements.includes(text.trim())) {
        state.announcements.push(text.trim())
        addAudit(state, 'announcement:add', '', text.trim())
      }
    } else if (action === 'remove') {
      state.announcements = state.announcements.filter(a => a !== text)
    }
    broadcast()
  })

  socket.on('admin:analytics', (_, cb) => cb?.(getAnalytics(state)))
  socket.on('admin:advancedAnalytics', (_, cb) => cb?.(getAdvancedAnalytics(state)))
  socket.on('admin:monthlyAnalytics', (_, cb) => cb?.(getMonthlyAnalytics(state)))
  socket.on('admin:export', (_, cb) => cb?.(state.tickets))
  socket.on('admin:categoryWaits', (_, cb) => cb?.(getCategoryWaitTimes(state)))
  socket.on('admin:auditLog', (_, cb) => cb?.(state.auditLog.slice(0, 200)))
  socket.on('admin:shifts', (_, cb) => cb?.(state.shifts.slice(-100)))

  // ---- Settings ----
  socket.on('settings:update', async (settings, cb) => {
    Object.assign(state.settings, settings)
    broadcast()
    // Force immediate save so settings never get lost
    await saveStore(state, { force: true })
    cb?.({ saved: true })
  })

  // ---- Track ----
  socket.on('track:lookup', ({ ticketNumber }, cb) => cb?.(getTicketPosition(state, ticketNumber)))

  // ---- Category management ----
  socket.on('category:add', ({ name, nameAr, nameUr, nameFr, color, prefix, stages }, cb) => {
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const cat = { id, name, nameAr: nameAr || '', nameUr: nameUr || '', nameFr: nameFr || '', color, prefix: prefix || name.charAt(0).toUpperCase(), stages: stages || [] }
    state.categories.push(cat)
    addAudit(state, 'category:add', '', name)
    broadcast()
    cb?.(cat)
  })

  socket.on('category:update', ({ id, name, nameAr, nameUr, nameFr, color, prefix, stages }) => {
    const cat = state.categories.find(c => c.id === id)
    if (cat) {
      if (name !== undefined) cat.name = name
      if (nameAr !== undefined) cat.nameAr = nameAr
      if (nameUr !== undefined) cat.nameUr = nameUr
      if (nameFr !== undefined) cat.nameFr = nameFr
      if (color !== undefined) cat.color = color
      if (prefix !== undefined) cat.prefix = prefix
      if (stages !== undefined) cat.stages = stages
    }
    broadcast()
  })

  socket.on('category:remove', ({ id }) => {
    const cat = state.categories.find(c => c.id === id)
    if (cat) addAudit(state, 'category:remove', '', cat.name)
    state.categories = state.categories.filter(c => c.id !== id)
    broadcast()
  })

  // ---- Branches ----
  socket.on('branch:add', ({ name, nameAr }, cb) => {
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const branch = { id, name, nameAr: nameAr || '' }
    state.branches.push(branch)
    addAudit(state, 'branch:add', '', name)
    broadcast()
    cb?.(branch)
  })

  socket.on('branch:switch', ({ branchId }) => {
    if (state.branches.find(b => b.id === branchId)) {
      state.activeBranch = branchId
      addAudit(state, 'branch:switch', '', branchId)
      broadcast()
    }
  })

  socket.on('branch:remove', ({ branchId }) => {
    if (state.branches.length <= 1) return
    state.branches = state.branches.filter(b => b.id !== branchId)
    if (state.activeBranch === branchId) state.activeBranch = state.branches[0].id
    broadcast()
  })

  // ---- Webhooks ----
  socket.on('webhook:add', ({ url, events }, cb) => {
    const wh = { id: Date.now().toString(), url, events: events || ['*'] }
    state.webhooks = state.webhooks || []
    state.webhooks.push(wh)
    addAudit(state, 'webhook:add', '', url)
    broadcast()
    cb?.(wh)
  })

  socket.on('webhook:remove', ({ id }) => {
    state.webhooks = (state.webhooks || []).filter(w => w.id !== id)
    broadcast()
  })

  socket.on('webhook:list', (_, cb) => cb?.(state.webhooks || []))
})

// ===== Serve built frontend in production =====
const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist')

if (existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA fallback — any non-API route returns index.html
  app.get(/^\/(?!api|socket\.io).*/, (_, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
  console.log('✓ Serving frontend from dist/')
}

const PORT = process.env.PORT || 3210
http.listen(PORT, () => {
  console.log(`Queue server running on port ${PORT}`)
  console.log(`REST API: http://localhost:${PORT}/api/status`)
})

// ===== Graceful shutdown — flush state to Supabase before exit =====
async function shutdown(signal) {
  console.log(`\n${signal} received — flushing state to Supabase...`)
  try {
    await saveStore(state, { force: true })
    console.log('✓ Final state saved')
  } catch (e) {
    console.error('Failed to save on shutdown:', e.message)
  }
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ===== Self-ping to prevent Render free-tier spin-down =====
const APP_URL = process.env.RENDER_EXTERNAL_URL
if (APP_URL) {
  setInterval(() => {
    fetch(`${APP_URL}/api/status`).catch(() => {})
  }, 14 * 60 * 1000)
  console.log(`✓ Self-ping enabled: ${APP_URL}`)
}
