import React, { useEffect, useRef, useCallback } from 'react'
import { useChat } from '../../context/ChatContext'
import { useAuth } from '../../context/AuthContext'
import { decryptMessage, getChatKey } from '../../utils/crypto'
import { showNotification } from '../Common/Notification'

const ChatMessages = () => {
  const { 
    messages, 
    currentChatId, 
    isLoadingMessages,
    hasMoreMessages,
    loadOlderMessages
  } = useChat()
  const { userId } = useAuth()
  const containerRef = useRef(null)
  const initialLoadRef = useRef(true)

  const chatMessages = messages[currentChatId] || []

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    
    if (container.scrollTop <= 100 && !isLoadingMessages && hasMoreMessages) {
      loadOlderMessages(currentChatId)
    }
  }, [currentChatId, isLoadingMessages, hasMoreMessages, loadOlderMessages])

  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  // Scroll to bottom on first load
  useEffect(() => {
    if (initialLoadRef.current && chatMessages.length > 0) {
      const container = containerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
        initialLoadRef.current = false
      }
    }
  }, [chatMessages.length])

  // Render single message
  const renderMessage = (msg, index) => {
    const isSelf = msg.user_id === userId
    
    return (
      <div key={msg.id || index} className={isSelf ? 'message-block-self' : 'message-block'}>
        {!isSelf && (
          <img 
            src={msg.avatar_url || '/static/uploads/default_avatar.webp'} 
            alt={msg.login}
            className="message-avatar"
          />
        )}
        <div className={isSelf ? 'message-bubble-self' : 'message-bubble'}>
          {!isSelf && (
            <div className="message-username">{msg.login}</div>
          )}
          <div className="message-content">{msg.content}</div>
          {msg.sent_at && (
            <div className="message-time">
              {new Date(msg.sent_at).toLocaleTimeString()}
            </div>
          )}
        </div>
        {isSelf && (
          <img 
            src={msg.avatar_url || '/static/uploads/default_avatar.webp'} 
            alt={msg.login}
            className="message-avatar"
          />
        )}
      </div>
    )
  }

  // Decrypt and render messages
  const [decryptedMessages, setDecryptedMessages] = React.useState([])

  useEffect(() => {
    const decryptMessages = async () => {
      if (!currentChatId || chatMessages.length === 0) {
        setDecryptedMessages([])
        return
      }
      
      const chatKeyBase64 = await getChatKey(currentChatId)
      if (!chatKeyBase64) {
        setDecryptedMessages(chatMessages)
        return
      }
      
      const decrypted = await Promise.all(
        chatMessages.map(async (msg) => {
          try {
            const text = await decryptMessage(chatKeyBase64, msg.content, msg.nonce)
            return { ...msg, content: text || '⚠️ Не удалось расшифровать' }
          } catch {
            return { ...msg, content: '⚠️ Не удалось расшифровать' }
          }
        })
      )
      setDecryptedMessages(decrypted)
    }
    
    decryptMessages()
  }, [chatMessages, currentChatId])

  if (!currentChatId) {
    return null
  }

  return (
    <div className="chat-messages-wrapper" ref={containerRef}>
      {isLoadingMessages && (
        <div style={{ textAlign: 'center', padding: '8px', color: '#888', fontSize: '12px' }}>
          Загрузка сообщений...
        </div>
      )}
      
      {decryptedMessages.map((msg, index) => renderMessage(msg, index))}
      
      {!isLoadingMessages && decryptedMessages.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: '#666',
          fontSize: '14px'
        }}>
          Нет сообщений. Начните общение!
        </div>
      )}
    </div>
  )
}

export default ChatMessages