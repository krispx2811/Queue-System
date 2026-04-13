import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const Ctx = createContext(null)

export function SocketProvider({ children }) {
  const [state, setState] = useState(null)
  const [announced, setAnnounced] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('state:sync', (data) => setState(data))
    socket.on('ticket:announced', (data) => setAnnounced(data))

    return () => socket.disconnect()
  }, [])

  const emit = (event, data) => {
    return new Promise((resolve) => {
      socketRef.current?.emit(event, data, (result) => resolve(result))
    })
  }

  const emitVoid = (event, data) => {
    socketRef.current?.emit(event, data)
  }

  return (
    <Ctx.Provider value={{ state, announced, emit, emitVoid }}>
      {state ? children : (
        <div style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gray-2)',
          fontFamily: 'var(--font)',
          fontSize: '14px',
        }}>
          Connecting...
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSocket must be inside SocketProvider')
  return ctx
}
