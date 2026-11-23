import React, { useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import ChatList from './ChatList'
import ChatMessages from './ChatMessages'
import MessageInput from './MessageInput'
import ProfilePanel from './ProfilePanel'
import CreateChatModal from '../Modals/CreateChatModal'
import useSocket from '../../hooks/useSocket'
import './Chat.css'

const ChatApp = () => {
  const { userId, token } = useAuth()
  const { currentChatId, messages, addMessage, loadChats } = useChat()
  const socket = useSocket(token)
  
  const messagesEndRef = useRef(null)

  // Handle incoming messages via socket
  useEffect(() => {
    if (!socket) return
    
    const handleMessage = (data) => {
      if (data.type === 'new_msg') {
        const messageObj = {
          id: data.message_id,
          user_id: data.user_id,
          login: data.login,
          avatar_url: data.avatar_url,
          content: data.text || data.content,
          nonce: data.nonce,
          sent_at: data.sent_at
        }
        addMessage(data.chat_id.toString(), messageObj)
        
        // Refresh chats list to update last message
        loadChats()
      }
    }
    
    socket.on('message', handleMessage)
    
    return () => {
      socket.off('message', handleMessage)
    }
  }, [socket, addMessage, loadChats])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages[currentChatId]])

  return (
    <div className="chat-app">
      <ChatList />
      
      <div className="chat-main">
        {currentChatId ? (
          <>
            <div className="chat-messages-wrapper">
              <ChatMessages />
              <div ref={messagesEndRef} />
            </div>
            <MessageInput />
          </>
        ) : (
          <div className="chat-placeholder">
            <p>Выберите чат для начала общения</p>
          </div>
        )}
      </div>
      
      <ProfilePanel />
      <CreateChatModal />
    </div>
  )
}

export default ChatApp