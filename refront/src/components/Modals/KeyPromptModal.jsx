import React, { useState, useRef } from 'react'
import { showNotification } from '../Common/Notification'
import './Modals.css'

const KeyPromptModal = ({ onLoad, onCancel }) => {
  const [manualKey, setManualKey] = useState('')
  const [activeTab, setActiveTab] = useState('file')
  const fileInputRef = useRef(null)
  const dropZoneRef = useRef(null)

  const validateKey = (key) => {
    const trimmed = key.trim()
    if (!trimmed) {
      showNotification('Ключ не может быть пустым', 'error')
      return null
    }
    
    try {
      const decoded = atob(trimmed)
      if (decoded.length !== 64) {
        showNotification(`Неверная длина ключа: ожидается 64 байта`, 'error')
        return null
      }
      return trimmed
    } catch {
      showNotification('Неверный формат ключа', 'error')
      return null
    }
  }

  const handleFileLoad = async (file) => {
    if (!file.name.endsWith('.key')) {
      showNotification('Ожидается файл .key', 'error')
      return
    }
    
    try {
      const text = await file.text()
      const validKey = validateKey(text)
      if (validKey) {
        onLoad(validKey)
      }
    } catch {
      showNotification('Ошибка чтения файла', 'error')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dropZoneRef.current?.classList.remove('dragover')
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileLoad(files[0])
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dropZoneRef.current?.classList.add('dragover')
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dropZoneRef.current?.classList.remove('dragover')
  }

  const handleManualSubmit = () => {
    const validKey = validateKey(manualKey)
    if (validKey) {
      onLoad(validKey)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>🔐 Загрузите приватный ключ</h3>
        <p>Без ключа вход невозможен.</p>
        
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            Файл
          </button>
          <button 
            className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            Ввод вручную
          </button>
        </div>
        
        {activeTab === 'file' && (
          <div 
            className="drop-zone"
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <p>Перетащите файл .key сюда</p>
            <p>или</p>
            <button 
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Выбрать файл
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".key"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0]
                if (file) handleFileLoad(file)
              }}
            />
          </div>
        )}
        
        {activeTab === 'manual' && (
          <div>
            <textarea
              className="modal-textarea"
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
              placeholder="Вставьте приватный ключ в формате base64"
              rows={4}
              style={{ fontFamily: 'monospace' }}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
              Ключ должен быть в формате base64 (около 88 символов)
            </p>
          </div>
        )}
        
        <div className="modal-buttons">
          <button 
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button 
            className="btn btn-primary"
            onClick={activeTab === 'file' ? () => fileInputRef.current?.click() : handleManualSubmit}
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  )
}

export default KeyPromptModal