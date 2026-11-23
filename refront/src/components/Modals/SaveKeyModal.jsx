import React, { useState } from 'react'
import './Modals.css'

const SaveKeyModal = ({ privateKey, onSave, onSkip }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(privateKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Fallback - выделяем текст для ручного копирования
      const textarea = document.createElement('textarea')
      textarea.value = privateKey
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([privateKey], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Arizer_private.key`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onSave()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onSkip()}>
      <div className="modal-content key-modal" onClick={(e) => e.stopPropagation()}>
        <div className="key-modal-icon">🔐</div>
        <h2>Сохраните приватный ключ</h2>
        <p className="key-modal-description">
          Этот файл — <strong>единственный способ</strong> восстановить доступ к вашим чатам 
          при смене устройства или очистке браузера.
        </p>
        <p className="key-modal-warning">
          ⚠️ Сохраните его в надёжном месте. Без него вы <strong>навсегда потеряете</strong> доступ к своим сообщениям.
        </p>

        <div className="key-display">
          <div className="key-display-label">Ваш приватный ключ:</div>
          <div className="key-display-value">
            {privateKey.slice(0, 20)}...{privateKey.slice(-10)}
          </div>
        </div>

        <div className="key-modal-actions">
          <button 
            className="btn btn-primary key-btn"
            onClick={handleDownload}
          >
            💾 Скачать файл .key
          </button>
          <button 
            className="btn btn-secondary key-btn"
            onClick={handleCopy}
          >
            {copied ? '✅ Скопировано!' : '📋 Скопировать в буфер'}
          </button>
        </div>

        <div className="key-modal-footer">
          <button 
            className="btn btn-danger key-skip-btn"
            onClick={onSkip}
          >
            ⚠️ Пропустить (рискованно)
          </button>
          <p className="key-modal-hint">
            Ключ будет сохранён только в браузере. При очистке cookies доступ будет потерян.
          </p>
        </div>
      </div>
    </div>
  )
}

export default SaveKeyModal