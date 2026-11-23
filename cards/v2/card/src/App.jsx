/* eslint-disable no-unused-vars */
import { useEffect } from 'react';
import React, { useState } from 'react';
import './App.css';
import CardCollection from './Collection';
import ScratchCard from './ScratchCard';
// ✅ Компонент ResourceItem вынесен за пределы App
const ResourceItem = ({ icon, value, label, type }) => (
  <div className="resource-item">
    <span className="resource-icon">{icon}</span>
    <span className="resource-value">{value}</span>
    {label && <span className="resource-label">{label}</span>}
    
  </div>
);

// ✅ Компонент GameCard для переиспользования
const GameCard = ({ title, description, buttonText, onButtonClick }) => (
  <div className="game-card">
    <div className="game-title">{title}</div>
    <div className="game-description">{description}</div>
    {buttonText && (
      <button className="action-btn" onClick={onButtonClick}>
        {buttonText}
      </button>
    )}
  </div>
);

// ✅ Конфигурация вкладок (вынесена для чистоты)
const TABS = [
  { id: 'shop', icon: '🏪', label: 'Магазин' },
  { id: 'quests', icon: '🎴', label: 'Крутки' },
  { id: 'inventory', icon: '📦', label: 'Коллекция' },
  { id: 'profile', icon: '👤', label: 'Профиль' }
];

const App = () => {
  // Состояние ресурсов
  const [resources, setResources] = useState({
    coins: 1250,
    diamonds: 85,
    energy: 120,
    maxEnergy: 150,
    level: 3,
    trophies: 42,
    tickets: 3
  });
  // if (!localStorage.getItem("userId")) {
  //   fetch(`/api/v2/user/${userId}/res`)
  //     .then(r => r.json())
  //     .then((r) => {
  //       if (r.ok) {
  //         fetch(`/api/v2/user/${userId}/res`)
  //           .then(r => r.json())
  //           .then((r) => {
  //             localStorage.setItem("userId",r.id);
  //             localStorage.setItem("token",r.token)
  //           });
  //       };
  //     });
    
  // };
  const [userId, setUserId] = useState(localStorage.getItem("userId"));
  const fetcReses = () => {
    // Замените на ваш способ получения токена (localStorage, cookie, redux и т.д.)
    const token = localStorage.getItem('token'); 

    if (!userId) return;

    console.log("Fetch ресурсов для пользователя:", userId);
    
    fetch(`/api/v2/users/${userId}/res`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Обязательно передаем токен, иначе бэкенд выдаст ошибку
        'Authorization': `Bearer ${token}` 
      }
    })
      .then(r => {
        if (!r.ok) {
          throw new Error(`Ошибка сервера: ${r.status}`);
        }
        return r.json();
      })
      .then(data => setResources(data))
      .catch(err => console.error("Ошибка при получении ресурсов:", err));

  }
  useEffect(fetcReses, [userId]);
  // Активная вкладка
  const [activeTab, setActiveTab] = useState('shop');

  // Универсальная функция обновления ресурсов
  const updateResource = (type, amount) => {
    setResources(prev => {
      const newState = { ...prev };
      switch(type) {
        case 'coins':
          newState.coins += amount;
          break;
        case 'diamonds':
          newState.diamonds += amount;
          break;
        case 'energy':
          newState.energy = Math.min(newState.energy + amount, newState.maxEnergy);
          break;
        case 'level':
          newState.level += amount;
          break;
        case 'trophies':
          newState.trophies += amount;
          break;
        case 'tickets':
          newState.tickets += amount;
          break;
        default:
          break;
      }
      return newState;
    });
  };

  // Покупка предмета
  const buyItem = (coinCost, diamondCost) => {
    if (resources.coins >= coinCost && resources.diamonds >= diamondCost) {
      setResources(prev => ({
        ...prev,
        coins: prev.coins - coinCost,
        diamonds: prev.diamonds - diamondCost
      }));
      showNotification('✅ Покупка успешна!');
    } else {
      showNotification('❌ Недостаточно ресурсов!');
    }
  };

  // Открытие сундука
  const openChest = () => {
    const reward = Math.floor(Math.random() * 500) + 50;
    updateResource('coins', reward);
    showNotification(`📦 Вы получили ${reward} монет!`);
  };

  // Завершение квеста
  const completeQuest = (coinsReward, diamondsReward = 0) => {
    updateResource('coins', coinsReward);
    if (diamondsReward > 0) {
      updateResource('diamonds', diamondsReward);
    }
    showNotification(`💰 +${coinsReward} монет!${diamondsReward > 0 ? ` 💎 +${diamondsReward}` : ''}`);
  };

  // Уведомление
  const showNotification = (message) => {
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
  };

  // Список ресурсов для отображения (можно легко добавлять/убирать)
  const resourceList = [
    { icon: '🪙', key: 'coins', label: null},
    { icon: '💎', key: 'diamonds', label: null},
    { icon: '⚡', key: 'energy', label: null, formatter: (val, max) => `${val}/${max}` },
    { icon: '⭐', key: 'level', label: 'ур.'},
    { icon: '🏆', key: 'trophies', label: null},
    { icon: '🎫', key: 'tickets', label: 'шт.'}
  ];

  // Функция рендера контента вкладок
  const renderContent = () => {
    const handleComplete = () => {
      console.log('Карточка полностью стерта!');
      // Здесь можно добавить анимацию или звук
    };

    const handleProgress = (progress) => {
      console.log(`Прогресс: ${Math.floor(progress * 100)}%`);
    };
    switch(activeTab) {
      case 'shop':
        return (
          <>
            <GameCard 
              title="🏪 Магазин"
              description="Редкий сундук с сокровищами"
              buttonText="Купить за 500🪙 + 10💎"
              onButtonClick={() => buyItem(500, 10)}
            />
            <GameCard 
              title="🎨 Эпический скин"
              description="Легендарный облик для героя"
              buttonText="Купить за 50💎"
              onButtonClick={() => buyItem(0, 50)}
            />
            <GameCard 
              title="⚡ Энергия"
              description="Восстанавливает 50 энергии"
              buttonText="Купить за 200🪙"
              onButtonClick={() => {
                if (resources.coins >= 200) {
                  updateResource('coins', -200);
                  updateResource('energy', 50);
                  showNotification('⚡ +50 энергии!');
                } else {
                  showNotification('❌ Не хватает монет!');
                }
              }}
            />
          </>
        );
      
      case 'quests':
        
        return (
          <>
            <ScratchCard
              fetcReses={fetcReses}
              onComplete={handleComplete}
              onProgress={handleProgress}
            />
          </>
        );
      
      case 'inventory':
        return (
          <>
            <CardCollection />
          </>
        );
      
      case 'profile':
        return (
          <div className="game-card">
            <div className="game-title">👤 Профиль игрока</div>
            <div className="game-description">ID: {userId}</div>
            <div className="game-description">Уровень: {resources.level}</div>
            <div className="game-description">Рейтинг: {resources.trophies}</div>
            <div className="game-description">Монет собрано: {resources.coins}</div>
            <div className="game-description">Алмазов: {resources.diamonds}</div>
            
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      
      {/* Верхняя панель ресурсов */}
      <div className="resources-bar">
        <div className="resources-scroll">
          <div className="resources-grid">
            {resourceList.map((resource) => (
              <ResourceItem
                key={resource.key}
                icon={resource.icon}
                value={resource.formatter 
                  ? resource.formatter(resources[resource.key], resources.maxEnergy)
                  : resources[resource.key]
                }
                label={resource.label}
                type={resource.key}
              />
            ))}
          </div>
        </div>
        <div className="scroll-hint">← → листайте для просмотра всех ресурсов</div>
      </div>

      {/* Основной контент */}
      <div className="content">
        {renderContent()}
      </div>

      {/* Нижняя панель вкладок */}
      <div className="bottom-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;