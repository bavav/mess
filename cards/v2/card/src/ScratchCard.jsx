import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ScratchCard.css';
import { useConfirm } from './ConfirmDialog';

const ScratchCard = ({fetcReses,onComplete, onProgress }) => {
  const scratchCanvasRef = useRef(null);
  const [isScratching, setIsScratching] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageUrl,setImageUrl] = useState(null)
  const { confirm, Dialog } = useConfirm();
  const brushSize = 30;
  const ctxRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [cardStats,setCardStats] = useState({})
  // Инициализация canvas для стирания
  useEffect(() => {
    if (!isActive || !scratchCanvasRef.current) return;
    
    const canvas = scratchCanvasRef.current;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;
    
    drawScratchLayer();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive]);

  const drawScratchLayer = () => {
    const canvas = scratchCanvasRef.current;
    const ctx = ctxRef.current;
    
    if (!ctx || !canvas) return;
    
    // Рисуем серый слой
    ctx.fillStyle = '#9E9E9E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Добавляем текстуру
    ctx.fillStyle = '#888888';
    for(let i = 0; i < 300; i++) {
      ctx.fillRect(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        2, 2
      );
    }
    
    // Добавляем надпись
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👆 Сотрите', canvas.width/2, canvas.height/2);
    ctx.font = '14px Arial';
    ctx.fillText('чтобы увидеть картинку', canvas.width/2, canvas.height/2 + 30);
  };

  const getCoordinates = useCallback((e) => {
    const canvas = scratchCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;
    
    x = Math.max(0, Math.min(canvas.width, x));
    y = Math.max(0, Math.min(canvas.height, y));
    
    return { x, y };
  }, []);

  const scratch = useCallback((x, y) => {
    const ctx = ctxRef.current;
    
    if (!ctx || isRevealed) return;
    
    // Стираем на верхнем canvas
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Проверяем прогресс
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      checkProgress();
    });
  }, [isRevealed]);

  const checkProgress = useCallback(() => {
    const canvas = scratchCanvasRef.current;
    const ctx = ctxRef.current;
    
    if (!ctx || !canvas) return;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparentPixels = 0;
    const totalPixels = canvas.width * canvas.height;
    
    // Считаем прозрачные пиксели (стертые места)
    for(let i = 3; i < imageData.data.length; i += 4) {
      if(imageData.data[i] < 128) transparentPixels++;
    }
    
    const currentProgress = transparentPixels / totalPixels;
    const progressPercent = Math.min(100, Math.floor(currentProgress * 100));
    setProgress(progressPercent);
    
    if (onProgress) {
      onProgress(currentProgress);
    }
    
    if (currentProgress > 0.7 && !isRevealed) {
      setIsRevealed(true);
      if (onComplete) {
        onComplete();
      }
    }
  }, [isRevealed, onComplete, onProgress]);

  const handleStart = useCallback((e) => {
    if (!isActive || isRevealed) return;
    e.preventDefault();
    setIsScratching(true);
    const pos = getCoordinates(e);
    scratch(pos.x, pos.y);
  }, [isActive, isRevealed, getCoordinates, scratch]);

  const handleMove = useCallback((e) => {
    if (!isScratching || !isActive || isRevealed) return;
    e.preventDefault();
    const pos = getCoordinates(e);
    scratch(pos.x, pos.y);
  }, [isScratching, isActive, isRevealed, getCoordinates, scratch]);

  const handleEnd = useCallback(() => {
    setIsScratching(false);
  }, []);

  const startScratching = async () => {
    const confirmed = await confirm('Вы уверены, что хотите купить крутку?', 'Подтверждение');
    console.log(confirmed);
    if (confirmed) {
        const res = await fetch("/api/v2/rollcard",{headers: {
            'Authorization': `Bearer ${localStorage.getItem("token")}`
        }})
        const resp = await res.json()
        if (resp.complited) {
            setImageUrl(resp.card)
            fetcReses()
            setCardStats({"id":resp.card_id,"frg_id":resp.frg_id,"name":resp.name})
            setIsActive(true)
        }
      
    }
    
  };

  const resetCard = async () => {
    const confirmed = await confirm('Вы уверены, что хотите купить крутку?', 'Подтверждение');
    console.log(confirmed);
    if (!confirmed) return;
    const res = await fetch("/api/v2/rollcard",{headers: {
        'Authorization': `Bearer ${localStorage.getItem("token")}`
    }})
    const resp = await res.json()
    if (resp.complited) {
        setImageUrl(resp.card)
        fetcReses()
        setCardStats({"id":resp.card_id,"frg_id":resp.frg_id,"name":resp.name})
        setIsActive(true)
    } else {
        return
    }
    const canvas = scratchCanvasRef.current;
    if (!canvas) return;
    
    setIsRevealed(false);
    setProgress(0);
    setIsScratching(false);
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    
    drawScratchLayer();
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  // Добавляем обработчики событий
  useEffect(() => {
    const canvas = scratchCanvasRef.current;
    if (!canvas || !isActive) return;
    
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd);
    canvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    
    return () => {
      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      canvas.removeEventListener('touchend', handleEnd);
      canvas.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isActive, handleStart, handleMove, handleEnd]);

  return (
    <div className="scratch-card-container">
      <Dialog />
      {!isActive ? (
        <div className="scratch-start-screen">
          <div className="scratch-preview">
            <h3>🎴 Карточка</h3>
            <p>Нажмите кнопку, чтобы купить 1 карточку</p>
            <p style={{color: "red"}}>-50 Энергии</p>
            <button onClick={startScratching} className="scratch-start-btn">
              🎨 Начать
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="scratch-header">
            <div className="progress-info">
              <div className="progress-label">
                <span>Прогресс стирания</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {isRevealed && (
              <div className="success-badge">
                🎉 Открыто! 🎉
              </div>
            )}
          </div>
          
          <div className="canvas-wrapper">
            {/* Нижний canvas с изображением */}
            <div className="image-container">
              {imageUrl && (
                <img 
                  src={imageUrl} 
                  alt="Card content"
                  className="card-image"
                  onLoad={() => setImageLoaded(true)}
                />
              )}
            </div>
            
            {/* Верхний canvas для стирания */}
            <canvas
              ref={scratchCanvasRef}
              width={400}
              height={300}
              className={`scratch-canvas ${isRevealed ? 'revealed' : ''}`}
            />
            
            {!isRevealed && (
              <div className="scratch-hint">
                👆 Стирайте пальцем или мышкой
              </div>
            )}
          </div>
          
          <div className="scratch-actions">
            <div>Вы получили {cardStats.frg_id} фрагмент карты {cardStats.name}({cardStats.id})</div>
            <button onClick={resetCard} className="reset-btn">
              🔄 Еще
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ScratchCard;