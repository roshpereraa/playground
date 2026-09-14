// Persistent player state (localStorage) + a tiny event bus.
const KEY = 'playground-save-v1'

const defaults = () => ({
  tickets: 1000,
  audio: true,
  quality: 'high',
  achievements: {}, // id -> progress number
  unlocked: {}, // id -> timestamp
  coins: [], // collected coin indices
  zonesVisited: [],
  letterHits: [],
  bestLap: null,
  jumps: 0,
  honks: 0,
  trades: 0,
  bestPnl: 0,
  name: '',
})

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) }
  } catch {}
  return defaults()
}

export const state = load()

let saveTimer = null
export function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  }, 200)
}

export function resetState() {
  try { localStorage.removeItem(KEY) } catch {}
  location.reload()
}

const listeners = {}
export const bus = {
  on(evt, fn) { (listeners[evt] ||= []).push(fn) },
  emit(evt, data) { (listeners[evt] || []).forEach((fn) => fn(data)) },
}

export const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export function fmtPrice(p) {
  if (p >= 1) return p.toFixed(3)
  const decimals = Math.min(10, 2 - Math.floor(Math.log10(p)) + 1)
  return p.toFixed(Math.max(4, decimals))
}
