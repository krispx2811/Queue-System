let audioCtx = null

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

// Helper: create a note with nice envelope and harmonics
function playNote(c, freq, startTime, duration, type = 'sine', vol = 0.2) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, startTime)
  o.connect(g)
  g.connect(c.destination)
  // Smooth attack + decay
  g.gain.setValueAtTime(0, startTime)
  g.gain.linearRampToValueAtTime(vol, startTime + 0.02)
  g.gain.setValueAtTime(vol, startTime + duration * 0.3)
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  o.start(startTime)
  o.stop(startTime + duration)
  return o
}

// Helper: two-tone with harmonics for richer sound
function richTone(c, freq, startTime, duration, vol = 0.15) {
  playNote(c, freq, startTime, duration, 'sine', vol)
  playNote(c, freq * 2, startTime, duration * 0.6, 'sine', vol * 0.3)
  playNote(c, freq * 3, startTime, duration * 0.3, 'sine', vol * 0.1)
  return playNote(c, freq, startTime, duration, 'sine', vol)
}

const themes = {
  // Soft two-tone doorbell — classic ding-dong
  doorbell: (c) => {
    richTone(c, 830, c.currentTime, 0.5)
    return richTone(c, 622, c.currentTime + 0.35, 0.6)
  },

  // Gentle 3-note ascending chime — spa/hotel lobby
  gentle: (c) => {
    richTone(c, 523, c.currentTime, 0.4, 0.12)
    richTone(c, 659, c.currentTime + 0.2, 0.4, 0.12)
    return richTone(c, 784, c.currentTime + 0.4, 0.6, 0.15)
  },

  // Airport announcement tone — descending two-note
  airport: (c) => {
    richTone(c, 880, c.currentTime, 0.3, 0.15)
    return richTone(c, 660, c.currentTime + 0.25, 0.5, 0.18)
  },

  // Hospital/clinic soft ping
  clinic: (c) => {
    return richTone(c, 1047, c.currentTime, 0.8, 0.1)
  },

  // Bank counter — firm double beep
  counter: (c) => {
    playNote(c, 880, c.currentTime, 0.12, 'sine', 0.2)
    return playNote(c, 880, c.currentTime + 0.18, 0.12, 'sine', 0.2)
  },

  // Elegant 4-note ascending — luxury/premium feel
  elegant: (c) => {
    const notes = [523, 659, 784, 1047]
    let last
    notes.forEach((f, i) => {
      last = richTone(c, f, c.currentTime + i * 0.15, 0.5, 0.1)
    })
    return last
  },

  // Westminster chime (Big Ben style) — 4 notes
  westminster: (c) => {
    const notes = [659, 587, 523, 392]
    let last
    notes.forEach((f, i) => {
      last = richTone(c, f, c.currentTime + i * 0.4, 0.6, 0.12)
    })
    return last
  },

  // Soft bell — single warm bell strike with decay
  softbell: (c) => {
    playNote(c, 880, c.currentTime, 1.2, 'sine', 0.15)
    playNote(c, 1760, c.currentTime, 0.6, 'sine', 0.05)
    playNote(c, 2640, c.currentTime, 0.3, 'sine', 0.02)
    return playNote(c, 440, c.currentTime, 1.5, 'sine', 0.08)
  },

  // Notification — modern phone-style triple note
  notify: (c) => {
    playNote(c, 784, c.currentTime, 0.1, 'sine', 0.2)
    playNote(c, 988, c.currentTime + 0.12, 0.1, 'sine', 0.2)
    return playNote(c, 1175, c.currentTime + 0.24, 0.25, 'sine', 0.18)
  },

  // Success — cheerful ascending major triad
  success: (c) => {
    richTone(c, 523, c.currentTime, 0.2, 0.15)
    richTone(c, 659, c.currentTime + 0.15, 0.2, 0.15)
    return richTone(c, 784, c.currentTime + 0.3, 0.4, 0.18)
  },

  // Attention — firm two-tone alert, commonly used in public spaces
  attention: (c) => {
    playNote(c, 880, c.currentTime, 0.25, 'sine', 0.2)
    playNote(c, 880, c.currentTime, 0.25, 'triangle', 0.08)
    return playNote(c, 1109, c.currentTime + 0.3, 0.35, 'sine', 0.18)
  },

  // Xylophone — bright wooden mallet sound
  xylophone: (c) => {
    playNote(c, 1047, c.currentTime, 0.15, 'triangle', 0.25)
    playNote(c, 1319, c.currentTime + 0.12, 0.15, 'triangle', 0.25)
    return playNote(c, 1568, c.currentTime + 0.24, 0.3, 'triangle', 0.2)
  },
}

export const SOUND_THEMES = Object.keys(themes)

export function playChime(theme = 'doorbell', volume = 0.8) {
  return new Promise(resolve => {
    try {
      const c = ctx()
      // Master volume
      const master = c.createGain()
      master.gain.value = volume
      master.connect(c.destination)

      // Temporarily redirect destination through master
      const origDest = c.destination
      const themeFunc = themes[theme] || themes.doorbell
      const osc = themeFunc(c)
      if (osc) osc.onended = resolve
      else setTimeout(resolve, 1500)
    } catch {
      resolve()
    }
  })
}
