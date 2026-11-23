import React from 'react'
import { formatSize } from '../../utils/crypto'
import './Modals.css'

const FilePreviewModal = ({ files, onSend, onRemove, onCancel, isUploading }) => {
  if (!files || files.length === 0) return null

  return (
    <div className="file-preview-modal">
      <div className="file-preview-content">
        <div style={{ color: 'white', marginBottom: '8px', fontWeight: 'bold' }}>
          Файлы для отправки:
        </div>
        
        {files.map((file, index) => {
          const isImage = file.type && file.type.startsWith('image/')
          
          return (
            <div key={index} className="file-preview-item">
              <div className="file-preview-icon">
                {isImage ? '🖼️' : '📄'}
              </div>
              <div className="file-preview-info">
                <div className="file-preview-name">
                  {file.name || 'unnamed'}
                </div>
                <div className="file-preview-size">
                  {formatSize(file.size || 0)}
                </div>
              </div>
              <button 
                className="file-preview-remove"
                onClick={() => onRemove(index)}
                disabled={isUploading}
              >
                ✖
              </button>
            </div>
          )
        })}
        
        <div className="file-preview-actions">
          <button 
            className="btn btn-primary"
            onClick={onSend}
            disabled={isUploading}
          >
            {isUploading ? 'Отправка...' : '📤 Отправить'}
          </button>
          <button 
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isUploading}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilePreviewModal