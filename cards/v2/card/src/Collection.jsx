import React, { useState, useEffect } from 'react';
import './Collection.css';

const getRarityColor = (rarity) => {
  switch(rarity?.toLowerCase()) {
    case 'legendary': return '#ffd700';
    case 'эпическая': return '#9b59b6';
    case 'epic': return '#9b59b6';
    case 'rare': return '#3498db';
    case 'common': return '#95a5a6';
    default: return '#ffffff';
  }
};
// Модальное окно с наложением фрагментов
const FragmentModal = ({ card, fragments, totalFragments = 20, onClose }) => {
  const [selectedFragment, setSelectedFragment] = useState(null);
  const ownedFragmentsCount = fragments?.length || 0;
  const progress = (ownedFragmentsCount / totalFragments) * 100;
  const isComplete = ownedFragmentsCount === totalFragments;
  
  // Сортируем фрагменты
  const sortedFragments = [...(fragments || [])].sort((a, b) => {
    const numA = typeof a === 'number' ? a : a.number;
    const numB = typeof b === 'number' ? b : b.number;
    return numA - numB;
  });

  // Все номера фрагментов (1-20)
  const allFragmentNumbers = Array.from({ length: totalFragments }, (_, i) => i + 1);
  
  // Группируем фрагменты по рядам для удобного отображения
  const rows = [];
  const fragmentsPerRow = 5; // 4x5 сетка, значит 5 фрагментов в ряду
  for (let i = 0; i < totalFragments; i += fragmentsPerRow) {
    rows.push(allFragmentNumbers.slice(i, i + fragmentsPerRow));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        {/* Заголовок */}
        <div className="modal-header">
          <div>
            <h2>{card.name || 'Без названия'}</h2>
            <span className="modal-vers">Версия {card.vers || '1'}</span>
          </div>
          <span 
            className="modal-rarity"
            style={{ color: getRarityColor(card.rarity), borderColor: getRarityColor(card.rarity) }}
          >
            {card.rarity || 'Common'}
          </span>
        </div>

        {/* Превью карты с наложением фрагментов */}
        <div className="modal-preview-container">
          <div className="modal-card-preview">
            {/* Базовое изображение */}
            {card.image_url && (
              <img 
                src={card.image_url}
                alt={card.name}
                className="modal-base-image"
                style={{
                  filter: isComplete ? 'none' : 'blur(6px) brightness(0.3)',
                }}
              />
            )}

            {/* Наложение собранных фрагментов */}
            <div className="modal-fragments-overlay">
              {sortedFragments.map((fragment, idx) => {
                const fragmentNum = typeof fragment === 'number' ? fragment : fragment.number;
                const fragmentUrl = `/static/fragments/card_${card.id}/fragment_${fragmentNum}.png`;
                
                return (
                  <img
                    key={fragmentNum}
                    src={fragmentUrl}
                    alt={`Фрагмент ${fragmentNum}`}
                    className="modal-fragment-piece"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      zIndex: idx,
                      opacity: 1,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFragment(fragmentNum);
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                );
              })}
            </div>

            {/* Затемнение для неполных карт */}
            {!isComplete && (
              <div className="modal-preview-overlay">
                <div className="modal-progress-badge">
                  <span className="modal-progress-percent">{Math.round(progress)}%</span>
                  <span className="modal-progress-text">собрано</span>
                </div>
              </div>
            )}

            {/* Кнопка полного просмотра для собранной карты */}
            {isComplete && (
              <button className="modal-view-full-btn">
                🖼️ Полный просмотр
              </button>
            )}
          </div>
        </div>

        {/* Информация о прогрессе */}
        <div className="modal-fragments-info">
          <div className="fragments-stats">
            <div className="fragments-count-big">
              <span className="count-number">{ownedFragmentsCount}</span>
              <span className="count-total">/{totalFragments}</span>
              <span className="count-label">фрагментов</span>
            </div>
            <div className="fragments-progress-bar">
              <div 
                className="fragments-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Сетка всех фрагментов (собранные выделены) */}
        <div className="fragments-grid-container">
          <h3 className="fragments-grid-title">
            Фрагменты карты
            <span className="fragments-grid-hint">(нажмите на фрагмент для деталей)</span>
          </h3>
          
          <div className="fragments-grid">
            {allFragmentNumbers.map((fragmentNum) => {
              const hasFragment = fragments?.some(f => 
                (typeof f === 'number' ? f : f.number) === fragmentNum
              );
              
              return (
                <div
                  key={fragmentNum}
                  className={`fragment-grid-item ${hasFragment ? 'fragment-owned' : 'fragment-missing'}`}
                  onClick={() => setSelectedFragment(fragmentNum)}
                >
                  <div className="fragment-grid-preview">
                    {hasFragment && card.image_url && (
                      <img 
                        src={`/static/fragments/card_${card.id}fragment_/${fragmentNum}.png`}
                        alt={`Fragment ${fragmentNum}`}
                        className="fragment-grid-image"
                        onError={(e) => {
                          // Если нет изображения фрагмента, показываем номер
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    {!hasFragment && (
                      <div className="fragment-placeholder">
                        <span className="fragment-placeholder-icon">🔒</span>
                      </div>
                    )}
                  </div>
                  <div className="fragment-grid-number">#{fragmentNum}</div>
                  {hasFragment && (
                    <div className="fragment-owned-badge">✓</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Детальный просмотр выбранного фрагмента */}
        {selectedFragment && (
          <div className="fragment-detail-modal" onClick={() => setSelectedFragment(null)}>
            <div className="fragment-detail-content" onClick={(e) => e.stopPropagation()}>
              <button className="fragment-detail-close" onClick={() => setSelectedFragment(null)}>
                ✕
              </button>
              
              <div className="fragment-detail-header">
                <h3>Фрагмент #{selectedFragment}</h3>
                <span className={`fragment-detail-status ${fragments?.some(f => (typeof f === 'number' ? f : f.number) === selectedFragment) ? 'status-owned' : 'status-missing'}`}>
                  {fragments?.some(f => (typeof f === 'number' ? f : f.number) === selectedFragment) ? '✓ Собран' : '✗ Не собран'}
                </span>
              </div>

              <div className="fragment-detail-preview">
                {fragments?.some(f => (typeof f === 'number' ? f : f.number) === selectedFragment) ? (
                  <img 
                    src={`/static/fragments/card_${card.id}/fragment_${selectedFragment}.png`}
                    alt={`Fragment ${selectedFragment}`}
                    className="fragment-detail-image"
                    onError={(e) => {
                      e.target.src = card.image_url;
                      e.target.style.objectFit = 'contain';
                    }}
                  />
                ) : (
                  <div className="fragment-detail-placeholder">
                    <div className="placeholder-icon">🔒</div>
                    <p>Фрагмент еще не собран</p>
                    
                  </div>
                )}
              </div>

              {fragments?.some(f => (typeof f === 'number' ? f : f.number) === selectedFragment) && (
                <div className="fragment-detail-actions">
                  
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
// Компонент карточки с фрагментами-пазлами
const CardItemPuzzle = ({ card, fragments, totalFragments = 20, onCardClick }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const ownedFragmentsCount = fragments?.length || 0;
  const progress = (ownedFragmentsCount / totalFragments) * 100;
  const isComplete = ownedFragmentsCount === totalFragments;
  
  // Конфигурация сетки пазла (4x5 = 20 фрагментов)
  const gridCols = 4;
  const gridRows = 5;
  
  const getFragmentStyle = (index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    const isOwned = fragments?.some(f => f.number === index + 1);
    
    return {
      backgroundImage: card.image_url ? `url(${card.image_url})` : 'none',
      backgroundSize: `${gridCols * 100}% ${gridRows * 100}%`,
      backgroundPosition: `${col * (100 / (gridCols - 1))}% ${row * (100 / (gridRows - 1))}%`,
      opacity: isOwned ? 1 : 0.15,
      filter: isOwned ? 'none' : 'grayscale(100%) brightness(0.5)',
    };
  };

  return (
    <div 
      className={`card-puzzle ${!isComplete ? 'card--incomplete' : 'card--complete'} ${imageLoaded ? 'loaded' : ''}`}
      onClick={() => onCardClick(card, isComplete, fragments)}
    >
      {/* Фоновое изображение для предзагрузки */}
      {card.image_url && (
        <img 
          src={card.image_url} 
          alt="" 
          className="card-preload-image"
          onLoad={() => setImageLoaded(true)}
        />
      )}
      
      <div className="card-puzzle-inner">
        {/* Рамка редкости */}
        <div className="card-rarity-border" style={{ borderColor: getRarityColor(card.rarity) }}>
          <div className="rarity-label" style={{ backgroundColor: getRarityColor(card.rarity) }}>
            {card.rarity || 'Common'}
          </div>
        </div>

        {/* Сетка пазла */}
        <div className="puzzle-grid" style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`
        }}>
          {Array.from({ length: totalFragments }).map((_, idx) => {
            const isOwned = fragments?.some(f => f.number === idx + 1);
            return (
              <div
                key={idx}
                className={`puzzle-piece ${isOwned ? 'piece--owned' : 'piece--missing'}`}
                style={getFragmentStyle(idx)}
              >
                {!isOwned && <div className="piece-lock">🔒</div>}
                <div className="piece-number">{idx + 1}</div>
              </div>
            );
          })}
        </div>

        {/* Информация о карте */}
        <div className="card-puzzle-info">
          <h3 className="card-puzzle-name">{card.name || 'Без названия'}</h3>
          <div className="card-puzzle-vers">{card.vers || 'Unknown'}</div>
        </div>

        {/* Прогресс-бар */}
        <div className="progress-bar-mobile">
          <div className="progress-fill-mobile" style={{ width: `${progress}%` }} />
          <span className="progress-text-mobile">{ownedFragmentsCount}/{totalFragments}</span>
        </div>

        {/* Затемнение для неполных карт */}
        {!isComplete && (
          <div className="card-puzzle-overlay">
            <div className="overlay-content">
              <span className="overlay-percent">{Math.round(progress)}%</span>
              <span className="overlay-text">собрано</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Альтернативная версия с эффектом "проявления" при наведении
const CardItemReveal = ({ card, fragments, totalFragments = 20, onCardClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const ownedFragmentsCount = fragments?.length || 0;
  const progress = (ownedFragmentsCount / totalFragments) * 100;
  const isComplete = ownedFragmentsCount === totalFragments;
  
  // Фрагменты отображаются как случайные куски изображения
  const getRandomClipPath = (seed) => {
    const shapes = [
      'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
      'polygon(20% 0%, 80% 20%, 100% 80%, 0% 100%)',
      'polygon(30% 0%, 100% 30%, 70% 100%, 0% 70%)',
      'polygon(0% 30%, 60% 0%, 100% 70%, 40% 100%)',
    ];
    return shapes[seed % shapes.length];
  };

  return (
    <div 
      className={`card-reveal ${isComplete ? 'complete' : ''}`}
      onClick={() => onCardClick(card, isComplete, fragments)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
    >
      <div className="reveal-inner">
        {/* Базовое изображение (размытое/затемненное) */}
        {card.image_url && (
          <div 
            className="reveal-base-image"
            style={{
              backgroundImage: `url(${card.image_url})`,
              filter: isComplete ? 'none' : 'blur(8px) brightness(0.3)',
            }}
          />
        )}

        {/* Фрагменты поверх */}
        <div className="reveal-fragments">
          {Array.from({ length: totalFragments }).map((_, idx) => {
            const isOwned = fragments?.some(f => f.number === idx + 1);
            if (!isOwned) return null;
            
            return (
              <div
                key={idx}
                className="reveal-fragment"
                style={{
                  backgroundImage: `url(${card.image_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: `${(idx % 5) * 25}% ${Math.floor(idx / 5) * 25}%`,
                  clipPath: getRandomClipPath(idx),
                  opacity: isHovered || isComplete ? 1 : 0.7,
                  transition: `all 0.3s ease ${idx * 0.05}s`,
                }}
              />
            );
          })}
        </div>

        {/* Информация */}
        <div className="reveal-info">
          <h3>{card.name || 'Без названия'}</h3>
          <div className="reveal-rarity" style={{ color: getRarityColor(card.rarity) }}>
            {card.rarity}
          </div>
          <div className="reveal-progress">
            {ownedFragmentsCount}/{totalFragments} фрагментов
          </div>
        </div>
      </div>
    </div>
  );
};
// Новый компонент CardItem с наложением фрагментов
const CardItemLayered = ({ card, fragments, totalFragments = 20, onCardClick }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const ownedFragmentsCount = fragments?.length || 0;
  const progress = (ownedFragmentsCount / totalFragments) * 100;
  const isComplete = ownedFragmentsCount === totalFragments;
  
  // Сортируем фрагменты по номеру для правильного Z-index
  const sortedFragments = [...(fragments || [])].sort((a, b) => {
    const numA = typeof a === 'number' ? a : a.number;
    const numB = typeof b === 'number' ? b : b.number;
    return numA - numB;
  });

  return (
    <div 
      className={`card-layered ${isComplete ? 'card--complete' : 'card--incomplete'}`}
      onClick={() => onCardClick(card, isComplete, fragments)}
    >
      <div className="card-layered-inner">
        {/* Рамка редкости */}
        <div className="card-rarity-border" style={{ borderColor: getRarityColor(card.rarity) }}>
          <div className="rarity-label" style={{ backgroundColor: getRarityColor(card.rarity) }}>
            {card.rarity || 'Common'}
          </div>
        </div>

        {/* Контейнер для наложения фрагментов */}
        <div className="fragments-container">
          {/* Базовое изображение (полностью размытое/затемненное, если не собрано) */}
          {card.image_url && (
            <img 
              src={card.image_url}
              alt=""
              className="fragments-base-image"
              style={{
                filter: isComplete ? 'none' : 'blur(4px) brightness(0.4)',
                opacity: isComplete ? 1 : 0.5
              }}
              onLoad={() => setImageLoaded(true)}
            />
          )}

          {/* Наложение собранных фрагментов */}
          <div className="fragments-overlay">
            {sortedFragments.map((fragment, idx) => {
              const fragmentNum = typeof fragment === 'number' ? fragment : fragment.number;
              // URL фрагмента: /fragments/{card_id}/{fragment_num}.png
              const fragmentUrl = `/static/fragments/card_${card.id}/fragment_${fragmentNum}.png`;
              
              return (
                <img
                  key={fragmentNum}
                  src={fragmentUrl}
                  alt={`Fragment ${fragmentNum}`}
                  className="fragment-piece"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: idx, // Порядок наложения
                    opacity: 1,
                    pointerEvents: 'none'
                  }}
                  onError={(e) => {
                    // Если фрагмента нет, показываем плейсхолдер
                    e.target.style.display = 'none';
                  }}
                />
              );
            })}
          </div>

          {/* Прогресс-бар */}
          <div className="progress-bar-mobile">
            <div className="progress-fill-mobile" style={{ width: `${progress}%` }} />
            <span className="progress-text-mobile">{ownedFragmentsCount}/{totalFragments}</span>
          </div>

          {/* Затемнение для неполных карт */}
          {!isComplete && (
            <div className="card-layered-overlay">
              <div className="overlay-content">
                <span className="overlay-percent">{Math.round(progress)}%</span>
                <span className="overlay-text">собрано</span>
              </div>
            </div>
          )}
        </div>

        {/* Информация о карте */}
        <div className="card-layered-info">
          <h3 className="card-layered-name">{card.name || 'Без названия'}</h3>
          <div className="card-layered-vers">{card.vers || 'Unknown'}</div>
        </div>
      </div>
    </div>
  );
};
// Главный компонент коллекции (оптимизированный для мобильных)
const CardCollection = () => {
  const [cards, setCards] = useState([]);
  const [fragmentsData, setFragmentsData] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('reveal'); // 'puzzle' или 'reveal'
  const [selectedCard, setSelectedCard] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Определение мобильного устройства
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Загрузка всех карт
  const fetchAllCards = async () => {
    try {
      const response = await fetch('/api/v2/cards');
      if (!response.ok) throw new Error('Ошибка загрузки списка карт');
      const cardIds = await response.json();
      
    //   const cardsPromises = cardIds.map(async (id) => {
    //     const cardResponse = await fetch(`/api/v2/cards/${id}`);
    //     if (!cardResponse.ok) throw new Error(`Ошибка загрузки карты ${id}`);
    //     return cardResponse.json();
    //   });
      const resp = await fetch(`/api/v2/cards`,{headers: {
            'Authorization': `Bearer ${localStorage.getItem("token")}`,
            'Content-Type': 'application/json',
            "cards":cardIds
        }});
        const cardsData = await resp.json(); 
    //   const cardsData = await Promise.all(cardsPromises);
      setCards(cardsData);
    } catch (err) {
      setError(err.message);
    }
  };

  // Загрузка фрагментов пользователя
  const fetchUserFragments = async () => {
    try {
      const response = await fetch(`/api/v2/user/${localStorage.getItem("userId")}/inventory`);
      if (!response.ok) throw new Error('Ошибка загрузки коллекции');
      const data2 = await response.json();
      const data = await data2.inventory;
      const fragmentsMap = new Map();
      if (data.length > 0) {
        data.forEach(item => {
          if (item.type === 'fragments') {
            fragmentsMap.set(item.card_id, {
              fragments: item.fragments || [],
              quantity: item.quantity || 0
            });
          }
        });
      }
      setFragmentsData(fragmentsMap);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchAllCards();
      await fetchUserFragments();
      setLoading(false);
    };
    loadData();
  }, []);

  const handleCardClick = (card, isComplete, fragments) => {
    if (isComplete) {
      // В будущем здесь можно открыть полную карту
      setSelectedCard({ card, fragments });
    } else {
      setSelectedCard({ card, fragments });
    }
  };

  const totalFragments = 20;
  
  // Вычисляем статистику
  const completedCards = cards.filter(card => {
    const cardFrags = fragmentsData.get(card.id);
    return cardFrags && cardFrags.fragments.length === totalFragments;
  });

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Загрузка коллекции...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <span className="error-icon">⚠️</span>
        <p>Ошибка: {error}</p>
        <button onClick={() => window.location.reload()}>Повторить</button>
      </div>
    );
  }

  return (
    <div className={`card-collection ${isMobile ? 'mobile' : 'desktop'}`}>
      <header className="collection-header">
        <h1>Моя коллекция</h1>
        
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{cards.length}</span>
            <span className="stat-label">Всего карт</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{completedCards.length}</span>
            <span className="stat-label">Собрано</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {cards.length > 0 ? Math.round((completedCards.length / cards.length) * 100) : 0}%
            </span>
            <span className="stat-label">Прогресс</span>
          </div>
        </div>

        <div className="controls">
          
        </div>
      </header>

      {/* Сетка карт */}
      <div className="cards-grid-mobile">
        {cards.map((card) => {
          const cardFragments = fragmentsData.get(card.id);
          const fragments = cardFragments?.fragments || [];
          
          if (viewMode === 'puzzle') {
            return (
              <CardItemPuzzle
                key={card.id}
                card={card}
                fragments={fragments}
                totalFragments={totalFragments}
                onCardClick={handleCardClick}
              />
            );
          } else {
            return (
              <CardItemLayered
                key={card.id}
                card={card}
                fragments={fragments}
                totalFragments={totalFragments}
                onCardClick={handleCardClick}
              />
            );
          }
        })}
      </div>

      {/* Модальное окно с фрагментами */}
      {selectedCard && (
        <FragmentModal
            card={selectedCard.card}
            fragments={selectedCard.fragments}
            totalFragments={totalFragments}
            onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
};

export default CardCollection;