import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { loginUser, registerUser } from '../../utils/api'
import { generateKeyPair, getBoxKeys } from '../../utils/crypto'
import { setPrivateKey, setPublicKey } from '../../utils/storage'
import { showNotification } from '../Common/Notification'
import KeyPromptModal from '../Modals/KeyPromptModal'
import SaveKeyModal from '../Modals/SaveKeyModal'
import './Login.css'

const Login = () => {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [showSaveKey, setShowSaveKey] = useState(false)
  const [pendingPrivateKey, setPendingPrivateKey] = useState(null)
  const [pendingLogin, setPendingLogin] = useState(null)
  
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!login || !password) {
      showNotification('Введите логин и пароль', 'error')
      return
    }

    setIsLoading(true)
    try {
      const privateKey = localStorage.getItem('private_key')
      if (!privateKey || privateKey === 'null') {
        setPendingLogin({ login, password, action: 'login' })
        setShowKeyPrompt(true)
        setIsLoading(false)
        return
      }

      const boxKeys = getBoxKeys()
      if (!boxKeys) {
        showNotification('Неверный ключ', 'error')
        setIsLoading(false)
        return
      }

      const result = await loginUser(login, password, boxKeys.publicKey)
      
      if (result.token) {
        authLogin(result.token, result.id || result.userId)
        navigate('/')
      } else if (result.error === 'KeyNotCorrect') {
        localStorage.removeItem('private_key')
        localStorage.removeItem('public_key')
        setPendingLogin({ login, password, action: 'login' })
        setShowKeyPrompt(true)
      } else {
        showNotification(result.error || 'Ошибка входа', 'error')
      }
    } catch (error) {
      showNotification('Ошибка входа', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!login || !password) {
      showNotification('Введите логин и пароль', 'error')
      return
    }

    setIsLoading(true)
    try {
      const { publicKey, privateKey } = generateKeyPair()
      
      setPrivateKey(privateKey)
      setPublicKey(publicKey)
      
      const result = await registerUser(login, password, publicKey)
      
      if (result.token) {
        // Показываем модалку сохранения ключа
        setPendingPrivateKey(privateKey)
        setShowSaveKey(true)
        
        // Сохраняем токен и ID для последующего входа
        authLogin(result.token, result.id || result.userId)
        
        // Не переходим сразу, ждем пока пользователь сохранит ключ
      } else {
        showNotification(result.error || 'Ошибка регистрации', 'error')
        setIsLoading(false)
      }
    } catch (error) {
      showNotification('Ошибка регистрации', 'error')
      setIsLoading(false)
    }
  }

  const handleKeySaved = () => {
    setShowSaveKey(false)
    setPendingPrivateKey(null)
    navigate('/')
  }

  const handleKeySkipped = () => {
    setShowSaveKey(false)
    setPendingPrivateKey(null)
    showNotification(
      'Ключ сохранён только в браузере. При очистке cookies доступ будет потерян.',
      'warning',
      5000
    )
    navigate('/')
  }

  const handleKeyLoaded = async (privateKey) => {
    setShowKeyPrompt(false)
    setPrivateKey(privateKey)
    
    if (pendingLogin) {
      setIsLoading(true)
      try {
        const boxKeys = getBoxKeys()
        if (!boxKeys) {
          showNotification('Неверный ключ', 'error')
          setIsLoading(false)
          return
        }
        
        const result = await loginUser(pendingLogin.login, pendingLogin.password, boxKeys.publicKey)
        
        if (result.token) {
          authLogin(result.token, result.id || result.userId)
          navigate('/')
        } else {
          showNotification(result.error || 'Ошибка входа', 'error')
        }
      } catch (error) {
        showNotification('Ошибка входа', 'error')
      } finally {
        setIsLoading(false)
        setPendingLogin(null)
      }
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Arizer</h1>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <input
              type="text"
              placeholder="Логин"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="login-input"
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              disabled={isLoading}
            />
          </div>
          <div className="login-buttons">
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Вход...' : 'Войти'}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleRegister}
              disabled={isLoading}
            >
              Зарегистрироваться
            </button>
          </div>
        </form>
      </div>
      
      {showKeyPrompt && (
        <KeyPromptModal
          onLoad={handleKeyLoaded}
          onCancel={() => {
            setShowKeyPrompt(false)
            setPendingLogin(null)
          }}
        />
      )}

      {showSaveKey && pendingPrivateKey && (
        <SaveKeyModal
          privateKey={pendingPrivateKey}
          onSave={handleKeySaved}
          onSkip={handleKeySkipped}
        />
      )}
    </div>
  )
}

export default Login