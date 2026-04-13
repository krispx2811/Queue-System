import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'data.json')

const DEFAULT_CATEGORIES = [
  { id: 'general', name: 'General', nameAr: 'عام', nameUr: 'عمومی', nameFr: 'Général', color: '#4f8ff7', prefix: 'G' },
  { id: 'payments', name: 'Payments', nameAr: 'المدفوعات', nameUr: 'ادائیگی', nameFr: 'Paiements', color: '#34d399', prefix: 'P' },
  { id: 'inquiries', name: 'Inquiries', nameAr: 'الاستفسارات', nameUr: 'استفسارات', nameFr: 'Renseignements', color: '#fbbf24', prefix: 'Q' },
  { id: 'accounts', name: 'New Accounts', nameAr: 'حسابات جديدة', nameUr: 'نئے اکاؤنٹس', nameFr: 'Nouveaux comptes', color: '#a78bfa', prefix: 'A' },
]

const DEFAULT_COUNTERS = [
  { id: 1, name: 'Counter 1', operatorName: '', currentTicket: null, status: 'open', categoryIds: [] },
  { id: 2, name: 'Counter 2', operatorName: '', currentTicket: null, status: 'open', categoryIds: [] },
  { id: 3, name: 'Counter 3', operatorName: '', currentTicket: null, status: 'open', categoryIds: [] },
]

function makeDefault() {
  return {
    counters: JSON.parse(JSON.stringify(DEFAULT_COUNTERS)),
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    tickets: [],
    nextTicketNumber: 1,
    announcements: [],
    auditLog: [],
    shifts: [],
    roles: {
      adminPassword: '',
      operatorPassword: '',
      viewerPassword: '',
    },
    branches: [{ id: 'main', name: 'Main Branch', nameAr: 'الفرع الرئيسي' }],
    activeBranch: 'main',
    webhooks: [],
    settings: {
      soundTheme: 'default',
      languages: ['en', 'ar'],
      uiLang: 'en',
      volume: 0.8,
      theme: 'light',
      accentColor: '#4f8ff7',
      logoUrl: '',
      mediaSlides: [],
      signageInterval: 10,
      idleTimeout: 0,
      smartRouting: false,
      floorMapEnabled: false,
      backgroundTheme: 'none',
      customCSS: '',
      displayLayout: 'classic',
    },
  }
}

export function loadStore() {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return { ...makeDefault(), ...data }
    }
  } catch {}
  return makeDefault()
}

export function saveStore(state) {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
  } catch (e) {
    console.error('Failed to save store:', e.message)
  }
}

// ---- Ticket operations ----

export function takeTicket(state, categoryId) {
  const number = state.nextTicketNumber++
  const cat = state.categories.find(c => c.id === categoryId)
  const prefix = cat?.prefix || ''
  const ticket = {
    number,
    displayNumber: prefix ? `${prefix}-${String(number).padStart(3, '0')}` : String(number).padStart(3, '0'),
    categoryId,
    status: 'waiting',
    counterId: null,
    createdAt: Date.now(),
    calledAt: null,
    completedAt: null,
    notes: '',
    transferHistory: [],
  }
  state.tickets.push(ticket)
  return ticket
}

export function callNext(state, counterId) {
  const counter = state.counters.find(c => c.id === counterId)
  if (!counter || counter.status === 'closed') return null

  // Complete current ticket if any
  if (counter.currentTicket) {
    const prev = state.tickets.find(t => t.number === counter.currentTicket)
    if (prev && prev.status === 'serving') {
      prev.status = 'served'
      prev.completedAt = Date.now()
    }
  }

  // Find next waiting ticket by number
  const validCategories = counter.categoryIds.length > 0 ? counter.categoryIds : state.categories.map(c => c.id)
  const waiting = state.tickets
    .filter(t => t.status === 'waiting' && validCategories.includes(t.categoryId))
    .sort((a, b) => a.number - b.number)

  const next = waiting[0]
  if (!next) {
    counter.currentTicket = null
    return null
  }

  next.status = 'serving'
  next.counterId = counterId
  counter.lastActiveAt = Date.now()
  next.calledAt = Date.now()
  counter.currentTicket = next.number
  return next
}

export function recallTicket(state, counterId) {
  const counter = state.counters.find(c => c.id === counterId)
  if (!counter || !counter.currentTicket) return null
  const ticket = state.tickets.find(t => t.number === counter.currentTicket)
  return ticket || null
}

export function skipTicket(state, counterId) {
  const counter = state.counters.find(c => c.id === counterId)
  if (!counter || !counter.currentTicket) return null

  const ticket = state.tickets.find(t => t.number === counter.currentTicket)
  if (ticket) {
    ticket.status = 'skipped'
    ticket.completedAt = Date.now()
  }
  counter.currentTicket = null
  return ticket
}

export function completeTicket(state, counterId) {
  const counter = state.counters.find(c => c.id === counterId)
  if (!counter || !counter.currentTicket) return null

  const ticket = state.tickets.find(t => t.number === counter.currentTicket)
  if (ticket) {
    ticket.status = 'served'
    ticket.completedAt = Date.now()
  }
  counter.currentTicket = null
  return ticket
}

export function transferTicket(state, ticketNumber, toCategoryId, toCounterId = null) {
  const ticket = state.tickets.find(t => t.number === ticketNumber)
  if (!ticket) return null

  ticket.transferHistory.push({
    fromCategoryId: ticket.categoryId,
    fromCounterId: ticket.counterId,
    at: Date.now(),
  })

  // Free up the old counter
  if (ticket.counterId) {
    const oldCounter = state.counters.find(c => c.id === ticket.counterId)
    if (oldCounter && oldCounter.currentTicket === ticketNumber) {
      oldCounter.currentTicket = null
    }
  }

  ticket.categoryId = toCategoryId
  ticket.status = 'waiting'
  ticket.counterId = null

  if (toCounterId) {
    const dest = state.counters.find(c => c.id === toCounterId)
    if (dest) {
      ticket.status = 'serving'
      ticket.counterId = toCounterId
      ticket.calledAt = Date.now()
      dest.currentTicket = ticketNumber
    }
  }

  return ticket
}

export function holdTicket(state, counterId) {
  const counter = state.counters.find(c => c.id === counterId)
  if (!counter || !counter.currentTicket) return null

  const ticket = state.tickets.find(t => t.number === counter.currentTicket)
  if (ticket) {
    ticket.status = 'held'
    ticket.heldAt = Date.now()
    ticket.heldByCounterId = counterId
  }
  counter.currentTicket = null
  return ticket
}

export function unholdTicket(state, ticketNumber, counterId) {
  const ticket = state.tickets.find(t => t.number === ticketNumber && t.status === 'held')
  if (!ticket) return null

  const counter = state.counters.find(c => c.id === counterId)
  if (!counter) return null

  // Complete current ticket at counter if any
  if (counter.currentTicket) {
    const prev = state.tickets.find(t => t.number === counter.currentTicket)
    if (prev && prev.status === 'serving') {
      prev.status = 'served'
      prev.completedAt = Date.now()
    }
  }

  ticket.status = 'serving'
  ticket.counterId = counterId
  ticket.calledAt = Date.now()
  ticket.heldAt = null
  counter.currentTicket = ticket.number
  counter.lastActiveAt = Date.now()
  return ticket
}

export function addNote(state, ticketNumber, note) {
  const ticket = state.tickets.find(t => t.number === ticketNumber)
  if (ticket) ticket.notes = note
  return ticket
}

export function resetQueue(state) {
  state.tickets = []
  state.nextTicketNumber = 1
  state.counters.forEach(c => { c.currentTicket = null })
}

export function getAnalytics(state) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()

  const todayTickets = state.tickets.filter(t => t.createdAt >= todayMs)
  const served = todayTickets.filter(t => t.status === 'served')

  // avg service time
  const serviceTimes = served
    .filter(t => t.calledAt && t.completedAt)
    .map(t => (t.completedAt - t.calledAt) / 1000)
  const avgServiceTime = serviceTimes.length > 0
    ? Math.round(serviceTimes.reduce((a, b) => a + b, 0) / serviceTimes.length)
    : 0

  // avg wait time
  const waitTimes = served
    .filter(t => t.calledAt)
    .map(t => (t.calledAt - t.createdAt) / 1000)
  const avgWaitTime = waitTimes.length > 0
    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
    : 0

  // peak hours (0-23)
  const hourCounts = Array(24).fill(0)
  todayTickets.forEach(t => {
    const h = new Date(t.createdAt).getHours()
    hourCounts[h]++
  })

  // category breakdown
  const categoryBreakdown = {}
  todayTickets.forEach(t => {
    categoryBreakdown[t.categoryId] = (categoryBreakdown[t.categoryId] || 0) + 1
  })

  return {
    totalIssued: todayTickets.length,
    totalServed: served.length,
    totalWaiting: todayTickets.filter(t => t.status === 'waiting').length,
    totalSkipped: todayTickets.filter(t => t.status === 'skipped').length,
    avgServiceTime,
    avgWaitTime,
    hourCounts,
    categoryBreakdown,
  }
}

export function getTicketPosition(state, ticketNumber) {
  const ticket = state.tickets.find(t => t.number === ticketNumber)
  if (!ticket) return null

  if (ticket.status !== 'waiting') {
    return { ticket, position: 0, estimatedWait: 0 }
  }

  const ahead = state.tickets.filter(
    t => t.status === 'waiting' &&
      t.categoryId === ticket.categoryId &&
      t.number < ticket.number
  ).length

  return { ticket, position: ahead + 1, estimatedWait: (ahead + 1) * 2 }
}

export function getAdvancedAnalytics(state) {
  const now = Date.now()
  const allServed = state.tickets.filter(t => t.status === 'served' && t.calledAt && t.completedAt)

  // Weekly trends (last 7 days)
  const weeklyTrends = []
  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date(now)
    dayStart.setDate(dayStart.getDate() - d)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const dayTickets = state.tickets.filter(t => t.createdAt >= dayStart.getTime() && t.createdAt < dayEnd.getTime())
    const dayServed = dayTickets.filter(t => t.status === 'served')
    weeklyTrends.push({
      date: dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      dayName: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      issued: dayTickets.length,
      served: dayServed.length,
    })
  }

  // Busiest day of week (all-time)
  const dayOfWeekCounts = Array(7).fill(0)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  state.tickets.forEach(t => {
    dayOfWeekCounts[new Date(t.createdAt).getDay()]++
  })

  // Operator performance
  const operatorStats = {}
  state.counters.forEach(c => {
    if (!c.operatorName) return
    const opTickets = allServed.filter(t => t.counterId === c.id)
    const serviceTimes = opTickets.map(t => (t.completedAt - t.calledAt) / 1000)
    operatorStats[c.operatorName] = {
      counterId: c.id,
      counterName: c.name,
      totalServed: opTickets.length,
      avgServiceTime: serviceTimes.length > 0 ? Math.round(serviceTimes.reduce((a, b) => a + b, 0) / serviceTimes.length) : 0,
    }
  })

  // Service time by category
  const categoryServiceTimes = {}
  state.categories.forEach(cat => {
    const catServed = allServed.filter(t => t.categoryId === cat.id)
    const times = catServed.map(t => (t.completedAt - t.calledAt) / 1000)
    categoryServiceTimes[cat.id] = {
      name: cat.name,
      color: cat.color,
      totalServed: catServed.length,
      avgServiceTime: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    }
  })

  return { weeklyTrends, dayOfWeekCounts, dayNames, operatorStats, categoryServiceTimes }
}

// Smart routing — find the best counter for a ticket
export function findBestCounter(state, categoryId) {
  const eligible = state.counters.filter(c => {
    if (c.status === 'closed' || !c.operatorName) return false
    if (c.categoryIds.length > 0 && !c.categoryIds.includes(categoryId)) return false
    return true
  })
  if (eligible.length === 0) return null

  // Pick counter with least active tickets
  return eligible.sort((a, b) => {
    const aLoad = state.tickets.filter(t => t.counterId === a.id && t.status === 'serving').length
    const bLoad = state.tickets.filter(t => t.counterId === b.id && t.status === 'serving').length
    return aLoad - bLoad
  })[0]
}

// Check and close idle counters
export function checkIdleCounters(state, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return []
  const now = Date.now()
  const closed = []
  state.counters.forEach(c => {
    if (c.status === 'open' && c.operatorName && !c.currentTicket) {
      const lastActive = c.lastActiveAt || 0
      if (lastActive > 0 && (now - lastActive) > timeoutMs) {
        c.status = 'closed'
        closed.push(c)
      }
    }
  })
  return closed
}

// Get estimated wait per category
export function getCategoryWaitTimes(state) {
  const result = {}
  for (const cat of state.categories) {
    const waiting = state.tickets.filter(t => t.status === 'waiting' && t.categoryId === cat.id).length
    const served = state.tickets.filter(t => t.status === 'served' && t.categoryId === cat.id && t.calledAt && t.completedAt)
    const avgService = served.length > 0
      ? served.reduce((sum, t) => sum + (t.completedAt - t.calledAt), 0) / served.length / 1000
      : 120
    result[cat.id] = { waiting, avgServiceSec: Math.round(avgService), estWaitMin: Math.max(1, Math.round((waiting * avgService) / 60)) }
  }
  return result
}

// ---- Audit Log ----
export function addAudit(state, action, actor, details = '') {
  const entry = { action, actor, details, timestamp: Date.now() }
  state.auditLog.unshift(entry)
  if (state.auditLog.length > 500) state.auditLog.length = 500
  return entry
}

// ---- Shifts ----
export function clockIn(state, operatorName, counterId) {
  const shift = { operatorName, counterId, clockIn: Date.now(), clockOut: null }
  state.shifts.push(shift)
  return shift
}

export function clockOut(state, operatorName) {
  const shift = [...state.shifts].reverse().find(s => s.operatorName === operatorName && !s.clockOut)
  if (shift) shift.clockOut = Date.now()
  return shift
}

// ---- Monthly Analytics ----
export function getMonthlyAnalytics(state) {
  const now = Date.now()
  const monthlyTrends = []
  for (let d = 29; d >= 0; d--) {
    const dayStart = new Date(now)
    dayStart.setDate(dayStart.getDate() - d)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const dayTickets = state.tickets.filter(t => t.createdAt >= dayStart.getTime() && t.createdAt < dayEnd.getTime())
    monthlyTrends.push({
      date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      served: dayTickets.filter(t => t.status === 'served').length,
      issued: dayTickets.length,
    })
  }

  // Wait time histogram (buckets: 0-1m, 1-2m, 2-5m, 5-10m, 10-15m, 15m+)
  const buckets = [0, 0, 0, 0, 0, 0]
  const bucketLabels = ['<1m', '1-2m', '2-5m', '5-10m', '10-15m', '15m+']
  state.tickets.filter(t => t.status === 'served' && t.calledAt).forEach(t => {
    const waitMin = (t.calledAt - t.createdAt) / 60000
    if (waitMin < 1) buckets[0]++
    else if (waitMin < 2) buckets[1]++
    else if (waitMin < 5) buckets[2]++
    else if (waitMin < 10) buckets[3]++
    else if (waitMin < 15) buckets[4]++
    else buckets[5]++
  })

  return { monthlyTrends, waitHistogram: { buckets, labels: bucketLabels } }
}
