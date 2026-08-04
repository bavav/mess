import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'

const useSocket = (token) => {
  const [socket, setSocket] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!token) return
    
    const newSocket = io('', {
      transports: ['websocket', 'polling'],
      query: { token }
    })
    
    newSocket.on('connect', () => {
      console.log('✅ Connected to server!')
    })
    
    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error)
    })
    
    socketRef.current = newSocket
    setSocket(newSocket)
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [token])

  return socket
}

export default useSocket