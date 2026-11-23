import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { getChats, getChatMessages, sendMessage as sendMsg, createChat as createChatApi } from '../utils/api'
import { getChatKey, saveChatKey, loadKeys } from '../utils/crypto'
import { encryptMessage, decryptMessage } from '../utils/crypto'

const ChatContext = createContext()

export const useChat = () => useContext(ChatContext)

export const ChatProvider = ({ children }) => {
  const { userId, token } = useAuth()
  
  const [chats, setChats] = useState([])
  const [messages, setMessages] = useState({})
  const [currentChatId, setCurrentChatId] = useState(null)
  const [isLoadingChats, setIsLoadingChats] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [currentPage, setCurrentPage] = useState({})
  
  const messageCache = useRef({})

  // Load chats
  const loadChats = useCallback(async () => {
    if (!userId) return
    
    setIsLoadingChats(true)
    try {
      const data = await getChats(userId, token)
      setChats(data)
    } catch (error) {
      console.error('Failed to load chats:', error)
    } finally {
      setIsLoadingChats(false)
    }
  }, [userId, token])

  // Load messages for a chat
  const loadMessages = useCallback(async (chatId, page = 1, perPage = 50) => {
    if (!chatId || !userId) return
    
    setIsLoadingMessages(true)
    try {
      const data = await getChatMessages(chatId, userId, token, page, perPage)
      
      setMessages(prev => ({
        ...prev,
        [chatId]: page === 1 ? data : [...(prev[chatId] || []), ...data]
      }))
      
      setCurrentPage(prev => ({ ...prev, [chatId]: page }))
      setHasMoreMessages(data.length === perPage)
      
      return data
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setIsLoadingMessages(false)
    }
  }, [userId, token])

  // Load older messages (infinite scroll)
  const loadOlderMessages = useCallback(async (chatId) => {
    if (isLoadingMessages || !hasMoreMessages) return
    
    const nextPage = (currentPage[chatId] || 0) + 1
    await loadMessages(chatId, nextPage)
  }, [isLoadingMessages, hasMoreMessages, currentPage, loadMessages])

  // Send message
  const sendMessage = useCallback(async (chatId, text, attachments = []) => {
    if (!chatId || !userId) return
    
    try {
      const chatKeyBase64 = await getChatKey(chatId)
      if (!chatKeyBase64) {
        await loadKeys(userId, token)
        const newKey = await getChatKey(chatId)
        if (!newKey) throw new Error('Chat key not found')
      }
      
      const messageObj = {
        type: 'message',
        version: 1,
        text: text.trim() || null,
        attachments: attachments.length > 0 ? attachments : null
      }
      
      const messageJson = JSON.stringify(messageObj)
      const encrypted = await encryptMessage(chatKeyBase64, messageJson)
      
      const data = {
        user_id: userId,
        content: encrypted.encrypted,
        nonce: encrypted.nonce
      }
      
      await sendMsg(chatId, data, token)
      
      // Optimistically add message to UI
      // The socket will handle actual message display
      
    } catch (error) {
      console.error('Send message error:', error)
      throw error
    }
  }, [userId, token])

  // Create chat
  const createChat = useCallback(async (data) => {
    if (!userId) return
    
    try {
      const result = await createChatApi(data, userId, token)
      await loadChats()
      return result
    } catch (error) {
      console.error('Create chat error:', error)
      throw error
    }
  }, [userId, token, loadChats])

  // Add message to state (for socket events)
  const addMessage = useCallback((chatId, message) => {
    setMessages(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), message]
    }))
  }, [])

  // Clear messages cache
  const clearMessages = useCallback((chatId) => {
    setMessages(prev => {
      const newState = { ...prev }
      delete newState[chatId]
      return newState
    })
    setCurrentPage(prev => {
      const newState = { ...prev }
      delete newState[chatId]
      return newState
    })
    setHasMoreMessages(true)
  }, [])

  // Select chat
  const selectChat = useCallback((chatId) => {
    if (currentChatId !== chatId) {
      clearMessages(chatId)
      setCurrentChatId(chatId)
      loadMessages(chatId)
    }
  }, [currentChatId, clearMessages, loadMessages])

  return (
    <ChatContext.Provider value={{
      chats,
      messages,
      currentChatId,
      isLoadingChats,
      isLoadingMessages,
      hasMoreMessages,
      loadChats,
      loadMessages,
      loadOlderMessages,
      sendMessage,
      createChat,
      addMessage,
      selectChat,
      setCurrentChatId,
      clearMessages
    }}>
      {children}
    </ChatContext.Provider>
  )
}