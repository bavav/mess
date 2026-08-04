import React, { createContext, useState, useContext, useEffect } from 'react'
import { getUserId, getToken, setToken, setUserId, clearAuth } from '../utils/storage'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [userId, setUserIdState] = useState(null)
  const [token, setTokenState] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const storedToken = getToken()
    const storedUserId = getUserId()
    
    if (storedToken && storedUserId) {
      setTokenState(storedToken)
      setUserIdState(storedUserId)
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const login = (token, userId) => {
    setToken(token)
    setUserId(userId)
    setTokenState(token)
    setUserIdState(userId)
    setIsAuthenticated(true)
  }

  const logout = () => {
    clearAuth()
    setTokenState(null)
    setUserIdState(null)
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{
      userId,
      token,
      isAuthenticated,
      isLoading,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}