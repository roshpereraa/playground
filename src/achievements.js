import { state, save, bus } from './state.js'
import { audio } from './audio.js'

export const ACHIEVEMENTS = [
  { id: 'recess', title: 'Recess has started', desc: 'Drive off the spawn pad.', goal: 1 },
  { id: 'explorer', title: 'Know the playground', desc: 'Visit every zone.', goal: 6 },
  { id: 'coins10', title: 'Pocket change', desc: 'Collect 10 ticket coins.', goal: 10 },
  { id: 'coinsAll', title: 'Sandbox billionaire', desc: 'Collect every ticket coin.', goal: 30 },
  { id: 'blocks', title: 'Toy block bulldozer', desc: 'Knock over every letter of PLAYGROUND.', goal: 10 },
  { id: 'firstTrade', title: 'First swap', desc: 'Make a trade in the Trading Pit.', goal: 1 },
  { id: 'green', title: 'In the green', desc: 'Close a trade in profit.', goal: 1 },
  { id: 'tenBagger', title: 'Ten-bagger', desc: 'Close a trade at 10x or more.', goal: 1 },
  { id: 'paperHands', title: 'Paper hands', desc: 'Sell less than 5 seconds after buying.', goal: 1 },
  { id: 'diamondHands', title: 'Diamond hands', desc: 'Hold a position for 2 minutes.', goal: 1 },
  { id: 'comeback', title: 'Down bad, came back', desc: 'Close green after being down 50%.', goal: 1 },
  { id: 'aped', title: 'Full ape', desc: 'Put every ticket you have into one buy.', goal: 1 },
  { id: 'rugged', title: 'Got rugged', desc: 'Be holding a token when it rugs.', goal: 1 },
  { id: 'rugAlley', title: 'Pulled the rug', desc: 'Drive onto the rug in Rug Alley.', goal: 1 },
  { id: 'launcher', title: 'Dev wallet', desc: 'Launch your own token on the Launchpad.', goal: 1 },
  { id: 'graduated', title: 'Graduation day', desc: 'Get your token to 100% of its bonding curve.', goal: 1 },
  { id: 'whale', title: 'Whale watcher', desc: 'Honk at the whale in Whale Pond.', goal: 1 },
  { id: 'lap', title: 'Around the block', desc: 'Finish a lap of the circuit.', goal: 1 },
  { id: 'fastLap', title: 'Speedrun', desc: 'Finish a lap in under 45 seconds.', goal: 1 },
  { id: 'air', title: 'Frequent flyer', desc: 'Jump 25 times.', goal: 25 },
  { id: 'honk', title: 'Bull horn', desc: 'Honk 50 times.', goal: 50 },
  { id: 'pluggedIn', title: 'Plugged in', desc: 'Connect a real wallet (read-only).', goal: 1 },
  { id: 'student', title: 'Did the reading', desc: 'Read the Rug Academy.', goal: 1 },
]

export const achievements = {
  progress(id, value, { absolute = false } = {}) {
    const a = ACHIEVEMENTS.find((x) => x.id === id)
    if (!a || state.unlocked[id]) return
    const current = state.achievements[id] || 0
    const next = Math.min(a.goal, absolute ? Math.max(current, value) : current + value)
    state.achievements[id] = next
    if (next >= a.goal) {
      state.unlocked[id] = Date.now()
      audio.achievement()
      bus.emit('toast', { title: 'Achievement unlocked', text: a.title })
      bus.emit('achievement', a)
    }
    save()
  },
  unlock(id) { this.progress(id, 9999) },
  count() { return Object.keys(state.unlocked).length },
}
