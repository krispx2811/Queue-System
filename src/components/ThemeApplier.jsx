import { useEffect } from 'react'
import { useSocket } from '../context/SocketContext'

export default function ThemeApplier() {
  const { state } = useSocket()

  // Theme + accent color
  useEffect(() => {
    const { theme, accentColor } = state.settings
    document.documentElement.setAttribute('data-theme', theme || 'light')
    if (accentColor) {
      document.documentElement.style.setProperty('--blue', accentColor)
      const r = parseInt(accentColor.slice(1, 3), 16)
      const g = parseInt(accentColor.slice(3, 5), 16)
      const b = parseInt(accentColor.slice(5, 7), 16)
      document.documentElement.style.setProperty('--blue-dim', `rgba(${r}, ${g}, ${b}, 0.12)`)
    }
  }, [state.settings.theme, state.settings.accentColor])

  // Custom CSS
  useEffect(() => {
    let style = document.getElementById('queue-custom-css')
    if (!style) {
      style = document.createElement('style')
      style.id = 'queue-custom-css'
      document.head.appendChild(style)
    }
    style.textContent = state.settings.customCSS || ''
  }, [state.settings.customCSS])

  // Background theme
  useEffect(() => {
    document.documentElement.setAttribute('data-bg', state.settings.backgroundTheme || 'none')
  }, [state.settings.backgroundTheme])

  return null
}
