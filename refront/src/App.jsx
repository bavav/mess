import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useChat } from './context/ChatContext'
import Login from './components/Login/Login'
import ChatApp from './components/Chat/ChatApp'
import { Notification } from './components/Common/Notification'

function App() {
  const { isAuthenticated, isLoading, userId } = useAuth()
  const { loadChats } = useChat()
  const location = useLocation()

  useEffect(() => {
    if (isAuthenticated && userId) {
      loadChats()
    }
  }, [isAuthenticated, userId, loadChats])

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#121212',
        color: '#e0e0e0'
      }}>
        Загрузка...
      </div>
    )
  }

  return (
    <>
      <Notification />
      <Routes>
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to="/" /> : <Login />} 
        />
        <Route 
          path="/" 
          element={isAuthenticated ? <ChatApp /> : <Navigate to="/login" />} 
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  )
}

export default App