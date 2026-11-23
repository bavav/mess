import React, { useState } from 'react'
import { useChat } from '../../context/ChatContext'
import { useAuth } from '../../context/AuthContext'
import { sha256, getBoxKeys, saveChatKey } from '../../utils/crypto'
import { showNotification } from '../Common/Notification'
import './Modals.css'

const CreateChatModal = ({ isOpen, onClose }) => {
  const [name, setName] = useState('')
  const [participants, setParticipants] = useState('')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const { createChat } = useChat()
  const { userId } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      showNotification('Введите название чата', 'error')
      return
    }
    
    setIsLoading(true)
    try {
      // Generate chat key
      const chatKey = nacl.randomBytes(nacl.secretbox.keyLength)
      const chatKeyBase64 = naclUtil.encodeBase64(chatKey)
      const chatKeyHash = await sha256(chatKeyBase64)
      
      // Encrypt key for storage
      const keyPair = getBoxKeys()
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
      const encrypted = nacl.secretbox(chatKey, nonce, keyPair.secretKey)
      
      const combined = new Uint8Array(nonce.length + encrypted.length)
      combined.set(nonce, 0)
      combined.set(encrypted, nonce.length)
      const codedKeyWithNonce = naclUtil.encodeBase64(combined)
      
      const data = {
        name: name.trim(),
        description: description.trim(),
        participants: participants.trim(),
        chat_key_hash: chatKeyHash,
        coded_key: codedKeyWithNonce
      }
      
      const result = await createChat(data)
      if (result.id) {
        saveChatKey(result.id, chatKeyBase64)
        showNotification('Чат создан!', 'success')
        setName('')
        setParticipants('')
        setDescription('')
        onClose()
      }
    } catch (error) {
      showNotification('Ошибка создания чата', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Создание нового чата</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Название чата *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название чата"
              required
              className="modal-input"
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label>Участники</label>
            <input
              type="text"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Введите id участников через запятую"
              className="modal-input"
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label>Описание чата</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите тему чата..."
              className="modal-textarea"
              rows={3}
              disabled={isLoading}
            />
          </div>
          
          <div className="modal-buttons">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Отмена
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Создание...' : 'Создать чат'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateChatModal