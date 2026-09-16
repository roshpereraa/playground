import * as THREE from 'three'
import './style.css'
import { state, save, bus } from './state.js'
import { market } from './market.js'
import { audio } from './audio.js'
import { achievements } from './achievements.js'
import { World } from './world.js'
import { Car } from './car.js'
import { UI } from './ui.js'
import { wallet } from './wallet.js'

const $ = (s) => document.querySelector(s)
const ringProgress = $('#ring-progress')
const setProgress = (p) => { ringProgress.style.strokeDashoffset = String(502.65 * (1 - p)) }

async function boot() {
  wallet.init()
  setProgress(0.1)
  // Canvas textures need the brand fonts loaded before they are drawn
  await Promise.race([
    Promise.all([document.fonts.load('44px "Rubik Mono One"'), document.fonts.load('500 28px "Space Grotesk"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ])
  setProgress(0.35)

  const canvas = $('#scene')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.quality === 'high' ? 2 : 1))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 500)

  await tick()
  const world = new World(scene)
  setProgress(0.7)
  await tick()
  const car = new Car(scene)
  car.respawn()
  car.pos.y = 0
  world.setQuality(state.quality)
  market.start()
  setProgress(0.9)

  const applyQuality = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.quality === 'high' ? 2 : 1))
    world.setQuality(state.quality)
  }

  const ui = new UI({ world, car, onRespawn: () => car.respawn(), onQuality: applyQuality })
  if (import.meta.env.DEV) window.__pg = { car, world, ui, market }
  world.onJump = () => { state.jumps++; achievements.progress('air', state.jumps, { absolute: true }) }
  world.onFall = () => bus.emit('toast', { title: 'Splat', text: 'You drove off the island. Back to the spawn pad.', bad: true })

  // ---------- Input ----------
  const keys = new Set()
  const input = { throttle: 0, steer: 0, boost: false, brake: false, jump: false }
  const touch = { x: 0, y: 0, boost: false }

  const interact = () => {
    if (ui.isOpen) return
    const z = nearbyZone()
    if (z?.tab) ui.open(z.tab)
  }
  const honk = () => {
    audio.honk()
    state.honks++
    achievements.progress('honk', state.honks, { absolute: true })
    world.honk(car)
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') ui.close(); return }
    const k = e.key.toLowerCase()
    if (k === 'escape') { ui.isOpen ? ui.close() : ui.open('home'); return }
    if (ui.isOpen) return
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    if (e.repeat) return
    keys.add(k)
    if (k === ' ') input.jump = true
    if (k === 'enter') interact()
    if (k === 'h') honk()
    if (k === 'r') car.respawn()
    if (k === 'm') { audio.setEnabled(!state.audio); save(); bus.emit('toast', { title: 'Audio', text: state.audio ? 'Sound on' : 'Muted' }) }
  })
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
  window.addEventListener('blur', () => keys.clear())

  // Camera orbit (drag) + zoom (wheel)
  const cam = { yaw: Math.PI / 4, targetYaw: Math.PI / 4, dist: 38, targetDist: 38 }
  let drag = null
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: cam.targetYaw }; canvas.setPointerCapture(e.pointerId) })
  canvas.addEventListener('pointermove', (e) => { if (drag) cam.targetYaw = drag.yaw - (e.clientX - drag.x) * 0.006 })
  canvas.addEventListener('pointerup', () => { drag = null })
  canvas.addEventListener('wheel', (e) => { cam.targetDist = THREE.MathUtils.clamp(cam.targetDist + e.deltaY * 0.03, 18, 70) }, { passive: true })

  // Touch controls
  const isTouch = matchMedia('(pointer: coarse)').matches
  if (isTouch) {
    $('#touch').hidden = false
    const pad = $('#joystick'), knob = $('#joystick-knob')
    let id = null
    const move = (e) => {
      const r = pad.getBoundingClientRect()
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
      const len = Math.hypot(dx, dy)
      if (len > 1) { dx /= len; dy /= len }
      touch.x = dx; touch.y = dy
      knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`
    }
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; pad.setPointerCapture(id); move(e) })
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e) })
    const end = () => { id = null; touch.x = touch.y = 0; knob.style.transform = '' }
    pad.addEventListener('pointerup', end)
    pad.addEventListener('pointercancel', end)
    document.querySelectorAll('[data-touch]').forEach((b) => {
      const a = b.dataset.touch
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        if (a === 'jump') input.jump = true
        if (a === 'boost') touch.boost = true
        if (a === 'interact') interact()
        if (a === 'honk') honk()
      })
      const up = () => { if (a === 'boost') touch.boost = false }
      b.addEventListener('pointerup', up)
      b.addEventListener('pointerleave', up)
    })
  }

  function readInput() {
    const up = keys.has('w') || keys.has('arrowup') || keys.has('z')
    const down = keys.has('s') || keys.has('arrowdown')
    const left = keys.has('a') || keys.has('arrowleft') || keys.has('q')
    const right = keys.has('d') || keys.has('arrowright')
    input.throttle = (up ? 1 : 0) - (down ? 1 : 0)
    input.steer = (left ? 1 : 0) - (right ? 1 : 0)
    input.boost = keys.has('shift') || touch.boost
    input.brake = keys.has('b') || keys.has('control')
    if (isTouch && (touch.x || touch.y)) {
      // Joystick is camera-relative: push toward where you want to go
      const len = Math.hypot(touch.x, touch.y)
      const camFwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw))
      const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x)
      const want = camRight.multiplyScalar(touch.x).addScaledVector(camFwd, -touch.y)
      const desired = Math.atan2(want.x, want.z)
      let diff = desired - car.heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      input.steer = THREE.MathUtils.clamp(diff * 2, -1, 1)
      input.throttle = Math.abs(diff) > 2.4 ? -len : len
    }
    if (ui.isOpen) { input.throttle = 0; input.steer = 0; input.boost = false }
  }

  function nearbyZone() {
    return world.zones.find((z) => Math.hypot(car.pos.x - z.x, car.pos.z - z.z) < z.r + 1.5)
  }

  // ---------- Resize ----------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Warm up shaders so the first frame after "start" is smooth
  camera.position.set(car.pos.x + 27, 30, car.pos.z + 27)
  camera.lookAt(car.pos)
  renderer.compile(scene, camera)
  renderer.render(scene, camera)
  setProgress(1)

  // ---------- Start ----------
  await new Promise((r) => setTimeout(r, 400))
  const start = $('#start')
  start.hidden = false
  await new Promise((r) => {
    const go = () => { window.removeEventListener('keydown', go); r() }
    start.addEventListener('click', go, { once: true })
    window.addEventListener('keydown', go)
  })
  audio.init()
  audio.setEnabled(state.audio)
  $('#loader').classList.add('fade')
  setTimeout(() => $('#loader').remove(), 900)
  $('#hud').hidden = false
  if (achievements.count() === 0) setTimeout(() => ui.open('home'), 1200)

  // ---------- Loop ----------
  const clock = new THREE.Clock()
  const lookTarget = car.pos.clone()
  const visited = new Set(state.zonesVisited)
  let frame = 0

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30)
    frame++
    readInput()
    car.update(dt, input, world)
    world.update(dt, car)

    // zones
    const z = nearbyZone()
    ui.prompt(!ui.isOpen && z?.prompt ? z.prompt : null)
    if (z && !visited.has(z.id)) {
      visited.add(z.id)
      state.zonesVisited = [...visited]
      save()
      achievements.progress('explorer', visited.size, { absolute: true })
      if (z.id !== 'home') bus.emit('toast', { title: 'New zone', text: z.name })
    }
    if (Math.hypot(car.pos.x, car.pos.z) > 7) achievements.unlock('recess')

    // camera
    cam.yaw += (cam.targetYaw - cam.yaw) * Math.min(1, dt * 6)
    cam.dist += (cam.targetDist - cam.dist) * Math.min(1, dt * 6)
    const lead = car.vel.clone().multiplyScalar(0.25)
    lookTarget.lerp(new THREE.Vector3(car.pos.x + lead.x, Math.max(0, car.pos.y * 0.5), car.pos.z + lead.z), Math.min(1, dt * 5))
    const horiz = cam.dist * 0.84
    camera.position.set(lookTarget.x + Math.sin(cam.yaw) * horiz, lookTarget.y + cam.dist * 0.62, lookTarget.z + Math.cos(cam.yaw) * horiz)
    camera.lookAt(lookTarget)

    ui.updateRaceTimer(world.race, world.gates.length)
    if (frame % 3 === 0) ui.drawMinimap(world, car)
    renderer.render(scene, camera)
  })
}

// rAF pauses in background tabs, so fall back to a timeout to keep loading moving
const tick = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60) })

boot()
