import React, { useState } from 'react'
import { useChat } from '../../context/ChatContext'
import { useAuth } from '../../context/AuthContext'
import { generateInviteLink } from '../../utils/api'

const ChatList = () => {
  const { chats, currentChatId, selectChat, loadChats } = useChat()
  const { userId } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)

  const handleInvite = (chatId) => {
    // Show invite modal or copy link
    const link = `${window.location.origin}/?join=${chatId}`
    navigator.clipboard.writeText(link)
    // Show notification
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <h2>Чаты</h2>
        <button 
          className="btn"
          onClick={() => setShowCreateModal(true)}
          title="Создать чат"
        >
          +
        </button>
      </div>
      
      <div className="chat-list-items">
        {/* Chat items */}
        {chats.map((chat) => (
          <button
            key={chat.id}
            className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
            onClick={() => selectChat(chat.id)}
          >
            <img 
              src={chat.avatar_url || '/static/uploads/default_avatar.webp'} 
              alt={chat.name}
              className="chat-item-avatar"
            />
            <div className="chat-item-info">
              <p className="chat-item-name">{chat.name || 'Unnamed Chat'}</p>
              <p className="chat-item-desk">{chat.desk || 'No description'}</p>
            </div>
          </button>
        ))}
        
        {/* Invite link button */}
        {currentChatId && (
          <button
            className="chat-item"
            onClick={() => handleInvite(currentChatId)}
            style={{ borderTop: '1px solid #2a2a2a', marginTop: '8px' }}
          >
            <div className="chat-item-info">
              <p className="chat-item-name" style={{ color: '#00eeff' }}>
                🔗 Скопировать ссылку-приглашение
              </p>
            </div>
          </button>
        )}
      </div>
      
      {/* Create chat modal - rendered elsewhere */}
    </div>
  )
}

export default ChatList