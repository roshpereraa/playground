// Simulated memecoin market. Nothing here touches a real chain or real money.
import { state, save, bus } from './state.js'

const TICK_MS = 250
const TICKS_PER_CANDLE = 8
const MAX_CANDLES = 90

const SEED_TOKENS = [
  { symbol: 'SLIDE', name: 'Slide Protocol', emoji: '🛝', price: 0.0042, vol: 0.018, lpLocked: true, devPct: 3 },
  { symbol: 'SWING', name: 'Swing Finance', emoji: '🪢', price: 0.0131, vol: 0.022, lpLocked: true, devPct: 6 },
  { symbol: 'SANDY', name: 'Sandbox Cat', emoji: '🐈', price: 0.00088, vol: 0.03, lpLocked: false, devPct: 22 },
  { symbol: 'SEESAW', name: 'Seesaw Inu', emoji: '🐕', price: 0.0027, vol: 0.026, lpLocked: true, devPct: 9 },
  { symbol: 'MONKEY', name: 'Monkey Bars', emoji: '🐒', price: 0.00041, vol: 0.035, lpLocked: false, devPct: 31 },
  { symbol: 'GRAPE', name: 'Grape Juice Box', emoji: '🧃', price: 0.064, vol: 0.012, lpLocked: true, devPct: 2 },
  { symbol: 'RECESS', name: 'Recess Forever', emoji: '🔔', price: 0.0019, vol: 0.028, lpLocked: false, devPct: 14 },
]

const SUPPLY = 1_000_000_000

function makeToken(t) {
  const token = {
    ...t,
    supply: SUPPLY,
    open: t.price,
    candles: [],
    tick: 0,
    event: null, // { type: 'pump'|'dump', ticks, strength }
    dead: false,
    holders: Math.floor(200 + Math.random() * 3000),
    curve: t.curve ?? null, // bonding curve progress 0..1 for launched tokens
    mine: !!t.mine,
  }
  // Pre-fill history so charts are not empty
  let p = t.price
  for (let i = 0; i < 60; i++) {
    const o = p
    let h = p, l = p
    for (let k = 0; k < TICKS_PER_CANDLE; k++) {
      p *= Math.exp((Math.random() - 0.5) * t.vol * 2)
      h = Math.max(h, p); l = Math.min(l, p)
    }
    token.candles.push({ o, h, l, c: p })
  }
  token.price = p
  token.open = p // session change is measured from when you arrived
  token.anchor = t.price
  return token
}

export const market = {
  tokens: SEED_TOKENS.map(makeToken),
  positions: {}, // symbol -> { qty, cost, openedAt, minValueRatio }

  get(symbol) { return this.tokens.find((t) => t.symbol === symbol) },

  start() {
    setInterval(() => this.step(), TICK_MS)
  },

  step() {
    for (const t of this.tokens) {
      if (t.dead) {
        // Dead tokens occasionally get "revived" by a new community (a relaunch)
        if (Math.random() < 0.002) this.revive(t)
        continue
      }
      let drift = 0
      if (!t.event) {
        const rugChance = (t.lpLocked ? 0.00001 : 0.00018) * (1 + t.devPct / 10)
        if (!t.mine && Math.random() < rugChance) { this.rug(t); continue }
        if (Math.random() < 0.004) t.event = { type: 'pump', ticks: 20 + Math.random() * 40, strength: 0.006 + Math.random() * 0.018 }
        else if (Math.random() < 0.003) t.event = { type: 'dump', ticks: 15 + Math.random() * 30, strength: 0.006 + Math.random() * 0.016 }
      }
      if (t.event) {
        drift = t.event.type === 'pump' ? t.event.strength : -t.event.strength
        if (--t.event.ticks <= 0) t.event = null
      }
      // Mean-reverting pull back toward open keeps things from exploding forever
      const revert = -Math.log(t.price / t.anchor) * 0.004
      const shock = (Math.random() - 0.5) * t.vol * 1.2
      t.price = Math.max(1e-9, t.price * Math.exp(drift + shock + revert))
      if (t.curve !== null && t.curve < 1) {
        t.curve = Math.min(1, Math.max(0, t.curve + (drift + shock) * 0.08 + 0.0006))
        if (t.curve >= 1) bus.emit('graduated', t)
      }
      this.updateCandle(t)
    }
    this.checkPositions()
    bus.emit('tick')
  },

  updateCandle(t) {
    const last = t.candles[t.candles.length - 1]
    if (t.tick++ % TICKS_PER_CANDLE === 0) {
      t.candles.push({ o: last.c, h: t.price, l: t.price, c: t.price })
      if (t.candles.length > MAX_CANDLES) t.candles.shift()
    } else {
      last.c = t.price
      last.h = Math.max(last.h, t.price)
      last.l = Math.min(last.l, t.price)
    }
  },

  rug(t) {
    t.price *= 0.04
    t.dead = true
    t.event = null
    this.updateCandle(t)
    const had = this.positions[t.symbol]?.qty > 0
    bus.emit('rug', { token: t, had })
  },

  revive(t) {
    t.dead = false
    t.open = t.price
    t.anchor = t.price
    t.lpLocked = Math.random() < 0.5
    t.devPct = Math.floor(Math.random() * 30)
    bus.emit('toast', { title: 'Relaunch', text: `$${t.symbol} was revived by a new community. Same ticker, new risks.` })
  },

  change(t) {
    return (t.price / t.open - 1) * 100
  },

  mcap(t) { return t.price * t.supply },

  buy(symbol, tickets) {
    const t = this.get(symbol)
    if (!t || t.dead || tickets <= 0 || tickets > state.tickets + 1e-9) return false
    const allIn = tickets >= state.tickets - 0.5 && state.tickets > 50
    const slip = 1 + Math.min(0.05, tickets / 200000) // tiny slippage
    const qty = tickets / (t.price * slip)
    const pos = (this.positions[symbol] ||= { qty: 0, cost: 0, openedAt: Date.now(), minRatio: 1 })
    if (pos.qty === 0) { pos.openedAt = Date.now(); pos.minRatio = 1 }
    pos.qty += qty
    pos.cost += tickets
    state.tickets -= tickets
    t.price *= 1 + Math.min(0.08, tickets / 40000) // your buy nudges price
    t.holders++
    state.trades++
    save()
    bus.emit('trade', { side: 'buy', symbol, tickets, allIn })
    bus.emit('wallet')
    return true
  },

  sell(symbol, fraction) {
    const t = this.get(symbol)
    const pos = this.positions[symbol]
    if (!t || !pos || pos.qty <= 0) return false
    const qty = pos.qty * fraction
    const proceeds = qty * t.price * 0.99
    const costPart = pos.cost * fraction
    const pnl = proceeds - costPart
    const ratio = proceeds / costPart
    const heldMs = Date.now() - pos.openedAt
    pos.qty -= qty
    pos.cost -= costPart
    if (pos.qty < 1e-6) { pos.qty = 0; pos.cost = 0 }
    state.tickets += proceeds
    t.price *= 1 - Math.min(0.08, proceeds / 40000)
    state.trades++
    if (pnl > state.bestPnl) state.bestPnl = pnl
    save()
    bus.emit('trade', { side: 'sell', symbol, proceeds, pnl, ratio, heldMs, minRatio: pos.minRatio })
    bus.emit('wallet')
    return true
  },

  checkPositions() {
    for (const [symbol, pos] of Object.entries(this.positions)) {
      if (pos.qty <= 0) continue
      const t = this.get(symbol)
      const ratio = (pos.qty * t.price) / pos.cost
      pos.minRatio = Math.min(pos.minRatio, ratio)
      if (Date.now() - pos.openedAt > 120000) bus.emit('held-long', symbol)
    }
  },

  portfolioValue() {
    let v = 0
    for (const [symbol, pos] of Object.entries(this.positions)) v += pos.qty * this.get(symbol).price
    return v
  },

  launch({ name, symbol, emoji }) {
    symbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (!symbol || this.get(symbol)) return null
    const t = makeToken({ symbol, name: name.slice(0, 28) || symbol, emoji: emoji || '🪙', price: 0.00002, vol: 0.03, lpLocked: true, devPct: 0, curve: 0.02, mine: true })
    this.tokens.unshift(t)
    bus.emit('launched', t)
    return t
  },
}
