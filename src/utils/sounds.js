let audioCtx = null

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

const themes = {
  default: (c) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.connect(g); g.connect(c.destination)
    o.type = 'sine'
    o.frequency.setValueAtTime(880, c.currentTime)
    o.frequency.setValueAtTime(1100, c.currentTime + 0.1)
    o.frequency.setValueAtTime(880, c.currentTime + 0.2)
    g.gain.setValueAtTime(0.25, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.4)
    o.start(c.currentTime)
    o.stop(c.currentTime + 0.4)
    return o
  },

  bell: (c) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.connect(g); g.connect(c.destination)
    o.type = 'sine'
    o.frequency.setValueAtTime(1200, c.currentTime)
    o.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.8)
    g.gain.setValueAtTime(0.3, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.8)
    o.start(c.currentTime)
    o.stop(c.currentTime + 0.8)
    return o
  },

  chime: (c) => {
    const freqs = [523, 659, 784]
    let last
    freqs.forEach((f, i) => {
      const o = c.createOscillator()
      const g = c.createGain()
      o.connect(g); g.connect(c.destination)
      o.type = 'sine'
      o.frequency.setValueAtTime(f, c.currentTime + i * 0.15)
      g.gain.setValueAtTime(0, c.currentTime)
      g.gain.linearRampToValueAtTime(0.2, c.currentTime + i * 0.15)
      g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + i * 0.15 + 0.4)
      o.start(c.currentTime + i * 0.15)
      o.stop(c.currentTime + i * 0.15 + 0.4)
      last = o
    })
    return last
  },

  ding: (c) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.connect(g); g.connect(c.destination)
    o.type = 'triangle'
    o.frequency.setValueAtTime(1500, c.currentTime)
    o.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.3)
    g.gain.setValueAtTime(0.3, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.5)
    o.start(c.currentTime)
    o.stop(c.currentTime + 0.5)
    return o
  },

  dual: (c) => {
    const o1 = c.createOscillator()
    const o2 = c.createOscillator()
    const g = c.createGain()
    o1.connect(g); o2.connect(g); g.connect(c.destination)
    o1.type = 'sine'; o2.type = 'sine'
    o1.frequency.setValueAtTime(660, c.currentTime)
    o2.frequency.setValueAtTime(880, c.currentTime)
    g.gain.setValueAtTime(0.15, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.6)
    o1.start(c.currentTime); o2.start(c.currentTime)
    o1.stop(c.currentTime + 0.6); o2.stop(c.currentTime + 0.6)
    return o1
  },
}

export const SOUND_THEMES = Object.keys(themes)

export function playChime(theme = 'default', volume = 0.8) {
  return new Promise(resolve => {
    try {
      const c = ctx()
      const g = c.createGain()
      g.gain.value = volume
      const osc = themes[theme]?.(c) || themes.default(c)
      osc.onended = resolve
    } catch {
      resolve()
    }
  })
}
