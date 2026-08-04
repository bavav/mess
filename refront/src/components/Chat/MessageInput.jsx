import React, { useState, useRef } from 'react'
import { useChat } from '../../context/ChatContext'
import { useAuth } from '../../context/AuthContext'
import { encryptFile, saveChatKey, getChatKey } from '../../utils/crypto'
import { uploadBlob } from '../../utils/api'
import { showNotification } from '../Common/Notification'
import FilePreviewModal from '../Modals/FilePreviewModal'

const MessageInput = () => {
  const [text, setText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [showFilePreview, setShowFilePreview] = useState(false)
  const fileInputRef = useRef(null)
  
  const { currentChatId, sendMessage, addMessage } = useChat()
  const { userId, token } = useAuth()

  const handleSend = async () => {
    if (!text.trim() && pendingFiles.length === 0) return
    if (!currentChatId) return
    
    const attachments = []
    
    try {
      // Upload files first
      if (pendingFiles.length > 0) {
        setIsUploading(true)
        const chatKeyBase64 = await getChatKey(currentChatId)
        const chatKey = naclUtil.decodeBase64(chatKeyBase64)
        
        for (const file of pendingFiles) {
          const encrypted = await encryptFile(file, chatKey)
          await uploadBlob(encrypted.blobHash, encrypted.blob, token)
          
          attachments.push({ blob_hash: encrypted.blobHash })
        }
      }
      
      const messageText = text.trim()
      setText('')
      setPendingFiles([])
      setShowFilePreview(false)
      
      await sendMessage(currentChatId, messageText, attachments)
      
    } catch (error) {
      console.error('Send error:', error)
      showNotification('Ошибка отправки', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    
    setPendingFiles(files)
    setShowFilePreview(true)
    e.target.value = ''
  }

  const handleRemoveFile = (index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
    if (pendingFiles.length <= 1) {
      setShowFilePreview(false)
    }
  }

  const handleCancelFiles = () => {
    setPendingFiles([])
    setShowFilePreview(false)
  }

  return (
    <div className="message-input-wrapper">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleFileSelect}
      />
      
      <button 
        className="btn-file"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        📎
      </button>
      
      <input
        type="text"
        className="message-input"
        placeholder="Напишите сообщение..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={isUploading}
      />
      
      <button 
        className="btn-send"
        onClick={handleSend}
        disabled={(!text.trim() && pendingFiles.length === 0) || isUploading}
      >
        {isUploading ? '⏳' : '→'}
      </button>
      
      {showFilePreview && pendingFiles.length > 0 && (
        <FilePreviewModal
          files={pendingFiles}
          onSend={handleSend}
          onRemove={handleRemoveFile}
          onCancel={handleCancelFiles}
          isUploading={isUploading}
        />
      )}
    </div>
  )
}

export default MessageInput