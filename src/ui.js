import { state, save, bus, fmt, fmtPrice, resetState } from './state.js'
import { market } from './market.js'
import { ACHIEVEMENTS, achievements } from './achievements.js'
import { audio } from './audio.js'
import { drawCandles } from './world.js'

const $ = (s) => document.querySelector(s)

const ART = {
  home: ['🛝', 'welcome to recess'],
  trade: ['📈', 'number go up (sometimes)'],
  launch: ['🚀', 'to the moon, probably not'],
  academy: ['🎓', 'class is in session'],
  achievements: ['🏆', 'collect them all'],
  leaderboard: ['🏁', 'fastest kids on the block'],
  controls: ['🎮', 'how to drive'],
  options: ['⚙️', 'tweak the playground'],
  about: ['🧃', 'behind the sandbox'],
}

const RIVALS = [
  ['sandcastle.sol', 38.42], ['monkeybar_max', 41.07], ['recess_ricky', 43.9], ['juicebox_jen', 46.31],
  ['seesaw_sam', 49.85], ['slide_queen', 52.2], ['hopscotch', 57.66], ['tagyoureit', 61.03], ['swingset', 66.4],
]

export class UI {
  constructor({ world, car, onRespawn, onQuality }) {
    this.world = world
    this.car = car
    this.onRespawn = onRespawn
    this.onQuality = onQuality
    this.tab = 'home'
    this.selected = market.tokens[0].symbol
    this.modal = $('#modal')
    this.content = $('#modal-content')

    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.tab)))
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.open)))
    $('#modal-close').addEventListener('click', () => this.close())
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal) this.close() })

    bus.on('toast', (t) => this.toast(t))
    bus.on('wallet', () => this.renderWallet())
    bus.on('tick', () => this.onTick())
    bus.on('achievement', () => { if (this.isOpen && this.tab === 'achievements') this.render() })
    bus.on('race', (e) => this.onRace(e))
    bus.on('rug', ({ token, had }) => {
      audio.rug()
      this.toast({ title: `$${token.symbol} rugged`, text: had ? 'Your bag just went to zero-ish. Painful, but free lesson.' : `Liquidity pulled on $${token.symbol}. ${token.lpLocked ? 'Even locked LP is not a guarantee.' : 'Unlocked LP was the red flag.'}`, bad: true })
      if (had) achievements.unlock('rugged')
    })
    bus.on('trade', (e) => this.onTrade(e))
    bus.on('held-long', () => achievements.unlock('diamondHands'))
    bus.on('launched', (t) => {
      achievements.unlock('launcher')
      this.toast({ title: 'Token launched', text: `$${t.symbol} is live. Watch the rocket!` })
    })
    bus.on('graduated', (t) => {
      if (t.mine) {
        achievements.unlock('graduated')
        this.toast({ title: 'Graduated!', text: `$${t.symbol} filled its bonding curve.` })
      }
    })

    this.renderWallet()
    this.renderTicker()
    setInterval(() => this.renderTicker(), 8000)
  }

  get isOpen() { return !this.modal.hidden }

  open(tab = 'home') {
    this.tab = tab
    this.modal.hidden = false
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab))
    const [emoji, caption] = ART[tab] || ART.home
    $('#modal-art').innerHTML = `<div class="art-grid"></div><div class="art-emoji">${emoji}</div><div class="art-caption">${caption}</div>`
    $('.modal-body').classList.toggle('wide', tab === 'trade')
    this.render()
    if (tab === 'academy') achievements.unlock('student')
  }

  close() {
    this.modal.hidden = true
    document.activeElement?.blur()
  }

  render() {
    const fn = this[`tab_${this.tab}`]
    this.content.innerHTML = fn ? fn.call(this) : ''
    this.content.scrollTop = 0
    this[`bind_${this.tab}`]?.call(this)
  }

  // ---------- Tabs ----------
  tab_home() {
    return `
      <h1>Welcome to Playground</h1>
      <p><strong>Playground</strong> is a tiny floating island where you learn how memecoin markets actually behave, by playing in one.</p>
      <p>Drive around, crash through the toy blocks, collect ticket coins, and paper-trade memecoins in the <strong>Trading Pit</strong>. Launch your own token, get rugged on purpose in <strong>Rug Alley</strong>, and pass the <strong>Rug Academy</strong>.</p>
      <p>Everything runs on <strong>play tickets</strong>. There's no wallet, no real money, and nothing to lose except a bit of pride.</p>
      <h2>Why "Playground"?</h2>
      <p>A playground is where kids learn about risk safely. You climb too high, you fall, you get back up. Memecoins are the scariest climbing frame on the internet, so this island gives you a place to fall without it costing anything.</p>
      <p class="fine">Press <strong>Esc</strong> to close. Drive into any glowing zone and press <strong>Enter</strong>.</p>`
  }

  tab_controls() {
    const keys = [
      ['W A S D / Arrows', 'Drive'], ['Shift', 'Boost'], ['Space', 'Jump'], ['B / Ctrl', 'Brake / drift'], ['Enter', 'Interact with a zone'],
      ['H', 'Honk'], ['R', 'Respawn'], ['M', 'Mute'], ['Esc', 'Menu'], ['Drag', 'Orbit camera'], ['Scroll', 'Zoom'],
    ]
    return `<h1>Controls</h1>
      <div class="keys">${keys.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
      <h2>On mobile</h2>
      <p>Use the joystick on the left to drive. The buttons on the right handle jump, boost, interact and honk.</p>`
  }

  tab_options() {
    return `<h1>Options</h1>
      <div class="rows">
        <div class="row"><span>Audio</span><button class="btn" id="opt-audio">${state.audio ? '🔊 On' : '🔇 Off'}</button></div>
        <div class="row"><span>Quality</span><button class="btn" id="opt-quality">${state.quality === 'high' ? 'High' : 'Low'}</button></div>
        <div class="row"><span>I'm stuck</span><button class="btn" id="opt-respawn">Respawn</button></div>
        <div class="row"><span>Top up tickets</span><button class="btn" id="opt-topup" ${state.tickets > 100 ? 'disabled' : ''}>+1,000</button></div>
        <div class="row"><span>Wipe progress</span><button class="btn danger" id="opt-reset">Reset</button></div>
      </div>
      <p class="fine" style="margin-top:18px">You can top up only once you're under 100 tickets. Try not to need it.</p>`
  }

  bind_options() {
    $('#opt-audio').onclick = () => { audio.setEnabled(!state.audio); save(); this.render() }
    $('#opt-quality').onclick = () => { state.quality = state.quality === 'high' ? 'low' : 'high'; save(); this.onQuality(); this.render() }
    $('#opt-respawn').onclick = () => { this.onRespawn(); this.close() }
    $('#opt-topup').onclick = () => { state.tickets += 1000; save(); this.renderWallet(); this.render() }
    $('#opt-reset').onclick = () => { if (confirm('Reset all progress, tickets and achievements?')) resetState() }
  }

  tab_achievements() {
    const list = ACHIEVEMENTS.map((a) => {
      const p = state.achievements[a.id] || 0
      const done = !!state.unlocked[a.id]
      return `<div class="ach ${done ? 'done' : ''}">
        <div class="ach-head"><span class="ach-title">${done ? '★ ' : ''}${a.title}</span><span class="pill ${done ? 'good' : ''}">${Math.min(p, a.goal)}/${a.goal}</span></div>
        <div class="ach-desc">${a.desc}</div>
        ${a.goal > 1 ? `<div class="bar"><i style="width:${(Math.min(p, a.goal) / a.goal) * 100}%"></i></div>` : ''}
      </div>`
    }).join('')
    return `<h1>Achievements</h1><p class="fine">${achievements.count()} / ${ACHIEVEMENTS.length} unlocked</p>${list}`
  }

  tab_leaderboard() {
    const rows = RIVALS.map(([n, t]) => ({ n, t }))
    if (state.bestLap) rows.push({ n: 'you', t: state.bestLap, me: true })
    rows.sort((a, b) => a.t - b.t)
    const lapRows = rows.slice(0, 10).map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${r.n}</td><td>${r.t.toFixed(2)}s</td></tr>`).join('')
    const net = state.tickets + market.portfolioValue()
    return `<h1>Circuit</h1>
      <p class="fine">Drive through the checkered gate, then every gate in order.</p>
      <table class="board">${lapRows}</table>
      ${!state.bestLap ? '<p class="fine" style="margin-top:10px">You have not set a lap yet. The start gate is on the ring road.</p>' : ''}
      <h2>Your bag</h2>
      <table class="board">
        <tr><td>🎟</td><td>Tickets</td><td>${fmt(state.tickets)}</td></tr>
        <tr><td>💼</td><td>Open positions</td><td>${fmt(market.portfolioValue())}</td></tr>
        <tr><td>Σ</td><td>Net worth</td><td class="${net >= 1000 ? 'up' : 'down'}">${fmt(net)}</td></tr>
        <tr><td>🔁</td><td>Trades</td><td>${fmt(state.trades)}</td></tr>
        <tr><td>🏅</td><td>Best single win</td><td>${fmt(state.bestPnl)}</td></tr>
      </table>`
  }

  tab_academy() {
    return `<h1>Rug Academy</h1>
      <p>In memecoin land, a <strong>rug pull</strong> is when the people behind a token drain its liquidity or dump their bags, and everyone else is left holding something worthless. The tokens in the Trading Pit rug too, and the risky ones rug more often.</p>
      <h2>The four-question checklist</h2>
      <ul class="checklist">
        <li><strong>Is liquidity locked?</strong> If the pool can be pulled any time, it might be. Look for the <span class="pill good">LP locked</span> tag in the Pit.</li>
        <li><strong>How much does the dev hold?</strong> A wallet with 20% or more of supply can crash the chart with one click.</li>
        <li><strong>Can you actually sell?</strong> Some real contracts block selling ("honeypots"). Always test with a small amount.</li>
        <li><strong>Who is shilling it, and why?</strong> Paid promoters, fake volume and countdown hype are all part of the show.</li>
      </ul>
      <h2>Playground rules of thumb</h2>
      <p>Only play with what you can afford to lose. Take profit on the way up. A token being up 900% says nothing about tomorrow. And "it can't go lower" is not a strategy.</p>
      <p class="fine">Playground is a game and an educational toy, not financial advice. No real tokens are shown or traded here.</p>`
  }

  tab_about() {
    return `<h1>Behind the sandbox</h1>
      <p>Playground is a hand-built 3D world made with <a href="https://threejs.org" target="_blank" rel="noopener">Three.js</a> and bundled with <a href="https://vitejs.dev" target="_blank" rel="noopener">Vite</a>. Every model on the island is made from simple shapes in code. There are no downloaded 3D files.</p>
      <h2>The market</h2>
      <p>Token prices are a random walk with pump and dump events mixed in. Rug risk depends on whether liquidity is locked and how much the dev holds. Your own buys and sells nudge the price, just like thin liquidity does on real pairs.</p>
      <h2>The sound</h2>
      <p>The engine, coins, honk and jingles are all synthesized live with the Web Audio API.</p>
      <h2>Saving</h2>
      <p>Tickets, coins and achievements are saved in your browser. Open positions reset when you reload, so sell before you leave.</p>
      <p class="fine">Built for fun. Not financial advice. No wallets, no real money, no tracking.</p>`
  }

  // ---------- Trading ----------
  tab_trade() {
    return `<div class="trade">
      <div class="token-list" id="token-list"></div>
      <div class="trade-main" id="trade-main"></div>
    </div>`
  }

  bind_trade() {
    this.renderTokenList()
    this.renderTradeMain()
  }

  renderTokenList() {
    const el = $('#token-list')
    if (!el) return
    el.innerHTML = market.tokens.map((t) => {
      const chg = market.change(t)
      return `<button class="token ${t.symbol === this.selected ? 'active' : ''} ${t.dead ? 'dead' : ''}" data-sym="${t.symbol}">
        <span><b>${t.emoji} $${t.symbol}</b><br><small>${t.dead ? 'rugged' : fmtPrice(t.price)}</small></span>
        <span class="chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</span>
      </button>`
    }).join('')
    el.querySelectorAll('.token').forEach((b) => b.onclick = () => { this.selected = b.dataset.sym; this.renderTokenList(); this.renderTradeMain() })
  }

  renderTradeMain() {
    const el = $('#trade-main')
    if (!el) return
    const t = market.get(this.selected)
    el.innerHTML = `
      <div class="trade-head">
        <div><h1>${t.emoji} $${t.symbol}</h1><small class="fine">${t.name}${t.mine ? ' · your token' : ''}</small></div>
        <div style="text-align:right"><div class="price" id="t-price"></div><small id="t-chg"></small></div>
      </div>
      <canvas id="chart" width="1200" height="400"></canvas>
      <div class="stats">
        <div class="stat"><small>Market cap</small><b id="t-mcap"></b></div>
        <div class="stat"><small>Liquidity</small><b>${t.lpLocked ? '<span class="pill good">LP locked</span>' : '<span class="pill bad">LP unlocked</span>'}</b></div>
        <div class="stat"><small>Dev holds</small><b class="${t.devPct >= 20 ? 'down' : ''}">${t.devPct}%</b></div>
        <div class="stat"><small>Holders</small><b id="t-holders"></b></div>
      </div>
      <div class="actions">
        <button class="btn buy" data-buy="0.1">Buy 10%</button>
        <button class="btn buy" data-buy="0.25">Buy 25%</button>
        <button class="btn buy" data-buy="0.5">Buy 50%</button>
        <button class="btn buy" data-buy="1">Ape 100%</button>
        <button class="btn sell" data-sell="0.25">Sell 25%</button>
        <button class="btn sell" data-sell="0.5">Sell 50%</button>
        <button class="btn sell" data-sell="1">Sell all</button>
        <button class="btn" id="t-next">Next ›</button>
      </div>
      <div class="position" id="t-pos"></div>
      <p class="fine" style="margin:0">Paper trading with play tickets. Not financial advice.</p>`
    el.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
      const amt = Math.floor(state.tickets * Number(b.dataset.buy))
      if (amt < 1) return this.toast({ title: 'Out of tickets', text: 'Sell something, collect coins, or top up in Options.', bad: true })
      if (!market.buy(t.symbol, amt)) this.toast({ title: 'Trade failed', text: t.dead ? 'This token has been rugged.' : 'Not enough tickets.', bad: true })
    })
    el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => {
      if (!market.sell(t.symbol, Number(b.dataset.sell))) this.toast({ title: 'Nothing to sell', text: `You don't hold any $${t.symbol}.`, bad: true })
    })
    $('#t-next').onclick = () => {
      const i = market.tokens.indexOf(t)
      this.selected = market.tokens[(i + 1) % market.tokens.length].symbol
      this.renderTokenList(); this.renderTradeMain()
    }
    this.updateTradeLive()
  }

  updateTradeLive() {
    const t = market.get(this.selected)
    const canvas = $('#chart')
    if (!canvas || !t) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#15122b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save(); ctx.scale(2, 2)
    drawCandles(ctx, t.candles, 10, 16, canvas.width / 2 - 20, canvas.height / 2 - 30)
    ctx.restore()
    const chg = market.change(t)
    $('#t-price').textContent = t.dead ? 'RUGGED' : fmtPrice(t.price)
    $('#t-chg').innerHTML = `<span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% session</span>`
    $('#t-mcap').textContent = fmt(market.mcap(t))
    $('#t-holders').textContent = fmt(t.holders)
    const pos = market.positions[t.symbol]
    if (pos?.qty > 0) {
      const val = pos.qty * t.price
      const pnl = val - pos.cost
      $('#t-pos').innerHTML = `Position: <strong>${fmt(pos.qty)}</strong> $${t.symbol} · value <strong>${fmt(val)}</strong> tickets · PnL <strong class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${fmt(pnl)} (${((val / pos.cost - 1) * 100).toFixed(1)}%)</strong>`
    } else {
      $('#t-pos').textContent = `No position. You have ${fmt(state.tickets)} tickets.`
    }
  }

  onTrade(e) {
    achievements.unlock('firstTrade')
    if (e.side === 'buy') {
      audio.buy()
      if (e.allIn) achievements.unlock('aped')
    } else {
      audio.sell()
      if (e.pnl > 0) achievements.unlock('green')
      if (e.ratio >= 10) achievements.unlock('tenBagger')
      if (e.heldMs < 5000) achievements.unlock('paperHands')
      if (e.pnl > 0 && e.minRatio <= 0.5) achievements.unlock('comeback')
      this.toast({ title: e.pnl >= 0 ? 'Sold in profit' : 'Sold at a loss', text: `${e.pnl >= 0 ? '+' : ''}${fmt(e.pnl)} tickets on $${e.symbol}`, bad: e.pnl < 0 })
    }
    if (this.isOpen && this.tab === 'trade') this.renderTradeMain()
  }

  // ---------- Launchpad ----------
  tab_launch() {
    const mine = market.tokens.filter((t) => t.mine)
    return `<h1>Launchpad</h1>
      <p>Mint your own memecoin in seconds. Simulated bots will trade it, and you can watch it try to fill its <strong>bonding curve</strong>. When the curve hits 100%, the token "graduates" to a full market.</p>
      <div class="field"><label>Token name</label><input id="l-name" maxlength="28" placeholder="Sandbox Doge" /></div>
      <div class="field"><label>Ticker</label><input id="l-sym" maxlength="8" placeholder="SDOGE" /></div>
      <div class="field"><label>Emoji</label><input id="l-emoji" maxlength="4" placeholder="🐶" /></div>
      <button class="btn primary" id="l-go">Launch token 🚀</button>
      <h2>Your tokens</h2>
      <div id="l-mine">${mine.length ? '' : '<p class="fine">Nothing launched yet.</p>'}</div>`
  }

  bind_launch() {
    $('#l-go').onclick = () => {
      const name = $('#l-name').value.trim()
      const symbol = $('#l-sym').value.trim()
      const emoji = $('#l-emoji').value.trim()
      if (!symbol) return this.toast({ title: 'Needs a ticker', text: 'Every memecoin needs a ticker.', bad: true })
      const t = market.launch({ name, symbol, emoji })
      if (!t) return this.toast({ title: 'Ticker taken', text: 'Pick a different ticker.', bad: true })
      this.selected = t.symbol
      this.render()
    }
    this.updateLaunchLive()
  }

  updateLaunchLive() {
    const el = $('#l-mine')
    if (!el) return
    const mine = market.tokens.filter((t) => t.mine)
    if (!mine.length) return
    el.innerHTML = mine.map((t) => `<div class="ach">
      <div class="ach-head"><span class="ach-title">${t.emoji} $${t.symbol}</span><span class="${market.change(t) >= 0 ? 'up' : 'down'}">${fmtPrice(t.price)}</span></div>
      <div class="curve"><i style="width:${(t.curve * 100).toFixed(1)}%"></i></div>
      <div class="ach-desc">Bonding curve ${(t.curve * 100).toFixed(1)}% ${t.curve >= 1 ? '· graduated 🎓' : ''}</div>
    </div>`).join('') + '<button class="btn" id="l-trade" style="margin-top:12px">Trade it in the Pit ›</button>'
    $('#l-trade').onclick = () => this.open('trade')
  }

  // ---------- Live ----------
  onTick() {
    if (!this.isOpen) return
    if (this.tab === 'trade') {
      this.tickCount = (this.tickCount || 0) + 1
      this.updateTradeLive()
      if (this.tickCount % 4 === 0) this.renderTokenList()
    } else if (this.tab === 'launch') {
      this.updateLaunchLive()
    }
  }

  renderWallet() {
    $('#wallet-value').textContent = fmt(state.tickets)
  }

  renderTicker() {
    $('#ticker-track').innerHTML = market.tokens.map((t) => {
      const chg = market.change(t)
      return `<span><b>${t.emoji} $${t.symbol}</b>${t.dead ? '<span class="down">RUGGED</span>' : `${fmtPrice(t.price)} <span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}%</span>`}</span>`
    }).join('') + '<span><b>🎟 PLAYGROUND</b> paper trading only · not financial advice</span>'
  }

  toast({ title, text, bad }) {
    const el = document.createElement('div')
    el.className = `toast ${bad ? 'bad' : ''}`
    el.innerHTML = `<b>${title}</b>${text}`
    $('#toasts').appendChild(el)
    const all = $('#toasts').children
    if (all.length > 4) all[0].remove()
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400) }, 4200)
  }

  prompt(text) {
    const el = $('#prompt')
    if (!text) { el.hidden = true; return }
    el.hidden = false
    const touch = matchMedia('(pointer: coarse)').matches
    const html = touch ? `<kbd>GO</kbd>${text}` : `<kbd>ENTER</kbd>${text}`
    if (el.dataset.text !== html) { el.innerHTML = html; el.dataset.text = html }
  }

  onRace(e) {
    const el = $('#race-timer')
    if (e.type === 'start') { el.hidden = false; this.toast({ title: 'Lap started', text: 'Hit every gate in order.' }) }
    if (e.type === 'finish') {
      el.hidden = true
      this.toast({ title: e.isBest ? 'New best lap!' : 'Lap complete', text: `${e.lap.toFixed(2)} seconds` })
    }
    if (e.type === 'cancel') { el.hidden = true; this.toast({ title: 'Lap cancelled', text: 'Took too long. Try again from the start gate.', bad: true }) }
  }

  updateRaceTimer(race, gates) {
    if (!race.active) return
    $('#race-timer').innerHTML = `${race.time.toFixed(2)}s<small>gate ${race.next === 0 ? gates : race.next} / ${gates}</small>`
  }

  drawMinimap(world, car) {
    const c = $('#minimap')
    const ctx = c.getContext('2d')
    const s = c.width / 2
    const k = (s - 6) / world.radius
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.save()
    ctx.translate(s, s)
    ctx.rotate(Math.PI / 4) // match the camera view angle
    ctx.fillStyle = 'rgba(143, 227, 184, 0.35)'
    ctx.beginPath(); ctx.arc(0, 0, world.radius * k, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(233, 225, 255, 0.5)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, 0, world.raceR * k, 0, Math.PI * 2); ctx.stroke()
    const colors = { home: '#c6f432', pit: '#5ef0a8', launch: '#ffc23d', academy: '#e9e1ff', rug: '#ff4d6d', whale: '#3d7bff' }
    for (const z of world.zones) {
      ctx.fillStyle = colors[z.id]
      ctx.beginPath(); ctx.arc(z.x * k, z.z * k, 5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#ffc23d'
    for (const co of world.coins) if (co.mesh.visible) ctx.fillRect(co.mesh.position.x * k - 1, co.mesh.position.z * k - 1, 2, 2)
    ctx.translate(car.pos.x * k, car.pos.z * k)
    ctx.rotate(-car.heading)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(4.5, -4); ctx.lineTo(-4.5, -4); ctx.closePath(); ctx.fill()
    ctx.restore()
  }
}
