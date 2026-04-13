import { getLangCode } from '../utils/i18n'

let currentAudio = null
let aborted = false

function stopAll() {
  aborted = true
  window.speechSynthesis?.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.removeAttribute('src')
    currentAudio.load()
    currentAudio = null
  }
}

function speakGoogle(text, lang) {
  return new Promise((resolve) => {
    aborted = false
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`
      const audio = new Audio(url)
      currentAudio = audio
      audio.volume = 1

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        currentAudio = null
        resolve()
      }

      audio.addEventListener('ended', finish, { once: true })
      audio.addEventListener('error', () => {
        if (settled) return
        settled = true
        currentAudio = null
        // Fallback to Web Speech
        speakWeb(text, lang).then(resolve)
      }, { once: true })

      audio.play().catch(() => {
        if (settled) return
        settled = true
        currentAudio = null
        speakWeb(text, lang).then(resolve)
      })
    } catch {
      speakWeb(text, lang).then(resolve)
    }
  })
}

function speakWeb(text, lang) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return }

    // Make sure nothing else is speaking
    window.speechSynthesis.cancel()

    const langCode = getLangCode(lang)
    const u = new SpeechSynthesisUtterance(text)
    u.lang = langCode
    u.rate = 0.9
    u.volume = 1

    const voices = window.speechSynthesis.getVoices()
    const matching = voices.filter(v => v.lang.startsWith(lang) || v.lang.startsWith(langCode.split('-')[0]))
    const best = matching.find(v =>
      /Google|Microsoft|Premium|Enhanced|Natural|Samira|Majed|Maged/i.test(v.name)
    ) || matching[0]
    if (best) u.voice = best

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    u.onend = finish
    u.onerror = finish
    // Safety timeout — some browsers never fire onend
    const timeout = setTimeout(finish, 10000)
    const origFinish = finish
    u.onend = () => { clearTimeout(timeout); origFinish() }
    u.onerror = () => { clearTimeout(timeout); origFinish() }

    window.speechSynthesis.speak(u)
  })
}

// Speak one language, wait for it to fully finish, then return
async function speakSequential(text, lang) {
  if (aborted) return
  await speakGoogle(text, lang)
  // Extra small gap to make sure audio hardware is released
  await new Promise(r => setTimeout(r, 200))
}

export async function testSpeak(text, lang) {
  stopAll()
  await new Promise(r => setTimeout(r, 100))
  await speakSequential(text, lang)
}

export { speakSequential, stopAll }
