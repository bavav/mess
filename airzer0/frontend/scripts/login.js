
async function generateKeyPair() {
  const keyPair = nacl.sign.keyPair();
  
  const publicKey = nacl.util.encodeBase64(keyPair.publicKey);
  const privateKey = nacl.util.encodeBase64(keyPair.secretKey);
  
  // Сохраняем в localStorage сразу (на случай если пользователь 
  // закроет вкладку до сохранения файла)
  localStorage.setItem('private_key', privateKey);
  localStorage.setItem('public_key', publicKey);
  // Ждём подтверждения от пользователя
  const saved = await promptSavePrivateKey(privateKey);
  
  if (!saved) {
    // Пользователь отказался сохранять файл — подсвечиваем риск
    showNotification('Ключ сохранён только в браузере. При очистке cookies доступ будет потерян.',"warning");
  }
  
  return { publicKey, privateKey };
}
function promptSavePrivateKey(privateKey) {
  return new Promise((resolve) => {
    // Показываем модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
    <div class="keym">
      <div class="modal-content">
        <p id="copy-feedback" style="color: #4caf50; display: none; margin-top: 10px;">
          ✓ Ключ скопирован в буфер
        </p>
        <h3>Сохраните приватный ключ</h3>
        <p>Этот файл — единственный способ восстановить доступ 
           к вашим чатам при смене устройства или очистке браузера.</p>
        <p>Сохраните его в надёжном месте.</p>
        <div class="modal-buttons">
          <button id="save-key-btn" class="btn">Сохранить файл</button>
          <button id="copy-key-btn" class="btn">Скопировать в буфер</button>
          <button id="skip-save-btn" class="btn">Пропустить (рискованно)</button>
        </div>
      </div>
    </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('save-key-btn').onclick = () => {
      downloadPrivateKey(privateKey);
      modal.remove();
      resolve(true);
    };
    document.getElementById('copy-key-btn').onclick = async () => {
      try {
        await navigator.clipboard.writeText(privateKey);
        const feedback = document.getElementById('copy-feedback');
        feedback.style.display = 'block';
        // Не закрываем модалку — пользователь может ещё и скачать
        setTimeout(() => {
          feedback.style.display = 'none';
        }, 2000);
        document.getElementById('skip-save-btn').innerHTML = "Продолжить"
        document.getElementById('skip-save-btn').onclick = () => {
            modal.remove();
            resolve(true);
        };
      } catch (err) {
        showNotification('Не удалось скопировать. Попробуйте вручную.',"error");
      }
    };
    document.getElementById('skip-save-btn').onclick = () => {
      modal.remove();
      resolve(false);
    };
  });
}

function downloadPrivateKey(privateKey) {
  const blob = new Blob([privateKey], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Arizer_private.key`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function promptLoadPrivateKey() {
  return new Promise((resolve) => {
    // Создаём модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
    <div class="keym">
        <div class="modal-content">
            <h3>Загрузите приватный ключ</h3>
            <p>Без ключа вход невозможен.</p>
            
            <!-- Вкладки -->
            <div class="tabs">
                <button class="tab-btn active" data-tab="file">Файл</button>
                <button class="tab-btn" data-tab="manual">Ввод вручную</button>
            </div>
            
            <!-- Вкладка: файл -->
            <div id="file-tab" class="tab-content active">
                <div class="drop-zone" id="drop-zone">
                    <p>Перетащите файл .key сюда</p>
                    <p>или</p>
                    <button id="select-key-btn" class="btn">Выбрать файл</button>
                </div>
            </div>
            
            <!-- Вкладка: ручной ввод -->
            <div id="manual-tab" class="tab-content">
                <textarea id="private-key-input" 
                          placeholder="Вставьте приватный ключ в формате base64&#10;Пример: a1b2c3d4e5f6..." 
                          rows="4" 
                          style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd; font-family: monospace;"></textarea>
                <p style="font-size: 12px; color: #666; margin-top: 10px;">
                    Ключ должен быть в формате base64 (около 88 символов)
                </p>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="confirm-load-btn" class="btn btn-primary">Подтвердить</button>
                <button id="cancel-load-btn" class="btn">Отмена</button>
            </div>
        </div>
    </div>
    `;
    document.body.appendChild(modal);

    // Элементы
    const dropZone = document.getElementById('drop-zone');
    const selectBtn = document.getElementById('select-key-btn');
    const cancelBtn = document.getElementById('cancel-load-btn');
    const confirmBtn = document.getElementById('confirm-load-btn');
    const privateKeyInput = document.getElementById('private-key-input');
    
    // Получаем все вкладки
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Переменная для хранения выбранного ключа
    let selectedKey = null;
    let currentMethod = 'file'; // 'file' или 'manual'
    
    // Переключение вкладок
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Обновляем активные кнопки
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Показываем нужный контент
            tabContents.forEach(content => content.classList.remove('active'));
            if (tabId === 'file') {
                document.getElementById('file-tab').classList.add('active');
                currentMethod = 'file';
            } else {
                document.getElementById('manual-tab').classList.add('active');
                currentMethod = 'manual';
            }
            
            // Сбрасываем выбранный ключ
            selectedKey = null;
        });
    });
    
    // Функция валидации ключа
    function validateAndProcessKey(keyValue, source = 'file') {
        const trimmed = keyValue.trim();
        
        // Пустой ключ
        if (!trimmed) {
            showNotification('Ключ не может быть пустым', "error");
            return false;
        }
        
        try {
            // Валидация: должен быть валидный base64
            const decoded = atob(trimmed);
            
            // Приватный ключ Ed25519 — 64 байта в бинарном виде
            if (decoded.length !== 64) {
                showNotification(`Неверная длина ключа: ожидается 64 байта, получено ${decoded.length} байт`, "error");
                return false;
            }
            
            // Дополнительная проверка длины в base64 (около 88 символов для 64 байт)
            if (trimmed.length < 80 || trimmed.length > 100) {
                showNotification('Неверный формат: длина base64 строки должна быть около 88 символов', "error");
                return false;
            }
            
            selectedKey = trimmed;
            return true;
        } catch (e) {
            showNotification('Неверный формат ключа. Ожидается base64-строка приватного ключа.', "error");
            return false;
        }
    }
    
    // Флаг, чтобы резолвить только один раз
    let resolved = false;
    
    const resolvePromise = (value) => {
        if (resolved) return;
        resolved = true;
        modal.remove();
        resolve(value);
    };
    
    // Обработка файла
    const handleFile = async (file) => {
        if (resolved) return;
        
        if (!file.name.endsWith('.key')) {
            showNotification('Ожидается файл с расширением .key', "error");
            return;
        }
        
        try {
            const text = await file.text();
            if (validateAndProcessKey(text, 'file')) {
                showNotification('✅ Ключ успешно загружен!', "success");
                resolvePromise(selectedKey);
            }
        } catch (e) {
            showNotification('Ошибка чтения файла', "error");
        }
    };
    
    // Подтверждение (для ручного ввода)
    confirmBtn.onclick = () => {
        if (resolved) return;
        
        if (currentMethod === 'manual') {
            const keyValue = privateKeyInput.value;
            if (validateAndProcessKey(keyValue, 'manual')) {
                showNotification('✅ Ключ успешно загружен!', "success");
                resolvePromise(selectedKey);
            }
        } else if (currentMethod === 'file') {
            // Если на вкладке файла, показываем подсказку
            showNotification('Пожалуйста, выберите файл или перетащите его в область', "info");
        }
    };
    
    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        
        handleFile(files[0]);
    });
    
    // Клик для выбора файла
    selectBtn.onclick = () => {
        if (resolved) return;
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.key';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
        };
        
        input.click();
    };
    
    // Отмена
    cancelBtn.onclick = () => {
        if (resolved) return;
        resolvePromise(null);
    };
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            resolvePromise(null);
        }
    });
    
    // Добавляем возможность вставить ключ из буфера обмена по Ctrl+V
    privateKeyInput.addEventListener('paste', (e) => {
        setTimeout(() => {
            // Опционально: автоматическая валидация при вставке
            const value = privateKeyInput.value;
            if (value && value.trim().length > 0) {
                // Не валидируем автоматически, ждём кнопку Confirm
            }
        }, 100);
    });
    
    // Фокус на поле ввода при переключении на ручной режим
    const observer = new MutationObserver(() => {
        if (currentMethod === 'manual' && document.activeElement !== privateKeyInput) {
            privateKeyInput.focus();
        }
    });
    observer.observe(modal, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
}
// Функция показа уведомлений
function showNotification(message, type = 'info', duration = 3000) {
    // Удаляем существующие уведомления
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    // Создаём новое уведомление
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Автоматическое скрытие
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, duration);
}
async function login(login, pasw) {
    try {
        
        let privateKey = localStorage.getItem("private_key");
        
        // Если ключа нет локально — требуем загрузить файл
        if (!privateKey || privateKey == 'null') {
            privateKey = await promptLoadPrivateKey();
            
            // Пользователь отказался — вход невозможен
            if (!privateKey) {
                showNotification('Вход невозможен без приватного ключа',"error");
            }
            
            // Сохраняем на будущее
            localStorage.setItem("private_key", privateKey);
        }
        
        // Извлекаем публичный ключ из приватного
        // В TweetNaCl секретный ключ — 64 байта: [seed(32) | public(32)]
        const secretKeyBytes = nacl.util.decodeBase64(privateKey);
        const keyPair = nacl.sign.keyPair.fromSecretKey(secretKeyBytes);
        const publicKey = nacl.util.encodeBase64(keyPair.publicKey);
        
        const response = await fetch('/api/v1/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                login,
                password: pasw,
                public_key: publicKey
            }),
        });
        
        if (!response.ok) {
            showNotification(`Login failed: ${response.status}`,"error");
        }
        
        const result = await response.json();
        return result; // Return the entire response object
    } catch (error) {
        console.error('Ошибка входа:', error);
        throw error;
    }
}

async function reg(login, pasw) {
    try {
        const { publicKey, privateKey } = await generateKeyPair()
        const response = await fetch('/api/v1/users/reg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ login: login, password: pasw, public_key:publicKey}),
        });
        
        
        
        const result = await response.json();
        return result; // Return the entire response object
    } catch (error) {
        console.error('Ошибка входа:', error);
        
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.querySelector('#confirm');
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            // Get current values when button is clicked
            const loginInput = document.querySelector("#logini");
            const passwordInput = document.querySelector("#passwi");
            
            const logint = loginInput.value;
            const passwt = passwordInput.value;
            
            try {
                const result = await login(logint, passwt);
                
                // Assuming your API returns something like:
                // { token: "...", id: 123 } or { token: "...", userId: 123 }
                if (result.token) {
                    setToken(result.token);
                }
                if (result.id || result.userId) {
                    setUserId(result.id || result.userId);
                }
                if (result.error) {
                  showNotification(result.error,"error");
                  if (result.error == "KeyNotCorrect") {
                    localStorage.setItem("public_key","null");
                    localStorage.setItem("private_key","null");
                  }
                } else {
                  window.location.href = "/index.html";
                }
                
            } catch (error) {
                console.error('Login process failed:', error);
                // Show error message to user here
                showNotification(`Login failed. ${error}`,"error");
            }
        });
    }
    const regBtn = document.querySelector('#confirmreg');
    if (regBtn) {
        regBtn.addEventListener('click', async () => {
            // Get current values when button is clicked
            const loginInput = document.querySelector("#logini");
            const passwordInput = document.querySelector("#passwi");
            
            const logint = loginInput.value;
            const passwt = passwordInput.value;
            
            try {
                const result = await reg(logint, passwt);
                
                // Assuming your API returns something like:
                // { token: "...", id: 123 } or { token: "...", userId: 123 }
                if (result.token) {
                    setToken(result.token);
                } else {
                  showNotification(result.error,"error");
                }
                if (result.id || result.userId) {
                    setUserId(result.id || result.userId);
                }
                if (result.error) {
                  showNotification(result.error,"error");
                  if (result.error == "KeyNotCorrect") {
                    localStorage.setItem("public_key","null");
                    localStorage.setItem("private_key","null");
                  }
                } else {
                  window.location.href = "/index.html";
                }
                
            } catch (error) {
                console.error('Login process failed:', error);
              if (result.error) {
                showNotification(result.error,"error");
                
              }
                
            }
        });
    }
});

function setToken(tk) {
    localStorage.setItem('token', tk);
}

function setUserId(id) {
    localStorage.setItem('userId', id);
}