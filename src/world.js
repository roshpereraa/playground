import * as THREE from 'three'
import { state, save, bus, fmtPrice } from './state.js'
import { market } from './market.js'
import { achievements } from './achievements.js'
import { audio } from './audio.js'

const C = {
  ink: '#15122b', grass: '#8fe3b8', grassDark: '#5cc995', path: '#fff3d6', road: '#e9e1ff',
  lime: '#c6f432', grape: '#7b5cff', mint: '#5ef0a8', coral: '#ff4d6d', sun: '#ffc23d', blue: '#3d7bff', rock: '#4a3f86',
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o })
const glow = (color, i = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i })

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const polar = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r]

// 5x7 bitmap font for the toy-block title
const GLYPHS = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, ctx, canvas }
}

export class World {
  constructor(scene) {
    this.scene = scene
    this.radius = 72
    this.colliders = []
    this.time = 0
    this.random = rng(7)

    const [pitX, pitZ] = polar(170, 36)
    const [whaleX, whaleZ] = polar(120, 38)
    const [acadX, acadZ] = polar(225, 36)
    const [launchX, launchZ] = polar(280, 36)
    const [rugX, rugZ] = polar(340, 36)

    this.zones = [
      { id: 'home', name: 'Home', x: 0, z: 0, r: 5, tab: 'home', prompt: 'Open the menu' },
      { id: 'pit', name: 'Trading Pit', x: pitX, z: pitZ, r: 10, tab: 'trade', prompt: 'Enter the Trading Pit' },
      { id: 'launch', name: 'Launchpad', x: launchX, z: launchZ, r: 9, tab: 'launch', prompt: 'Launch a token' },
      { id: 'academy', name: 'Rug Academy', x: acadX, z: acadZ, r: 8, tab: 'academy', prompt: 'Read the Rug Academy' },
      { id: 'rug', name: 'Rug Alley', x: rugX, z: rugZ, r: 9, tab: null, prompt: null },
      { id: 'whale', name: 'Whale Pond', x: whaleX, z: whaleZ, r: 15, tab: null, prompt: 'Press H to honk at the whale' },
    ]

    this.buildLights()
    this.buildIsland()
    this.buildPaths()
    this.buildHome()
    this.buildLetters()
    this.buildPit(pitX, pitZ)
    this.buildLaunchpad(launchX, launchZ)
    this.buildAcademy(acadX, acadZ)
    this.buildRug(rugX, rugZ)
    this.buildWhale(whaleX, whaleZ)
    this.buildRace()
    this.buildTrees()
    this.buildCoins()
    this.buildParticles()
    this.buildSky()

    bus.on('tick', () => this.drawScreens())
    bus.on('launched', () => this.launchRocket())
  }

  // ---------- Environment ----------
  buildLights() {
    this.scene.background = new THREE.Color(C.ink)
    this.scene.fog = new THREE.Fog(C.ink, 110, 240)
    this.scene.add(new THREE.HemisphereLight('#fff4e6', '#5a4aa8', 1.4))
    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(30, 60, 20)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const s = 45
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 160 })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.04
    this.scene.add(sun, sun.target)
    this.sun = sun
  }

  setQuality(q) {
    this.sun.castShadow = q === 'high'
  }

  buildIsland() {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(this.radius, this.radius - 2, 3, 72), mat(C.grass))
    top.position.y = -1.5
    top.receiveShadow = true
    this.scene.add(top)
    const under = new THREE.Mesh(new THREE.ConeGeometry(this.radius - 2, 40, 12), mat(C.rock))
    under.rotation.x = Math.PI
    under.position.y = -23
    this.scene.add(under)
    // floating rock bits
    for (let i = 0; i < 10; i++) {
      const [x, z] = polar(i * 36 + this.random() * 20, this.radius + 10 + this.random() * 25)
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + this.random() * 3, 0), mat(i % 2 ? C.rock : C.grape))
      rock.position.set(x, -6 - this.random() * 20, z)
      rock.userData.float = this.random() * 10
      this.scene.add(rock)
      ;(this.floaters ||= []).push(rock)
    }
    // grass tufts (instanced)
    const tuft = new THREE.ConeGeometry(0.25, 0.9, 4)
    tuft.translate(0, 0.45, 0)
    const tufts = new THREE.InstancedMesh(tuft, mat(C.grassDark), 900)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 900; i++) {
      const a = this.random() * Math.PI * 2, r = 6 + Math.sqrt(this.random()) * (this.radius - 8)
      m.makeRotationY(this.random() * 3).setPosition(Math.cos(a) * r, 0, Math.sin(a) * r)
      m.scale(new THREE.Vector3(1, 0.6 + this.random(), 1))
      tufts.setMatrixAt(i, m)
    }
    this.scene.add(tufts)
  }

  buildPaths() {
    const pathMat = mat(C.path)
    for (const z of this.zones) {
      if (z.id === 'home') continue
      const d = Math.hypot(z.x, z.z)
      const len = d - z.r * 0.6
      const path = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, len), pathMat)
      const a = Math.atan2(z.x, z.z)
      path.position.set(Math.sin(a) * len / 2, 0.02, Math.cos(a) * len / 2)
      path.rotation.y = a
      path.receiveShadow = true
      this.scene.add(path)
    }
  }

  addCollider(x, z, r) { this.colliders.push({ x, z, r }) }

  sign(title, sub, x, z, rotY, color = C.lime) {
    const g = new THREE.Group()
    const { tex } = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.strokeRect(10, 10, w - 20, h - 20)
      ctx.fillStyle = color; ctx.textAlign = 'center'
      ctx.font = '44px "Rubik Mono One", sans-serif'
      ctx.fillText(title, w / 2, 120)
      ctx.fillStyle = '#f3f0ff'; ctx.font = '500 28px "Space Grotesk", sans-serif'
      ctx.fillText(sub, w / 2, 180)
    })
    const board = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.2), [mat(C.ink), mat(C.ink), mat(C.ink), mat(C.ink), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), mat(C.ink)])
    board.position.y = 3.2
    board.castShadow = true
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), mat(C.ink))
    post.position.y = 1.1
    g.add(board, post)
    g.position.set(x, 0, z)
    g.rotation.y = rotY
    this.scene.add(g)
    this.addCollider(x, z, 0.4)
    return g
  }

  // Face a sign toward the default camera direction (+x, +z)
  get faceCam() { return Math.PI / 4 }

  buildHome() {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.3, 0.3, 40), mat(C.ink))
    pad.position.y = 0.05
    pad.receiveShadow = true
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.14, 8, 64), glow(C.lime, 2.5))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.25
    this.homeRing = ring
    this.scene.add(pad, ring)
    this.sign('PLAYGROUND', 'drive · trade · learn', -6, -6, this.faceCam)
  }

  buildLetters() {
    const word = 'PLAYGROUND'
    const size = 0.72
    const spacing = size * 6
    const center = new THREE.Vector3(12, 0, 12)
    const right = new THREE.Vector3(1, 0, -1).normalize()
    const palette = [C.lime, C.grape, C.coral, C.sun, C.mint, C.blue]
    const blocks = []
    word.split('').forEach((ch, li) => {
      const glyph = GLYPHS[ch]
      const letterOrigin = center.clone().addScaledVector(right, (li - (word.length - 1) / 2) * spacing)
      glyph.forEach((row, ry) => {
        row.split('').forEach((bit, cx) => {
          if (bit !== '1') return
          const home = letterOrigin.clone().addScaledVector(right, (cx - 2) * size)
          home.y = (6 - ry) * size + size / 2
          blocks.push({
            letter: li, home, pos: home.clone(), vel: new THREE.Vector3(), rot: new THREE.Euler(0, Math.PI / 4, 0), angVel: new THREE.Vector3(),
            color: new THREE.Color(palette[li % palette.length]),
          })
        })
      })
    })
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size * 0.96, size * 0.96, size * 0.96), mat('#ffffff', { roughness: 0.6 }), blocks.length)
    mesh.castShadow = true
    mesh.receiveShadow = true
    blocks.forEach((b, i) => mesh.setColorAt(i, b.color))
    this.scene.add(mesh)
    this.letters = { mesh, blocks, size, state: word.split('').map(() => ({ dynamic: false, lastHit: 0 })) }
    this.updateLetterMatrices()
  }

  updateLetterMatrices() {
    const { mesh, blocks } = this.letters
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1)
    blocks.forEach((b, i) => {
      q.setFromEuler(b.rot)
      m.compose(b.pos, q, s)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }

  updateLetters(dt, car) {
    const { blocks, size, state: ls } = this.letters
    const carCenter = new THREE.Vector3(car.pos.x, car.pos.y + 1, car.pos.z)
    const speed = car.vel.length()
    for (const b of blocks) {
      const L = ls[b.letter]
      const d = b.pos.distanceTo(carCenter)
      if (d < 1.9 && speed > 3) {
        if (!L.dynamic) {
          L.dynamic = true
          if (!state.letterHits.includes(b.letter)) {
            state.letterHits.push(b.letter)
            achievements.progress('blocks', state.letterHits.length, { absolute: true })
          }
          for (const o of blocks) if (o.letter === b.letter) o.vel.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)
          audio.thud()
        }
        L.lastHit = this.time
        const push = b.pos.clone().sub(carCenter).setY(0).normalize()
        b.vel.addScaledVector(car.vel, 0.7).addScaledVector(push, 4)
        b.vel.y += 3 + speed * 0.15
        b.angVel.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
      }
    }
    for (const b of blocks) {
      const L = ls[b.letter]
      if (!L.dynamic) continue
      const since = this.time - L.lastHit
      if (since > 14) {
        // tidy up: blocks float back home
        b.pos.lerp(b.home, Math.min(1, dt * 2.5))
        b.rot.x *= 0.9; b.rot.z *= 0.9
        b.rot.y += (Math.PI / 4 - b.rot.y) * 0.1
        b.vel.set(0, 0, 0)
        continue
      }
      b.vel.y -= 25 * dt
      b.pos.addScaledVector(b.vel, dt)
      b.rot.x += b.angVel.x * dt; b.rot.y += b.angVel.y * dt; b.rot.z += b.angVel.z * dt
      if (b.pos.y < size / 2) {
        b.pos.y = size / 2
        b.vel.y *= -0.3
        b.vel.x *= 0.8; b.vel.z *= 0.8
        b.angVel.multiplyScalar(0.7)
      }
    }
    for (const L of ls) {
      if (L.dynamic && this.time - L.lastHit > 16) L.dynamic = false
    }
    this.updateLetterMatrices()
  }

  // ---------- Trading Pit ----------
  buildPit(x, z) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.scene.add(g)
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.4, 0.3, 8), mat(C.ink))
    floor.position.y = 0.05
    floor.receiveShadow = true
    const edge = new THREE.Mesh(new THREE.TorusGeometry(10, 0.12, 6, 8), glow(C.mint, 1.5))
    edge.rotation.x = Math.PI / 2
    edge.rotation.z = Math.PI / 8
    edge.position.y = 0.25
    g.add(floor, edge)

    // Three big chart screens on an arc behind the pit (away from camera)
    this.screens = []
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 1.25 + (i - 1) * 0.75 // behind, relative to camera view
      const sx = Math.cos(a) * 8, sz = Math.sin(a) * 8
      const { tex, ctx, canvas } = canvasTexture(512, 300, () => {})
      const screen = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 0.3), [mat(C.ink), mat(C.ink), mat(C.ink), mat(C.ink), new THREE.MeshBasicMaterial({ map: tex }), mat(C.ink)])
      screen.position.set(sx, 4.2, sz)
      screen.lookAt(0, 4.2, 0)
      screen.castShadow = true
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), mat(C.ink))
      pole.position.set(sx, 1.2, sz)
      g.add(screen, pole)
      this.addCollider(x + sx, z + sz, 0.6)
      this.screens.push({ tex, ctx, canvas, index: i })
    }

    // Candle totems: pump and dump
    this.candles = []
    ;[[-1, C.mint], [1, C.coral]].forEach(([side, color], i) => {
      const t = new THREE.Group()
      const a = Math.PI * 0.25 + side * 0.9
      t.position.set(Math.cos(a) * 11.5, 0, Math.sin(a) * 11.5)
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), mat(color))
      body.position.y = 3
      body.castShadow = true
      const wick = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7, 0.25), mat(color))
      wick.position.y = 3.5
      t.add(body, wick)
      g.add(t)
      this.addCollider(x + t.position.x, z + t.position.z, 1)
      this.candles.push({ body, base: 3, phase: i * Math.PI })
    })
    this.sign('TRADING PIT', 'paper-trade memecoins', x + 12, z + 5, this.faceCam, C.mint)
  }

  drawScreens() {
    if (!this.screens) return
    const live = market.tokens.filter((t) => !t.dead)
    const picks = live.slice(0, 3)
    this.screens.forEach((s, i) => {
      const t = picks[i] || market.tokens[i]
      if (!t) return
      const { ctx, canvas } = s
      const w = canvas.width, h = canvas.height
      ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h)
      const chg = market.change(t)
      const col = t.dead ? '#777' : chg >= 0 ? C.mint : C.coral
      ctx.fillStyle = '#f3f0ff'; ctx.font = '30px "Rubik Mono One", sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`$${t.symbol}`, 20, 46)
      ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.font = '700 30px "Space Grotesk", sans-serif'
      ctx.fillText(t.dead ? 'RUGGED' : `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`, w - 20, 46)
      drawCandles(ctx, t.candles.slice(-48), 16, 70, w - 32, h - 90)
      s.tex.needsUpdate = true
    })
  }

  // ---------- Launchpad ----------
  buildLaunchpad(x, z) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 0.6, 6), mat(C.ink))
    pad.position.set(x, 0.3, z)
    pad.receiveShadow = true
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.12, 6, 6), glow(C.sun, 2))
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, 0.65, z)
    this.scene.add(pad, ring)

    const rocket = new THREE.Group()
    const bodyM = mat('#f3f0ff')
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 5, 10), bodyM)
    hull.position.y = 2.5
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1, 2, 10), mat(C.coral))
    nose.position.y = 6
    const windowM = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), glow(C.blue, 1))
    windowM.rotation.x = Math.PI / 2
    windowM.position.set(0, 3.6, 1.02)
    rocket.add(hull, nose, windowM)
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 1.2), mat(C.grape))
      const a = (i / 3) * Math.PI * 2
      fin.position.set(Math.sin(a) * 1.1, 0.8, Math.cos(a) * 1.1)
      fin.rotation.y = a
      rocket.add(fin)
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 8), glow(C.sun, 3))
    flame.rotation.x = Math.PI
    flame.position.y = -0.9
    flame.visible = false
    rocket.add(flame)
    rocket.traverse((o) => (o.castShadow = true))
    rocket.position.set(x, 0.6, z)
    this.scene.add(rocket)
    this.rocket = { group: rocket, flame, baseY: 0.6, t: -1 }
    this.addCollider(x, z, 1.4)
    this.sign('LAUNCHPAD', 'mint a token for fun', x + 6, z + 6, this.faceCam, C.sun)
  }

  launchRocket() { this.rocket.t = 0 }

  // ---------- Academy ----------
  buildAcademy(x, z) {
    const { tex } = canvasTexture(1024, 600, (ctx, w, h) => {
      ctx.fillStyle = '#1f3b33'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = 30; ctx.strokeRect(0, 0, w, h)
      ctx.fillStyle = '#f3f0ff'; ctx.textAlign = 'left'
      ctx.font = '54px "Rubik Mono One", sans-serif'
      ctx.fillText('RUG ACADEMY', 60, 110)
      ctx.font = '500 40px "Space Grotesk", sans-serif'
      ;['✓ Is liquidity locked?', '✓ How much does the dev hold?', '✓ Can you actually sell?', '✓ Who is shilling it, and why?'].forEach((l, i) => ctx.fillText(l, 70, 210 + i * 85))
    })
    const board = new THREE.Mesh(new THREE.BoxGeometry(9, 5.2, 0.3), [mat('#c9a36b'), mat('#c9a36b'), mat('#c9a36b'), mat('#c9a36b'), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), mat('#c9a36b')])
    board.position.set(x, 4, z)
    board.rotation.y = this.faceCam
    board.castShadow = true
    this.scene.add(board)
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), mat('#c9a36b'))
      const off = new THREE.Vector3(1, 0, -1).normalize().multiplyScalar(s * 4)
      leg.position.set(x + off.x, 1.4, z + off.z)
      this.scene.add(leg)
      this.addCollider(x + off.x, z + off.z, 0.4)
    }
    // little desks
    for (let i = 0; i < 4; i++) {
      const dx = x + 4 + (i % 2) * 3.5 - 2, dz = z + 4 + Math.floor(i / 2) * 3.5 - 2
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 1.2), mat(C.grape))
      desk.position.set(dx + 2, 0.5, dz + 2)
      desk.castShadow = true
      this.scene.add(desk)
      this.addCollider(dx + 2, dz + 2, 1)
    }
  }

  // ---------- Rug Alley ----------
  buildRug(x, z) {
    const { tex } = canvasTexture(256, 512, (ctx, w, h) => {
      ctx.fillStyle = '#b8325a'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = C.sun; ctx.lineWidth = 12; ctx.strokeRect(16, 16, w - 32, h - 32)
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? C.sun : C.grape
        ctx.beginPath()
        const cy = 70 + i * 75
        ctx.moveTo(w / 2, cy - 30); ctx.lineTo(w / 2 + 50, cy); ctx.lineTo(w / 2, cy + 30); ctx.lineTo(w / 2 - 50, cy); ctx.fill()
      }
    })
    const rug = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 13), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
    const a = Math.atan2(x, z)
    rug.rotation.y = a
    rug.position.set(x, 0.05, z)
    rug.receiveShadow = true
    this.scene.add(rug)
    this.rug = { mesh: rug, home: rug.position.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), pulled: -1 }
    this.sign('RUG ALLEY', 'totally safe. step on it.', x - 7, z + 6, this.faceCam, C.coral)
  }

  updateRug(dt, car) {
    const r = this.rug
    if (r.pulled < 0) {
      const local = car.pos.clone().sub(r.home)
      const along = local.dot(r.dir)
      const across = Math.abs(local.x * r.dir.z - local.z * r.dir.x)
      if (car.grounded && Math.abs(along) < 6.5 && across < 3) {
        r.pulled = 0
        car.launch(13, 9)
        car.vel.addScaledVector(r.dir, 10)
        audio.rug()
        this.burst(car.pos, C.coral, 40)
        achievements.unlock('rugAlley')
        bus.emit('toast', { title: 'You got rugged', text: 'That rug looked safe too. Always check who can pull it.', bad: true })
      }
      return
    }
    r.pulled += dt
    const t = r.pulled
    if (t < 1.2) {
      r.mesh.position.copy(r.home).addScaledVector(r.dir, t * t * 30)
      r.mesh.position.y = 0.05 + Math.sin(t * 8) * 0.5 * t
      r.mesh.rotation.z = Math.sin(t * 12) * 0.2
    } else if (t > 7) {
      r.mesh.position.lerp(r.home, dt * 3)
      r.mesh.rotation.z *= 0.9
      if (t > 9) { r.mesh.position.copy(r.home); r.pulled = -1 }
    }
  }

  // ---------- Whale Pond ----------
  buildWhale(x, z) {
    const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.2, 40), new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.2, metalness: 0.1 }))
    water.position.set(x, 0.02, z)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.5, 6, 40), mat(C.path))
    rim.rotation.x = Math.PI / 2
    rim.position.set(x, 0.15, z)
    rim.receiveShadow = true
    this.scene.add(water, rim)
    this.addCollider(x, z, 8.2)

    const whale = new THREE.Group()
    const skin = mat('#5b7cfa')
    const belly = mat('#dfe6ff')
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 5), skin)
    const under = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 4.6), belly)
    under.position.y = -0.9
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 1.2), skin)
    tail.position.set(0, 0.6, -3.1)
    tail.rotation.x = -0.4
    const eyeW = mat('#ffffff'), eyeB = mat(C.ink)
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), eyeW)
      e.position.set(s * 1.62, 0.3, 1.5)
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.25), eyeB)
      p.position.set(s * 1.66, 0.25, 1.6)
      whale.add(e, p)
    }
    // tiny top hat — every whale needs one
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 12), mat(C.ink))
    hat.position.set(0, 1.5, 0.8)
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 12), mat(C.ink))
    brim.position.set(0, 1.0, 0.8)
    whale.add(body, under, tail, hat, brim)
    whale.traverse((o) => (o.castShadow = true))
    whale.position.set(x, 0.3, z)
    whale.rotation.y = this.faceCam
    this.scene.add(whale)
    this.whale = { group: whale, tail, x, z }
    this.sign('WHALE POND', 'honk politely (H)', x + 9, z - 3, this.faceCam, C.blue)
  }

  honk(car) {
    if (!this.whale) return
    const d = Math.hypot(car.pos.x - this.whale.x, car.pos.z - this.whale.z)
    if (d < 18) {
      this.burst(new THREE.Vector3(this.whale.x, 2.5, this.whale.z), '#bfe3ff', 50, 10, true)
      this.whale.hop = 1
      achievements.unlock('whale')
    }
  }

  // ---------- Race ----------
  buildRace() {
    this.raceR = 55
    const road = new THREE.Mesh(new THREE.RingGeometry(this.raceR - 3.5, this.raceR + 3.5, 120), mat(C.road, { side: THREE.DoubleSide }))
    road.rotation.x = -Math.PI / 2
    road.position.y = 0.03
    road.receiveShadow = true
    this.scene.add(road)
    // dashes
    const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.05, 2), mat(C.grape), 60)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2
      m.makeRotationY(-a).setPosition(Math.cos(a) * this.raceR, 0.06, Math.sin(a) * this.raceR)
      dash.setMatrixAt(i, m)
    }
    this.scene.add(dash)

    this.gates = []
    const count = 6
    for (let i = 0; i < count; i++) {
      const deg = 60 * i + 15 // offset so gates don't sit on zone paths
      const a = (deg * Math.PI) / 180
      const g = new THREE.Group()
      const color = i === 0 ? '#ffffff' : [C.lime, C.grape, C.sun, C.mint, C.coral][i - 1]
      for (const off of [-5, 5]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), mat(C.ink))
        p.position.set(off, 2.5, 0)
        p.castShadow = true
        g.add(p)
        const px = Math.cos(a) * (this.raceR + off), pz = Math.sin(a) * (this.raceR + off)
        this.addCollider(px, pz, 0.5)
      }
      let beamMat = mat(color)
      if (i === 0) {
        const { tex } = canvasTexture(256, 32, (ctx) => {
          for (let k = 0; k < 16; k++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (k + j) % 2 ? C.ink : '#fff'; ctx.fillRect(k * 16, j * 16, 16, 16) }
        })
        beamMat = new THREE.MeshStandardMaterial({ map: tex })
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.9, 0.5), beamMat)
      beam.position.y = 5
      beam.castShadow = true
      g.add(beam)
      g.position.set(Math.cos(a) * this.raceR, 0, Math.sin(a) * this.raceR)
      g.rotation.y = -a
      this.scene.add(g)
      this.gates.push({ x: g.position.x, z: g.position.z, beam, color })
    }
    this.race = { active: false, next: 0, start: 0, time: 0 }
    const [sx, sz] = polar(8, this.raceR - 9)
    this.sign('CIRCUIT', 'drive through the gates', sx, sz, this.faceCam, '#ffffff')
  }

  updateRace(car) {
    const r = this.race
    const g = this.gates[r.active ? r.next : 0]
    const d = Math.hypot(car.pos.x - g.x, car.pos.z - g.z)
    if (d < 5.5) {
      if (!r.active) {
        r.active = true; r.start = this.time; r.next = 1
        audio.checkpoint()
        bus.emit('race', { type: 'start' })
      } else if (r.next === 0) {
        const lap = this.time - r.start
        r.active = false
        audio.achievement()
        achievements.unlock('lap')
        if (lap < 45) achievements.unlock('fastLap')
        const isBest = !state.bestLap || lap < state.bestLap
        if (isBest) { state.bestLap = lap; save() }
        bus.emit('race', { type: 'finish', lap, isBest })
      } else {
        audio.checkpoint()
        this.burst(new THREE.Vector3(g.x, 5, g.z), g.color, 20)
        r.next = (r.next + 1) % this.gates.length
        bus.emit('race', { type: 'checkpoint', index: r.next })
      }
    }
    r.time = r.active ? this.time - r.start : 0
    if (r.active && r.time > 180) { r.active = false; bus.emit('race', { type: 'cancel' }) }
  }

  // ---------- Trees ----------
  buildTrees() {
    const trunkM = mat('#6b4a8a')
    const leaves = [mat(C.lime), mat(C.grape), mat(C.mint), mat('#ff8fb1')]
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 2, 6)
    const leafGeo = new THREE.IcosahedronGeometry(1.6, 0)
    let placed = 0, tries = 0
    const lettersCenter = new THREE.Vector2(12, 12)
    while (placed < 80 && tries++ < 2000) {
      const a = this.random() * Math.PI * 2
      const r = 9 + this.random() * (this.radius - 12)
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      if (Math.abs(r - this.raceR) < 7) continue
      if (this.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 5)) continue
      // keep letters + path corridors clear
      const toLetters = new THREE.Vector2(x, z).sub(lettersCenter)
      const alongL = Math.abs(toLetters.x - toLetters.y) / Math.SQRT2
      const acrossL = Math.abs(toLetters.x + toLetters.y) / Math.SQRT2
      if (alongL < 26 && acrossL < 7) continue
      if (this.zones.some((zn) => { if (zn.id === 'home') return false; const len = Math.hypot(zn.x, zn.z); const t = (x * zn.x + z * zn.z) / len; const perp = Math.abs(x * zn.z - z * zn.x) / len; return t > 0 && t < len && perp < 4 })) continue
      if (this.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 3)) continue

      const tree = new THREE.Group()
      const s = 0.8 + this.random() * 0.8
      const trunk = new THREE.Mesh(trunkGeo, trunkM)
      trunk.position.y = 1
      tree.add(trunk)
      const leafMat = leaves[Math.floor(this.random() * leaves.length)]
      for (let k = 0; k < 3; k++) {
        const leaf = new THREE.Mesh(leafGeo, leafMat)
        leaf.position.set((this.random() - 0.5) * 1.4, 2.6 + k * 0.9, (this.random() - 0.5) * 1.4)
        leaf.scale.setScalar(1 - k * 0.22)
        leaf.rotation.set(this.random(), this.random(), this.random())
        tree.add(leaf)
      }
      tree.traverse((o) => { o.castShadow = true })
      tree.scale.setScalar(s)
      tree.position.set(x, 0, z)
      this.scene.add(tree)
      this.addCollider(x, z, 0.6 * s)
      placed++
    }
  }

  // ---------- Coins ----------
  buildCoins() {
    const { tex } = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = C.sun; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#b37a00'; ctx.font = '76px "Rubik Mono One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('P', w / 2, h / 2 + 4)
    })
    const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.18, 20)
    geo.rotateX(Math.PI / 2)
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.4 })
    const edgeMat = mat(C.sun, { metalness: 0.4, roughness: 0.4 })
    const r = rng(42)
    this.coins = []
    let i = 0, tries = 0
    while (this.coins.length < 30 && tries++ < 1000) {
      const a = r() * Math.PI * 2, rad = 8 + r() * (this.radius - 12)
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad
      if (this.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 2)) continue
      const coin = new THREE.Mesh(geo, [edgeMat, faceMat, faceMat])
      coin.position.set(x, 1.4, z)
      coin.castShadow = true
      const idx = i++
      coin.visible = !state.coins.includes(idx)
      this.scene.add(coin)
      this.coins.push({ mesh: coin, idx })
    }
  }

  updateCoins(dt, car) {
    for (const c of this.coins) {
      if (!c.mesh.visible) continue
      c.mesh.rotation.y += dt * 2.5
      c.mesh.position.y = 1.4 + Math.sin(this.time * 2 + c.idx) * 0.25
      if (car.pos.distanceTo(c.mesh.position) < 2.4) {
        c.mesh.visible = false
        state.coins.push(c.idx)
        state.tickets += 25
        save()
        audio.coin()
        this.burst(c.mesh.position, C.sun, 24)
        achievements.progress('coins10', state.coins.length, { absolute: true })
        achievements.progress('coinsAll', state.coins.length, { absolute: true })
        bus.emit('wallet')
        bus.emit('coin', state.coins.length)
      }
    }
  }

  // ---------- Particles ----------
  buildParticles() {
    const count = 400
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: '#ffffff' }), count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this.particles = { mesh, items: Array.from({ length: count }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() })), cursor: 0 }
    const m = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color('#fff')) }
  }

  burst(pos, color, n = 20, speed = 7, upward = false) {
    const p = this.particles
    const col = new THREE.Color(color)
    for (let k = 0; k < n; k++) {
      const it = p.items[p.cursor]
      it.life = 1 + Math.random() * 0.6
      it.pos.copy(pos)
      if (upward) it.vel.set((Math.random() - 0.5) * 3, speed + Math.random() * 5, (Math.random() - 0.5) * 3)
      else it.vel.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed)
      p.mesh.setColorAt(p.cursor, col)
      p.cursor = (p.cursor + 1) % p.items.length
    }
    p.mesh.instanceColor.needsUpdate = true
  }

  updateParticles(dt) {
    const p = this.particles
    const m = new THREE.Matrix4()
    p.items.forEach((it, i) => {
      if (it.life <= 0) return
      it.life -= dt
      it.vel.y -= 18 * dt
      it.pos.addScaledVector(it.vel, dt)
      if (it.pos.y < 0.1) { it.pos.y = 0.1; it.vel.multiplyScalar(0.5) }
      const s = Math.max(0, Math.min(1, it.life))
      m.makeScale(s, s, s).setPosition(it.pos)
      p.mesh.setMatrixAt(i, m)
    })
    p.mesh.instanceMatrix.needsUpdate = true
  }

  buildSky() {
    // The moon. Where else would the tokens be going?
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#fff3d6', emissiveIntensity: 0.5, flatShading: true }))
    moon.position.set(-120, 70, -140)
    this.scene.add(moon)
    const starGeo = new THREE.BufferGeometry()
    const pts = []
    for (let i = 0; i < 600; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(180 + Math.random() * 40)
      if (v.y < -20) v.y *= -1
      pts.push(v.x, v.y, v.z)
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: C.lime, size: 1.2, fog: false })))
  }

  // ---------- Frame ----------
  update(dt, car) {
    this.time += dt
    this.homeRing.material.emissiveIntensity = 2 + Math.sin(this.time * 3) * 0.8
    this.floaters?.forEach((f) => { f.position.y += Math.sin(this.time + f.userData.float) * 0.01; f.rotation.y += dt * 0.1 })
    this.candles.forEach((c, i) => {
      const s = 0.6 + (Math.sin(this.time * 1.3 + c.phase) + 1) * 0.5
      c.body.scale.y = s
      c.body.position.y = 1.5 + s * 2
    })
    // rocket
    const rk = this.rocket
    if (rk.t >= 0) {
      rk.t += dt
      rk.flame.visible = rk.t < 3
      rk.flame.scale.y = 1 + Math.random() * 0.5
      if (rk.t < 3) rk.group.position.y = rk.baseY + rk.t * rk.t * 8
      else if (rk.t < 6) rk.group.position.y = Math.max(rk.baseY, rk.group.position.y - dt * 30)
      else { rk.group.position.y = rk.baseY; rk.t = -1 }
      if (rk.t > 0 && rk.t < 3 && Math.random() < 0.5) this.burst(rk.group.position, C.sun, 3, 3)
    }
    // whale
    const w = this.whale
    w.hop = Math.max(0, (w.hop || 0) - dt)
    w.group.position.y = 0.3 + Math.sin(this.time * 1.5) * 0.2 + Math.sin((1 - w.hop) * Math.PI) * w.hop * 2
    w.tail.rotation.x = -0.4 + Math.sin(this.time * 2) * 0.25
    w.group.rotation.y = this.faceCam + Math.sin(this.time * 0.4) * 0.5
    // race gate pulse
    this.gates.forEach((g, i) => {
      if (i === 0 || !g.beam.material.emissive) return
      const isNext = this.race.active && this.gates[this.race.next] === g
      g.beam.material.emissive.set(g.color)
      g.beam.material.emissiveIntensity = isNext ? 1 + Math.sin(this.time * 10) * 0.6 : 0
    })

    this.updateLetters(dt, car)
    this.updateRug(dt, car)
    this.updateCoins(dt, car)
    this.updateRace(car)
    this.updateParticles(dt)

    // shadow camera follows the car
    this.sun.position.set(car.pos.x + 30, 60, car.pos.z + 20)
    this.sun.target.position.set(car.pos.x, 0, car.pos.z)
  }
}

export function drawCandles(ctx, candles, x, y, w, h) {
  if (!candles.length) return
  let hi = -Infinity, lo = Infinity
  for (const c of candles) { hi = Math.max(hi, c.h); lo = Math.min(lo, c.l) }
  if (hi === lo) hi = lo * 1.01 + 1e-12
  const lhi = Math.log(hi), llo = Math.log(lo)
  const Y = (v) => y + h - ((Math.log(v) - llo) / (lhi - llo)) * h
  const cw = w / candles.length
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + (h * i) / 4); ctx.lineTo(x + w, y + (h * i) / 4); ctx.stroke() }
  candles.forEach((c, i) => {
    const up = c.c >= c.o
    ctx.strokeStyle = ctx.fillStyle = up ? C.mint : C.coral
    const cx = x + i * cw + cw / 2
    ctx.beginPath(); ctx.moveTo(cx, Y(c.h)); ctx.lineTo(cx, Y(c.l)); ctx.stroke()
    const top = Y(Math.max(c.o, c.c)), bot = Y(Math.min(c.o, c.c))
    ctx.fillRect(cx - cw * 0.35, top, cw * 0.7, Math.max(1.5, bot - top))
  })
  const last = candles[candles.length - 1]
  ctx.fillStyle = '#f3f0ff'
  ctx.font = '600 14px "Space Grotesk", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(fmtPrice(last.c), x + w, Y(last.c) - 6)
}
