import { useEffect, useRef } from 'react'
import { useSocket } from '../context/SocketContext'
import { playChime } from '../utils/sounds'
import { t } from '../utils/i18n'
import { speakSequential, stopAll } from '../hooks/useVoice'

export default function VoiceAnnouncer() {
  const { state, announced } = useSocket()
  const busyRef = useRef(false)
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!announced) return

    const key = `${announced.ticketNumber}-${announced.action}-${announced.counterId}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    if (busyRef.current) return
    busyRef.current = true

    const run = async () => {
      const { soundTheme = 'default', languages = ['en', 'ar'], volume = 0.8 } = state.settings

      try {
        stopAll()
        await playChime(soundTheme, volume)
        await new Promise(r => setTimeout(r, 500))

        for (let i = 0; i < languages.length; i++) {
          const lang = languages[i]
          const textKey = announced.action === 'recall' ? 'voiceRecall' : 'voiceNowServing'
          const text = t(textKey, lang, { n: announced.ticketNumber, counter: announced.counterName || '' })

          window.speechSynthesis?.cancel()

          await speakSequential(text, lang, state.settings)

          if (i < languages.length - 1) {
            await new Promise(r => setTimeout(r, 800))
          }
        }
      } finally {
        busyRef.current = false
      }
    }

    run()
  }, [announced])

  return null
}
