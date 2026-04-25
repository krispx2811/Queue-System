// ============================================================================
// CLINIC SETUP — Edit this file to configure your counters and rooms
// ============================================================================
// This file is loaded ONCE when the server starts with no existing data.json.
// To re-apply changes after editing this file, delete server/data.json and
// restart the server. Existing data will be preserved otherwise.
// ============================================================================

export const CLINIC_COUNTERS = [
  // ---- Reception ----
  { id: 1, name: 'Reception 1', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'reception', lastActiveAt: 0 },
  { id: 2, name: 'Reception 2', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'reception', lastActiveAt: 0 },
  { id: 3, name: 'Reception 3', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'reception', lastActiveAt: 0 },

  // ---- OPD (Outpatient Department) ----
  { id: 4, name: 'OPD A', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'opd', lastActiveAt: 0 },

  // ---- Optometrist Rooms ----
  { id: 5, name: 'Optometrist B1', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'optometrist', lastActiveAt: 0 },
  { id: 6, name: 'Optometrist B2', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'optometrist', lastActiveAt: 0 },

  // ---- Doctor Rooms (set operatorName here once you give me the doctor names) ----
  { id: 7, name: 'Doctor D1', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'doctor', lastActiveAt: 0 },
  { id: 8, name: 'Doctor D2', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'doctor', lastActiveAt: 0 },
  { id: 9, name: 'Doctor D3', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'doctor', lastActiveAt: 0 },
  { id: 10, name: 'Doctor D4', operatorName: '', currentTicket: null, status: 'open', categoryIds: [], stageId: 'doctor', lastActiveAt: 0 },
]

export const CLINIC_CATEGORIES = [
  // General Consultation — Reception → OPD → Doctor
  {
    id: 'consultation',
    name: 'Consultation',
    nameAr: 'استشارة',
    nameUr: 'مشاورت',
    nameFr: 'Consultation',
    color: '#4f8ff7',
    prefix: 'C',
    stages: [
      { id: 'reception', name: 'Reception' },
      { id: 'opd', name: 'OPD' },
      { id: 'doctor', name: 'Doctor' },
    ],
  },

  // Eye Exam — Reception → OPD → Optometrist
  {
    id: 'eye-exam',
    name: 'Eye Exam',
    nameAr: 'فحص عيون',
    nameUr: 'آنکھوں کا معائنہ',
    nameFr: 'Examen oculaire',
    color: '#34d399',
    prefix: 'E',
    stages: [
      { id: 'reception', name: 'Reception' },
      { id: 'opd', name: 'OPD' },
      { id: 'optometrist', name: 'Optometrist' },
    ],
  },

  // Walk-in / Direct (skips OPD, goes straight to doctor)
  {
    id: 'walk-in',
    name: 'Walk-in',
    nameAr: 'مراجعة عاجلة',
    nameUr: 'فوری ملاقات',
    nameFr: 'Sans rendez-vous',
    color: '#fbbf24',
    prefix: 'W',
    stages: [
      { id: 'reception', name: 'Reception' },
      { id: 'doctor', name: 'Doctor' },
    ],
  },
]
