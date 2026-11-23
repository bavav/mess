// ConfirmDialog.jsx
import React, { useState, useEffect } from 'react';
import './ConfirmDialog.css';

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="confirm-overlay">
      <div className="confirm-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-buttons">
          <button className="cancel-btn" onClick={onCancel}>
            Отмена
          </button>
          <button className="confirm-btn" onClick={onConfirm}>
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
};

// Хук для использования
export const useConfirm = () => {
  const [config, setConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    resolve: null
  });

  const confirm = (message, title = 'Подтверждение') => {
    return new Promise((resolve) => {
      setConfig({
        isOpen: true,
        title,
        message,
        resolve
      });
    });
  };

  const handleConfirm = () => {
    config.resolve(true);
    setConfig({ isOpen: false, title: '', message: '', resolve: null });
  };

  const handleCancel = () => {
    config.resolve(false);
    setConfig({ isOpen: false, title: '', message: '', resolve: null });
  };

  const Dialog = () => (
    <ConfirmDialog
      isOpen={config.isOpen}
      title={config.title}
      message={config.message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, Dialog };
};

