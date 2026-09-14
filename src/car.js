// Arcade car: hand-rolled physics on a flat island with circle colliders.
import * as THREE from 'three'
import { audio } from './audio.js'

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...opts })

export class Car {
  constructor(scene) {
    this.group = new THREE.Group()
    this.pos = new THREE.Vector3(0, 0, 0)
    this.vel = new THREE.Vector3()
    this.heading = Math.PI * 1.25 // facing toward the camera-ish
    this.vy = 0
    this.grounded = true
    this.spin = 0
    this.steerVisual = 0
    this.wheelRot = 0
    this.boosting = false
    this.build()
    scene.add(this.group)
  }

  build() {
    const body = new THREE.Group()
    this.body = body
    this.group.add(body)

    const lime = mat('#c6f432')
    const ink = mat('#231d48')
    const grape = mat('#7b5cff')
    const cream = mat('#fff3d6')

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 3.0), lime)
    chassis.position.y = 0.75
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.8), lime)
    nose.position.set(0, 0.6, 1.7)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.5), grape)
    seat.position.set(0, 1.35, -0.7)
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 6, 12, Math.PI), ink)
    bar.position.set(0, 1.05, -0.35)
    const wheelBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), ink)
    wheelBox.position.set(0, 1.2, 0.55)
    const steering = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 12), ink)
    steering.position.set(0, 1.45, 0.45)
    steering.rotation.x = -0.9
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 0.3), ink)
    bumper.position.set(0, 0.5, 2.15)
    const rear = bumper.clone()
    rear.position.z = -1.55

    for (const m of [chassis, nose, seat, bar, wheelBox, steering, bumper, rear]) { m.castShadow = true; body.add(m) }

    // Headlights
    const lightMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#fff3a0', emissiveIntensity: 2 })
    for (const x of [-0.6, 0.6]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat)
      l.position.set(x, 0.65, 2.11)
      body.add(l)
    }
    const tailMat = new THREE.MeshStandardMaterial({ color: '#ff4d6d', emissive: '#ff4d6d', emissiveIntensity: 1.5 })
    for (const x of [-0.7, 0.7]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat)
      l.position.set(x, 0.75, -1.72)
      body.add(l)
    }

    // Antenna with a spinning ticket coin
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6), ink)
    antenna.position.set(0.7, 1.8, -1.2)
    body.add(antenna)
    this.flagCoin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), mat('#ffc23d', { metalness: 0.4, roughness: 0.4 }))
    this.flagCoin.rotation.x = Math.PI / 2
    this.flagCoin.position.set(0.7, 2.7, -1.2)
    body.add(this.flagCoin)

    // Wheels
    this.wheels = []
    const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.45, 10)
    wheelGeo.rotateZ(Math.PI / 2)
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.47, 6)
    hubGeo.rotateZ(Math.PI / 2)
    for (const [x, z, front] of [[-1.05, 1.1, true], [1.05, 1.1, true], [-1.05, -1.0, false], [1.05, -1.0, false]]) {
      const pivot = new THREE.Group()
      pivot.position.set(x, 0.48, z)
      const spin = new THREE.Group()
      const tire = new THREE.Mesh(wheelGeo, ink)
      tire.castShadow = true
      const hub = new THREE.Mesh(hubGeo, cream)
      spin.add(tire, hub)
      pivot.add(spin)
      this.group.add(pivot)
      this.wheels.push({ pivot, spin, front })
    }
  }

  respawn() {
    this.pos.set(0, 3, 0)
    this.vel.set(0, 0, 0)
    this.vy = 0
    this.heading = Math.PI * 1.25
    this.spin = 0
  }

  launch(up, spin) {
    this.vy = up
    this.grounded = false
    this.spin = spin
  }

  update(dt, input, world) {
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading))
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x)
    let forwardSpeed = this.vel.dot(fwd)
    let lateral = this.vel.dot(right)

    this.boosting = input.boost && input.throttle > 0
    const maxSpeed = this.boosting ? 34 : 22
    const accel = this.boosting ? 48 : 30
    const grip = this.grounded ? 8 : 0.5

    if (this.grounded) {
      if (input.throttle > 0 && forwardSpeed < maxSpeed) forwardSpeed += accel * input.throttle * dt
      if (input.throttle < 0) forwardSpeed += (forwardSpeed > 0 ? -45 : -20) * -input.throttle * dt
      forwardSpeed = Math.max(forwardSpeed, -10)
      if (input.brake) forwardSpeed *= Math.pow(0.02, dt)
      if (!input.throttle) forwardSpeed *= Math.pow(0.45, dt)
      if (forwardSpeed > maxSpeed) forwardSpeed = THREE.MathUtils.lerp(forwardSpeed, maxSpeed, dt * 2)
    }
    lateral *= Math.exp(-grip * dt)

    // Steering scales with speed so you can't spin in place
    const steerAmount = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 8, 0, 1) * Math.sign(forwardSpeed)
    this.heading += input.steer * 2.4 * steerAmount * dt * (input.brake ? 1.4 : 1)
    this.heading += this.spin * dt
    this.spin *= Math.exp(-2 * dt)

    const newFwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading))
    const newRight = new THREE.Vector3(newFwd.z, 0, -newFwd.x)
    this.vel.copy(newFwd).multiplyScalar(forwardSpeed).addScaledVector(newRight, lateral)

    // Jump + gravity
    if (input.jump && this.grounded) {
      this.vy = 9
      this.grounded = false
      input.jump = false
      audio.jump()
      world.onJump?.()
    }
    this.vy -= 26 * dt
    this.pos.addScaledVector(this.vel, dt)
    this.pos.y += this.vy * dt

    const onIsland = Math.hypot(this.pos.x, this.pos.z) < world.radius
    if (onIsland && this.pos.y <= 0 && this.pos.y > -1.5) {
      if (!this.grounded && this.vy < -8) audio.thud()
      this.pos.y = 0
      this.vy = 0
      this.grounded = true
    } else if (this.pos.y > 0.01 || !onIsland) {
      this.grounded = false
    }
    if (this.pos.y < -40) { this.respawn(); world.onFall?.() }

    // Collisions with round obstacles
    if (this.pos.y < 3) {
      for (const c of world.colliders) {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z
        const d = Math.hypot(dx, dz)
        const min = c.r + 1.2
        if (d < min && d > 0.0001) {
          const nx = dx / d, nz = dz / d
          this.pos.x = c.x + nx * min
          this.pos.z = c.z + nz * min
          const vn = this.vel.x * nx + this.vel.z * nz
          if (vn < 0) {
            this.vel.x -= 1.5 * vn * nx
            this.vel.z -= 1.5 * vn * nz
            this.vel.multiplyScalar(0.6)
            if (vn < -8) audio.thud()
          }
        }
      }
    }

    // Visuals
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.heading
    this.steerVisual = THREE.MathUtils.lerp(this.steerVisual, input.steer * 0.45, dt * 10)
    this.wheelRot += forwardSpeed * dt / 0.48
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelRot
      if (w.front) w.pivot.rotation.y = this.steerVisual
    }
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -lateral * 0.02 - input.steer * steerAmount * 0.04, dt * 6)
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, this.grounded ? -input.throttle * 0.03 : -this.vy * 0.02, dt * 6)
    this.body.position.y = this.grounded ? Math.sin(performance.now() * 0.03) * 0.015 * Math.min(1, Math.abs(forwardSpeed) / 5) : 0
    this.flagCoin.rotation.z += dt * 4

    this.speed = forwardSpeed
    audio.engine(Math.min(1, Math.abs(forwardSpeed) / 34), this.boosting)
  }
}
