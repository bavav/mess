import React, { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { getUserById, setUserAvatar } from '../../utils/api'
import { showNotification } from '../Common/Notification'

const ProfilePanel = () => {
  const { userId, token } = useAuth()
  const { currentChatId } = useChat()
  
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSelf, setIsSelf] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true)
      try {
        const data = await getUserById(userId, token)
        setProfile(data)
        setIsSelf(true)
      } catch (error) {
        console.error('Failed to load profile:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadProfile()
  }, [userId, token])

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    try {
      await setUserAvatar(userId, file, token)
      showNotification('Аватар обновлен', 'success')
      // Reload profile
      const data = await getUserById(userId, token)
      setProfile(data)
    } catch (error) {
      showNotification('Ошибка обновления аватара', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="profile-panel">
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          Загрузка...
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="profile-panel">
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          Профиль не найден
        </div>
      </div>
    )
  }

  return (
    <div className="profile-panel">
      <div className="profile-panel-header">
        <label style={{ cursor: 'pointer' }}>
          <img 
            src={profile.avatar_url || '/static/uploads/default_avatar.webp'} 
            alt={profile.name}
            className="profile-avatar"
          />
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </label>
        <div>
          <p className="profile-name">{profile.name || 'User'}</p>
          <p className="profile-status">{profile.status || 'Online'}</p>
        </div>
      </div>
      
      <div className="profile-details">
        <div className="profile-detail-item">
          <div className="profile-detail-label">ID</div>
          <div className="profile-detail-value">{profile.id}</div>
        </div>
        {profile.desk && (
          <div className="profile-detail-item">
            <div className="profile-detail-label">Статус</div>
            <div className="profile-detail-value">{profile.desk}</div>
          </div>
        )}
        {profile.lifetime && (
          <div className="profile-detail-item">
            <div className="profile-detail-label">Активен с</div>
            <div className="profile-detail-value">
              {new Date(profile.lifetime).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfilePanel