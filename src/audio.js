// All sounds are synthesized with WebAudio — no audio files to load.
import { state } from './state.js'

let ctx, master, engineOsc, engineGain, engineFilter

export const audio = {
  init() {
    if (ctx) return
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = state.audio ? 0.6 : 0
    master.connect(ctx.destination)

    engineOsc = ctx.createOscillator()
    engineOsc.type = 'sawtooth'
    engineFilter = ctx.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 400
    engineGain = ctx.createGain()
    engineGain.gain.value = 0
    engineOsc.connect(engineFilter).connect(engineGain).connect(master)
    engineOsc.start()
  },

  setEnabled(on) {
    state.audio = on
    if (master) master.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.05)
  },

  engine(speed01, boosting) {
    if (!ctx) return
    const t = ctx.currentTime
    engineOsc.frequency.setTargetAtTime(48 + speed01 * 110 + (boosting ? 30 : 0), t, 0.08)
    engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1)
    engineGain.gain.setTargetAtTime(0.025 + speed01 * 0.05, t, 0.1)
  },

  blip(freq = 880, dur = 0.12, type = 'square', vol = 0.12, slide = 0) {
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  },

  coin() { this.blip(988, 0.08, 'square', 0.08); setTimeout(() => this.blip(1319, 0.18, 'square', 0.08), 70) },
  honk() { this.blip(330, 0.28, 'square', 0.1); this.blip(415, 0.28, 'square', 0.07) },
  jump() { this.blip(220, 0.2, 'triangle', 0.15, 300) },
  thud() { this.blip(120, 0.15, 'sine', 0.2, -60) },
  achievement() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.12), i * 90)) },
  rug() { this.blip(600, 0.6, 'sawtooth', 0.1, -560) },
  buy() { this.blip(660, 0.1, 'triangle', 0.1, 400) },
  sell() { this.blip(700, 0.1, 'triangle', 0.1, -300) },
  checkpoint() { this.blip(880, 0.1, 'triangle', 0.1); setTimeout(() => this.blip(1175, 0.12, 'triangle', 0.1), 80) },
}
