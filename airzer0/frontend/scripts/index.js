let isLoadingMessages = false;
let currentPage = 1;
let hasMoreMessages = true;
let currentChatId = null;
// Хранилище метаданных файлов (в памяти + localStorage)
let fileMetadataCache = {};
let currentAttachments = [];
// В начало index.js добавить
let profileState = {
    type: 'self',      // 'self' | 'chat' | 'user'
    data: null         // объект с данными чата или пользователя
};
function loadFileMetadataCache() {
    try {
        fileMetadataCache = JSON.parse(localStorage.getItem('file_metadata') || '{}');
    } catch {
        fileMetadataCache = {};
    }
}

function saveFileMetadata(blobHash, metadata) {
    fileMetadataCache[blobHash] = metadata;
    try {
        localStorage.setItem('file_metadata', JSON.stringify(fileMetadataCache));
    } catch (e) {
        console.error('Failed to save file metadata:', e);
    }
}

async function getFileMetadata(blobHash) {
    if (!fileMetadataCache[blobHash]) {
        const result = await decryptBlob(blobHash);
        saveFileMetadata(blobHash,result.metadata)
    };
    
    return fileMetadataCache[blobHash] || null;
}

// Загружаем кеш при старте
loadFileMetadataCache();

// Форматирование размера файла
function formatSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

async function getChats(usr_id) {
    try {
        const response = await fetch('/api/v1/users/'+usr_id+'/chats?user_id='+getUserId(), {
            method: 'GET',
            headers: {

                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}
// Генерация ссылки-приглашения (с хешем и id чата)
function generateInviteLink(chatId) {
    return `${window.location.origin}/?join=${chatId}`;
}

// Получение параметров приглашения из URL
function getInviteParams() {
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('join');
  
    if (chatId) {
        return parseInt(chatId);
    }
    return null;
}


// Основная функция обработки
async function handleInvite() {
    const chatId = getInviteParams();  // Исправлено: вызываем getInviteParams()
    if (!chatId) return;
    
    if (!getUserId()) {
        localStorage.setItem('pendingChatJoin', chatId);
        window.location.href = '/login.html';
        return;
    }
    
    try {
        // Получаем информацию о чате (нужно добавить этот эндпоинт или передавать название)
        let chatName = `Чат ${chatId}`;
        
        // Уже в чате?
        const myChats = await getChats(getUserId());
        if (myChats.some(c => c.id == chatId)) {
            setChatId(chatId);
            await reloadChat(chatId);
            cleanInviteURL();
            return;
        }
        
        // Запрашиваем ключ
        const chatKeyBase64 = await promptChatKey(chatName);
        if (!chatKeyBase64) return;
        
        // Считаем хеш
        const computedHash = await sha256(chatKeyBase64);
        
        // Получаем свои ключи (для симметричного шифрования secretbox)
        const keyPair = getBoxKeys();
        
        // 🔑 Шифруем ключ чата для хранения на сервере (СИММЕТРИЧНО, как в createChat)
        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const chatKeyBytes = nacl.util.decodeBase64(chatKeyBase64);
        
        // ✅ ИСПРАВЛЕНО: Используем secretbox (симметричное шифрование)
        const encrypted = nacl.secretbox(
            chatKeyBytes,
            nonce,
            keyPair.secretKey   // Свой секретный ключ
        );
        
        // ✅ Объединяем nonce и encrypted для отправки на сервер
        const combined = new Uint8Array(nonce.length + encrypted.length);
        combined.set(nonce, 0);
        combined.set(encrypted, nonce.length);
        const codedKeyWithNonce = nacl.util.encodeBase64(combined);
        
        // Отправляем на сервер
        const joinRes = await fetch(`/api/v1/chats/${chatId}/accept-invite`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key_hash: computedHash,
                coded_key: codedKeyWithNonce  // ✅ Отправляем combined формат
            })
        });
        
        if (!joinRes.ok) {
            const err = await joinRes.json();
            showNotification(err.error || 'Неверный ключ', 'error');
            return;
        }
        
        // Сохраняем ключ локально
        saveChatKey(chatId, chatKeyBase64);
        setChatId(chatId);
        await reloadChat(chatId);
        await refreshChatsList();
        cleanInviteURL();
        showNotification(`✅ Вы в чате`, 'success');
        
    } catch (error) {
        console.error('Invite error:', error);
        showNotification('Ошибка приглашения', 'error');
    }
}
// Очистка URL от параметров приглашения
function cleanInviteURL() {
    const url = new URL(window.location.href);
    url.searchParams.delete('join');  // Исправлено: удаляем 'join', а не 'chatid'
    window.history.replaceState({}, '', url);
}
async function getChatMess(chat_id, usr_id = 0, page = 1, per_page = 50) {
    try {
        const response = await fetch(`/api/v1/chats/${chat_id}/messages?user_id=${getUserId()}&page=${page}&per_page=${per_page}`, {
            method: 'GET',
            headers: {                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}
async function loadOlderMessages(chatId) {
    if (isLoadingMessages || !hasMoreMessages) return;
    
    isLoadingMessages = true;
    const nextPage = currentPage + 1;
    
    try {
        const messages = await getChatMess(chatId, getUserId(), nextPage, 50);
        
        if (messages && messages.length > 0) {
            currentPage = nextPage;
            
            // Сохраняем позицию скролла
            const container = document.querySelector('#mss_block_id');
            const oldScrollHeight = container.scrollHeight;
            const oldScrollTop = container.scrollTop;
            
            // Добавляем старые сообщения в начало контейнера
            for (let i = messages.length - 1; i >= 0; i--) {
                const messageHtml = await renderMessage(messages[i]);
                container.insertAdjacentHTML('afterbegin', messageHtml);
            }
            
            // Восстанавливаем позицию скролла
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        } else {
            hasMoreMessages = false;
        }
    } catch (error) {
        console.error('Failed to load older messages:', error);
        showNotification('Ошибка загрузки старых сообщений', 'error');
    } finally {
        isLoadingMessages = false;
    }
}
function saveChatKeyToLocal(chatId, chatKeyBase64) {
  let chatKeys = {};
  
  try {
    chatKeys = JSON.parse(localStorage.getItem('chat_keys') || '{}');
  } catch (e) {
    chatKeys = {};
  }
  
  chatKeys[chatId] = chatKeyBase64;
  localStorage.setItem('chat_keys', JSON.stringify(chatKeys));
}


async function AddChat() {
    try {
        const chats = await getChats(getUserId());
        const fragment = document.createDocumentFragment();
        
        // Находим контейнер для чатов ОДИН РАЗ
        const chatsContainer = document.querySelector('#chats');
        
        // Очищаем существующие чаты (опционально, если не хотим дублировать)
        chatsContainer.innerHTML = '';
        const div = document.createElement('div');
        div.innerHTML = `
            <button id="chat_link" style="width: 100%; background: none; border: none; padding: 0;">
                <div class="chat">
                    
                    <div class="chat-info">
                        <div>
                            <p id="name">Скопировать ссылку приглашение в чат</p>
                        </div>
                    </div>
                </div>
            </button>
        `;
        const btn = div.querySelector(`#chat_link`);
        if (btn) {
            btn.addEventListener('click', async () => {
                const link = generateInviteLink(getChatId());
                
                // Создаем элементы
                const overlay = document.createElement('div');
                const modal = document.createElement('div');
                
                // Стили для фона (затемнение)
                Object.assign(overlay.style, {
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                });

                // Стили для окошка
                Object.assign(modal.style, {
                    backgroundColor: '#fff', padding: '20px', borderRadius: '8px',
                    position: 'relative', minWidth: '300px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                });
                const ioio = await getChatKey(getChatId())
                modal.innerHTML = `
                    <span id="close-modal" style="position:absolute; right:10px; top:5px; cursor:pointer; font-size:20px;">&times;</span>
                    <p style="margin-bottom:15px; font-family: sans-serif;">Скопируйте ссылку вручную:</p>
                    <input type="text" value="${link}" readonly style="width:100%; padding:8px; box-sizing:border-box;">
                    <p style="margin-bottom:15px; font-family: sans-serif;">Ключ</p>
                    <details>
                    <summary>Нажми, чтобы увидеть</summary>
                    <input type="text" value="${ioio}" readonly style="width:100%; padding:8px; box-sizing:border-box;">
                    </details>
                    
                    <p style="margin-bottom:15px; font-family: sans-serif;">Или можете его скачать</p>
                    <button id="save-key-btn" class="btn">Сохранить файл</button>
                `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                
                
                // Логика закрытия
                const close = () => document.body.removeChild(overlay);
                modal.querySelector('#close-modal').onclick = close;
                document.getElementById('save-key-btn').onclick = async () => {
                    const key = await getChatKey(getChatId())
                    const blob = new Blob([key], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Arizer_chat_private.key`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    document.body.removeChild(overlay)
                };
                overlay.onclick = (e) => { if(e.target === overlay) close(); };
                
                // Авто-фокус на текст, чтобы пользователю было проще копировать
                modal.querySelector('input').select();
            });
        }
        const div2 = document.createElement('div');
        div2.innerHTML += `
            <button id="chat_add" style="width: 100%; background: none; border: none; padding: 0;">
                <div class="chat">
                    
                    <div class="chat-info">
                        <div>
                            <p id="name">Создать чат</p>
                        </div>
                    </div>
                </div>
            </button>
        `;
        
        // Attach event ONLY to this button
        const btn2 = div2.querySelector(`#chat_add`);
        if (btn2) {
            btn2.addEventListener('click', () => {
                
                
            });
        }
        
        fragment.appendChild(div2);
        fragment.appendChild(div);
        chats.forEach(chat => {
            const div = document.createElement('div');
            div.innerHTML = `
                <button id="chat_${chat.id}" style="width: 100%; background: none; border: none; padding: 0;">
                    <div class="chat">
                        <img src=${chat.avatar_url} class="chat_icon">
                        <div class="chat-info">
                            <div>
                                <p id="name">${escapeHtml(chat.name || 'Unnamed Chat')}</p>
                                <p id="desk">${escapeHtml(chat.desk || 'No description')}</p>
                            </div>
                        </div>
                    </div>
                </button>
            `;
            
            // Attach event ONLY to this button
            const btn = div.querySelector(`#chat_${chat.id}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    setChatId(chat.id)
                    reloadChat(chat.id)
                });
            }
            
            fragment.appendChild(div);
        });
        
        // ВАЖНО: добавляем в #chats, а не в document.body
        chatsContainer.appendChild(fragment);
        
    } catch (error) {
        console.error('Failed to load chats:', error);
        const errorDiv = document.createElement('div');
        errorDiv.textContent = 'Failed to load chats. Please try again later.';
        errorDiv.style.color = 'red';
        document.querySelector('#chats').appendChild(errorDiv);
    }
    const creatBtn = document.querySelector('#chat_add');
    if (creatBtn) {
        creatBtn.addEventListener('click', () => openChatModal());
    }
}
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}



// Helper function to prevent XSS attacks
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function addScrollLoader() {
    const container = document.querySelector('#mss_block_id');
    if (!container) return;
    
    // Удаляем старый индикатор, если есть
    const oldLoader = document.querySelector('#scroll-loader');
    if (oldLoader) oldLoader.remove();
    
    const loader = document.createElement('div');
    loader.id = 'scroll-loader';
    loader.style.cssText = `
        text-align: center;
        padding: 10px;
        color: #888;
        font-size: 12px;
        display: none;
    `;
    loader.innerHTML = '⏳ Загрузка старых сообщений...';
    container.insertBefore(loader, container.firstChild);
}
function showLoader(show) {
    const loader = document.querySelector('#scroll-loader');
    if (loader) {
        loader.style.display = show ? 'block' : 'none';
    }
}
async function reloadChat(id) {
    try {
        // Сброс пагинации при загрузке нового чата
        if (currentChatId !== id) {
            currentPage = 1;
            hasMoreMessages = true;
            currentChatId = id;
        }
        
        const messages = await getChatMess(id, getUserId(), 1, 50);
        console.log(messages);
        
        if (!Array.isArray(messages)) {
            console.error('Expected array but got:', typeof messages, messages);
            return;
        }
        
        const chatsContainer = document.querySelector('#mss_block_id');
        if (!chatsContainer) {
            console.error('Container #mss_block_id not found');
            return;
        }
        
        chatsContainer.innerHTML = '';
        
        for (const msg of messages) {
            const messageHtml = await renderMessage(msg);
            chatsContainer.innerHTML += messageHtml;
        }
        
        // Добавляем индикатор загрузки в начало контейнера
        addScrollLoader();
        await showChatProfile(id);
        // Прокручиваем вниз только при первой загрузке
        if (currentPage === 1) {
            chatsContainer.scrollTop = chatsContainer.scrollHeight;
        }
        
    } catch (error) {
        console.error('Failed to reload chat:', error);
    }
}
// Функция запроса ключа у пользователя
function promptChatKey(chatName) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;
        modal.innerHTML = `
            <div style="background: #1a1a1a; border-radius: 12px; padding: 25px;
                        max-width: 450px; width: 90%; color: #e0e0e0;">
                <h3>🔐 Введите ключ чата</h3>
                <p>Для входа в чат <b>${escapeHtml(chatName)}</b> нужен ключ.</p>
                <p>Попросите создателя чата прислать вам ключ.</p>
                
                <div style="margin: 15px 0;">
                    <label style="display: block; margin-bottom: 5px;">Вставьте ключ:</label>
                    <input id="chat-key-input" type="text" placeholder="Base64 строка..."
                           style="width: 100%; padding: 10px; background: #2a2a2a;
                                  border: 1px solid #444; border-radius: 6px; color: #fff;
                                  font-family: monospace; box-sizing: border-box;">
                </div>
                
                <div style="text-align: center; margin: 10px 0; color: #888;">— или —</div>
                
                <div id="drop-zone" style="border: 2px dashed #666; border-radius: 8px;
                            padding: 25px; text-align: center; cursor: pointer; margin: 10px 0;">
                    <p style="margin: 5px 0;">📁 Перетащите файл ключа сюда</p>
                    <p style="margin: 5px 0; font-size: 12px; color: #888;">или кликните для выбора</p>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button id="confirm-key-btn" style="flex: 1; padding: 10px;
                            background: #4CAF50; border: none; border-radius: 6px;
                            color: white; cursor: pointer;">✅ Принять</button>
                    <button id="cancel-key-btn" style="flex: 1; padding: 10px;
                            background: #666; border: none; border-radius: 6px;
                            color: white; cursor: pointer;">❌ Отмена</button>
                </div>
                <p id="key-error" style="color: #f44336; display: none; margin-top: 10px;"></p>
            </div>
        `;
        document.body.appendChild(modal);

        const dropZone = modal.querySelector('#drop-zone');
        const input = modal.querySelector('#chat-key-input');
        const errorEl = modal.querySelector('#key-error');
        let resolved = false;

        const handleFile = async (file) => {
            try {
                const text = await file.text();
                const trimmed = text.trim();
                // Валидация base64
                atob(trimmed);
                input.value = trimmed;
            } catch {
                showKeyError('Неверный формат файла');
            }
        };

        const showKeyError = (msg) => {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        };

        // Drag & Drop
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#4caf50'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#666'; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#666';
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });

        // Клик для выбора файла
        dropZone.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) handleFile(file);
            };
            fileInput.click();
        });

        // Кнопка Принять
        modal.querySelector('#confirm-key-btn').onclick = () => {
            if (resolved) return;
            const key = input.value.trim();
            if (!key) {
                showKeyError('Вставьте ключ или загрузите файл');
                return;
            }
            // Простая валидация base64
            try {
                atob(key);
            } catch {
                showKeyError('Неверный формат ключа. Ожидается Base64.');
                return;
            }
            resolved = true;
            modal.remove();
            resolve(key);
        };

        // Кнопка Отмена
        modal.querySelector('#cancel-key-btn').onclick = () => {
            if (resolved) return;
            resolved = true;
            modal.remove();
            resolve(null);
        };
    });
}
// Security helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function senMsg(data) {
    if (getChatId()) {
        return fetch('/api/v1/chats/'+getChatId()+'/messages?user_id='+getUserId(), { // <-- Ключевое слово RETURN
            method: 'POST',
            headers: {

                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
        })
        .then(response => response.json())
        .catch(error => {
            console.error('Ошибка:', error);
            throw error; // Или return { error: true }, смотря что нужно
        });
    }
}

async function login(login, pasw) {
    try {
        const response = await fetch('/api/v1/users/login', {
            method: 'POST',
            headers: {

                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ login: login, password: pasw }),
        });
        
        if (!response.ok) {
            throw new Error(`Login failed: ${response.status}`);
        }
        
        const result = await response.json();
        return result.token; // Предполагаем, что сервер возвращает { token: "..." }
    } catch (error) {
        console.error('Ошибка входа:', error);
        throw error;
    }
}

// Добавьте эту функцию в ваш index.js
async function joinChat(chatId, userId) {
    try {
        const response = await fetch(`/api/v1/chats/${chatId}/join`, {
            method: 'POST',
            headers: {

                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Error joining chat:', error);
        throw error;
    }
}

// Функция для получения чата по ID (если нужно)
async function getChatById(chatId) {
    try {
        const response = await fetch(`/api/v1/chats/${chatId}`, {
            method: 'GET',
            headers: {

                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Error getting chat:', error);
        throw error;
    }
}
// Функция для извлечения chat_id из URL
function getChatIdFromURL() {
    // Поддерживаем разные форматы:
    // /join/123
    // ?join=123
    // #join-123
    
    const path = window.location.pathname;
    const hash = window.location.hash;
    const search = window.location.search;
    
    
    console.log("wrk")
    // Вариант 2: ?join=123
    const urlParams = new URLSearchParams(search);
    if (urlParams.has('join')) {
        console.log("wrk")
        return parseInt(urlParams.get('join'));
    }
    
    
    
    return null;
}

// Основная функция обработки приглашения

// Обновление списка чатов
async function refreshChatsList() {
    const chatsContainer = document.querySelector('#chats');
    if (chatsContainer) {
        // Очищаем контейнер
        chatsContainer.innerHTML = '';
        // Перезагружаем чаты
        await AddChat();
    }
}

// Прокрутка к нужному чату
function scrollToChat(chatId) {
    const chatButton = document.querySelector(`#chat_${chatId}`);
    if (chatButton) {
        chatButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Добавляем подсветку
        chatButton.classList.add('highlight-chat');
        setTimeout(() => {
            chatButton.classList.remove('highlight-chat');
        }, 2000);
    }
}

// Очистка URL от параметров приглашения


// Вспомогательные функции для уведомлений
function showNotification(message, type = 'info',color) {
    // Проверяем, есть ли уже контейнер для уведомлений
    let container = document.querySelector('#notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
        document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        background: ${color};
        color: white;
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 5px;
        animation: slideIn 0.3s ease-out;
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showLoadingNotification(message) {
    showNotification(message, 'info');
}

// Модифицируем DOMContentLoaded

// Функция для генерации ссылки-приглашения


// Кнопка "Поделиться" в чате

async function sendMessage() {
    const field = document.querySelector("#inputsm");
    const txt = field.value;
    
    if (!txt.trim() && currentAttachments.length === 0) return;
    
    field.value = "";
    
    try {
        const chatKey = nacl.util.decodeBase64(await getChatKey(getChatId()));
        const chatKeyBase64 = nacl.util.encodeBase64(chatKey);
        
        // Формируем структуру сообщения
        const messageObj = {
            type: "message",
            version: 1,
            text: txt.trim() || null,
            attachments: currentAttachments.length > 0 ? currentAttachments : null
        };
        
        // Шифруем всю структуру
        const messageJson = JSON.stringify(messageObj);
        const encrypted = await encryptMessage(chatKeyBase64, messageJson);
        
        const data = {
            user_id: getUserId(),
            content: encrypted.encrypted,
            nonce: encrypted.nonce
        };
        
        // Очищаем вложения
        currentAttachments = [];
        const modal = document.querySelector('#filePreviewModal');
        if (modal) modal.style.display = 'none';
        
        await senMsg(data);
        
    } catch (error) {
        console.error('Send message error:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}
// Вызываем функцию после загрузки DOM
// index.js — заменить reloadMyProfile и добавить новые функции

async function reloadMyProfile() {
    profileState = { type: 'self', data: null };
    await renderProfilePanel();
}
async function reloadProfile() {
    
    await renderProfilePanel();
}

async function showChatProfile(chatId) {
    try {
        // Получаем список чатов и находим нужный
        const chats = await getChats(getUserId());
        const chat = chats.find(c => c.id == chatId);
        
        if (!chat) {
            showNotification('Чат не найден', 'error');
            return;
        }
        
        profileState = {
            type: 'chat',
            data: {
                id: chat.id,
                name: chat.name,
                desk: chat.desk,
                avatar_url: chat.avatar_url,
                participants_count: chat.participants_count,
                creator: chat.creator
            }
        };
        
        await renderProfilePanel();
    } catch (error) {
        console.error('Show chat profile error:', error);
    }
}

async function showUserProfile(userId) {
    try {
        const response = await fetch(`/api/v1/users/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            showNotification('Пользователь не найден', 'error');
            return;
        }
        
        const user = await response.json();
        
        profileState = {
            type: 'user',
            data: {
                id: user.id,
                name: user.name,
                desk: user.desk,
                avatar_url: user.avatar_url,
                status: user.status,
                lifetime: user.lifetime
            }
        };
        
        await renderProfilePanel();
    } catch (error) {
        console.error('Show user profile error:', error);
    }
}

async function renderProfilePanel() {
    const infoDiv = document.querySelector('#info');
    const avaDiv = document.querySelector('#self_ava');
    const nameDiv = document.querySelector('#namep');
    
    if (!avaDiv || !nameDiv) return;
    
    let avatarHtml = '';
    let profileHtml = '';
    let closeButtonHtml = '';
    
    // Кнопка закрытия (только если не "self")
    if (profileState.type !== 'self') {
        closeButtonHtml = `
            <div id="profile-close-btn" style="
                position: absolute;
                top: 5px;
                right: 5px;
                width: 24px;
                height: 24px;
                background: rgba(255, 0, 0, 0.43);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: white;
                font-size: 16px;
                z-index: 10;
            ">✕</div>
        `;
    }
    
    switch (profileState.type) {
        case 'self':
            // Мой профиль (существующий код)
            try {
                const response = await fetch('/api/v1/users/' + getUserId(), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const user = await response.json();
                    
                    avatarHtml = `
                        <button id="self_profile_avatar" style="
                            background: none;
                            border: none;
                            padding: 0;
                            cursor: pointer;
                            position: relative;
                        ">
                            <img src="${user.avatar_url}" class="profile_avatar" style="
                                width: 48px;
                                height: 48px;
                                border-radius: 50%;
                                object-fit: cover;
                                border: 2px solid #00eeff;
                            ">
                           
                        </button>
                    `;
                    
                    profileHtml = `
                        <p id="profile_name" style="
                            margin: 0;
                            font-weight: bold;
                            color: white;
                            font-size: 14px;
                        ">${escapeHtml(user.name)}</p>
                        <p id="profile_status" style="
                            margin: 2px 0 0 0;
                            color: #888;
                            font-size: 11px;
                        ">${escapeHtml(user.status || 'В сети')}</p>
                    `;
                }
            } catch (error) {
                console.error('Failed to load self profile:', error);
            }
            break;
            
        case 'chat':
            // Профиль чата
            const chat2 = profileState.data;
            try {
                const response = await fetch('/api/v1/chats/' + chat2.id, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const chat = await response.json();
            
                    avatarHtml = `
                        
                        <button id="chat_profile_avatar" style="
                            background: none;
                            border: none;
                            padding: 0;
                            cursor: pointer;
                            position: relative;
                        ">
                            <img src="${chat.avatar_url}" class="profile_avatar" style="
                                width: 48px;
                                height: 48px;
                                border-radius: 50%;
                                object-fit: cover;
                                border: 2px solid #00eeff;
                            ">
                           
                        </button>
                    `;
                    
                    profileHtml = `
                        <p id="profile_name" style="
                            margin: 0;
                            font-weight: bold;
                            color: white;
                            font-size: 14px;
                        ">${escapeHtml(chat.name)}</p>
                        <p id="profile_status" style="
                            margin: 2px 0 0 0;
                            color: #888;
                            font-size: 11px;
                        ">${chat.participants} участников</p>
                        <p style="
                            margin: 2px 0 0 0;
                            color: #666;
                            font-size: 10px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        ">${escapeHtml(chat.desk || '')}</p>
                    `;
                    
                }
            } catch (error) {
                console.error('Failed to load self profile:', error);
            }
            break;
            
        case 'user':
            // Профиль пользователя
            const profileUser = profileState.data;
            avatarHtml = `
                <img src="${profileUser.avatar_url}" class="profile_avatar" style="
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 2px solid #00eeff;
                ">
            `;
            
            profileHtml = `
                <p id="profile_name" style="
                    margin: 0;
                    font-weight: bold;
                    color: white;
                    font-size: 14px;
                ">${escapeHtml(profileUser.name)}</p>
                <p id="profile_status" style="
                    margin: 2px 0 0 0;
                    color: #888;
                    font-size: 11px;
                ">${escapeHtml(profileUser.status || 'Не в сети')}</p>
                <p style="
                    margin: 2px 0 0 0;
                    color: #666;
                    font-size: 10px;
                ">ID: ${profileUser.id}</p>
            `;
            break;
    }
    
    // Собираем HTML
    avaDiv.innerHTML = avatarHtml;
    nameDiv.innerHTML = profileHtml;
    
    // Добавляем крестик если нужно
    if (closeButtonHtml) {
        avaDiv.style.position = 'relative';
        avaDiv.insertAdjacentHTML('beforeend', closeButtonHtml);
        
        // Обработчик закрытия
        const closeBtn = document.querySelector('#profile-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                reloadMyProfile();
            });
        }
    }
    await setchatavaupl();
    // Обработчик клика по аватарке (для self — смена аватарки)
    if (profileState.type === 'self') {
        setupAvatarUpload();
    }
}
async function setchatavaupl() {
    const avatarBtn = document.querySelector('#chat_profile_avatar');
    if (!avatarBtn) return;
    
    // Удаляем старый input
    const oldInput = document.querySelector('#hidden-chat-avatar-input');
    if (oldInput) oldInput.remove();
    
    const fileInput = document.createElement('input');
    fileInput.id = 'hidden-chat-avatar-input';
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    avatarBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        

        await setChatAvatar(files[0]);
        fileInput.value = '';
    });
}
function setupAvatarUpload() {
    const avatarBtn = document.querySelector('#self_profile_avatar');
    if (!avatarBtn) return;
    
    // Удаляем старый input
    const oldInput = document.querySelector('#hidden-avatar-input');
    if (oldInput) oldInput.remove();
    
    const fileInput = document.createElement('input');
    fileInput.id = 'hidden-avatar-input';
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    avatarBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        await setAvatar(files[0]);
        fileInput.value = '';
    });
}
async function loadKeys() {
    try {
        localStorage.removeItem('chat_keys');
        
        const response = await fetch('/api/v1/users/' + getUserId() + "/keys", {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Loaded keys from server:', result);
        
        if (result.success && result.keys) {
            const chatKeys = {};
            const myKeyPair = getBoxKeys();
            
            for (const [chatId, encryptedKeyBase64] of Object.entries(result.keys)) {
                try {
                    console.log(`Decrypting key for chat ${chatId}`);
                    console.log(chatId,encryptedKeyBase64);
                    const encryptedData = nacl.util.decodeBase64(encryptedKeyBase64);
                    
                    // Формат: [nonce (24 байта) + encrypted_key]
                    const nonce = encryptedData.slice(0, nacl.secretbox.nonceLength);
                    const encrypted = encryptedData.slice(nacl.secretbox.nonceLength);
                    
                    // ✅ ИСПРАВЛЕНО: Используем secretbox.open, а не box.open
                    const decryptedKey = nacl.secretbox.open(
                        encrypted,
                        nonce,
                        myKeyPair.secretKey  // secretbox использует тот же ключ для шифрования и расшифровки
                    );
                    
                    if (decryptedKey) {
                        chatKeys[chatId] = nacl.util.encodeBase64(decryptedKey);
                        console.log(`✅ Decrypted key for chat ${chatId}`);
                    } else {
                        console.error(`❌ Failed to decrypt key for chat ${chatId} - wrong key or corrupted data`);
                    }

                } catch (e) {
                    console.error(`Error decrypting key for chat ${chatId}:`, e);
                }
            }
            
            localStorage.setItem('chat_keys', JSON.stringify(chatKeys));
            console.log(`✅ Saved ${Object.keys(chatKeys).length} chat keys locally`);
            reloadChat(getChatId())
        } else {
            console.log('No keys found on server');
        }
    } catch (error) {
        console.error('Failed to load keys:', error);
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    
    
     // Проверяем, есть ли пользователь
    if (!getUserId()) {
        const invite = getInviteParams();
        if (invite) {
            localStorage.setItem('pendingInvite', JSON.stringify(invite));
        }
        window.location.href = '/login.html';
        return;
    }
    const sendBtn = document.querySelector('#sendbtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => sendMessage());
    }
    setupFileUpload();
    await AddChat();
    const search = window.location.search;
    reloadMyProfile();
    const pendingInvite = localStorage.getItem('pendingInvite');
    if (pendingInvite) {
        localStorage.removeItem('pendingInvite');
        // Восстанавливаем параметры в URL для обработки
        const inv = JSON.parse(pendingInvite);
        const url = new URL(window.location.href);
        url.searchParams.set('chatid', inv.chatId);
        url.searchParams.set('keyhash', inv.keyHash);
        window.history.replaceState({}, '', url);
    }
    
    // Обрабатываем приглашение (если параметры есть в URL)
    const inviteParams = getInviteParams();
    if (inviteParams) {
        await handleInvite();
    }
    
    // Вариант 2: ?join=123
    
    
    try {
        
        
        const socket = io('', {
            transports: ['websocket', 'polling'],
            query: { token: getToken() }
        });
        
        socket.on('connect', () => {
            console.log('✅ Connected to server!');
            console.log('Socket ID:', socket.id);
        });
        
        socket.on('message', (data) => {
            reciveMessage(data);
        });
        socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        });

        socket.on('connect_timeout', () => {
            console.error('❌ Connection timeout');
        });

        socket.on('error', (error) => {
            console.error('❌ Socket error:', error);
        });
        
        
        // Проверяем, есть ли ожидающее приглашение
        
        
    } catch (error) {
        console.error('Authentication failed:', error);
    }
    
    
    
    document.getElementById('chatForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Собираем данные из формы
        const chatData = {
            name: document.getElementById('chatName').value,
            participants: document.getElementById('participants').value,
            description: document.getElementById('description').value,
            createdAt: new Date().toISOString()
        };
        
        // Здесь вы можете отправить данные на сервер
        createChat(chatData)
        
        // Показываем сообщение об успехе
        showNotification(`Чат "${chatData.name}" успешно создан!`,"info");
        
        // Закрываем модальное окно
        closeChatModal();
        
        // Здесь можно добавить логику обновления списка чатов
        // updateChatsList(chatData);
    });

    // Закрытие по клику на затемнение
    document.getElementById('chatModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeChatModal();
        }
    });

    // Закрытие по клавише ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('chatModal');
            if (modal.style.display === 'flex') {
                closeChatModal();
            }
        }
    });
    setupInfiniteScroll();
    
    // Отслеживание смены чата для сброса состояния
    const originalSetChatId = setChatId;
    window.setChatId = function(id) {
        if (getChatId() !== id) {
            clearMessagesCache();
        }
        originalSetChatId(id);
    };
    
    // Можно также добавить наблюдение за контейнером сообщений
    const observer = new MutationObserver(() => {
        setupInfiniteScroll();
    });
    
    const messagesContainer = document.querySelector('#mss_block_id');
    if (messagesContainer) {
        observer.observe(messagesContainer, { childList: true, subtree: true });
    }
    
});
function getBoxKeys() {
  const privateKeyBase64 = localStorage.getItem('private_key');
  const secretKey = nacl.util.decodeBase64(privateKeyBase64);
  
  // Из 64-байтового Ed25519 secretKey получаем 32-байтовый Curve25519
  const boxSecretKey = nacl.sign.keyPair.fromSecretKey(secretKey).secretKey.slice(0, 32);
  
  // Публичный ключ тоже конвертируем
  const signKeyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
  const boxPublicKey = nacl.box.keyPair.fromSecretKey(boxSecretKey).publicKey;
  
  return {
    secretKey: boxSecretKey,   // 32 байта
    publicKey: boxPublicKey    // 32 байта
  };
}
async function createChat(dt) {
    // 1. Генерируем симметричный ключ чата
    const chatKey = nacl.randomBytes(nacl.secretbox.keyLength);
    const chatKeyBase64 = nacl.util.encodeBase64(chatKey);

    // 2. Вычисляем хеш ключа
    const chatKeyHash = await sha256(chatKeyBase64);

    // 3. Получаем свои ключи
    const keyPair = getBoxKeys();

    // 4. Шифруем ключ чата
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encrypted = nacl.secretbox(chatKey, nonce, keyPair.secretKey);

    // ✅ СОХРАНЯЕМ ВМЕСТЕ: nonce + encrypted
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce, 0);
    combined.set(encrypted, nonce.length);
    const codedKeyWithNonce = nacl.util.encodeBase64(combined);

    data = {
        "participant_ids": dt.participants.split(","),
        "name": dt.name,
        "desk": dt.description,
        "user_id": getUserId(),
        "chat_key_hash": chatKeyHash,
        "coded_key": codedKeyWithNonce  // ✅ Отправляем nonce + encrypted
    }
    
    fetch('/api/v1/chats', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
    })
    .then(response => response.json())
    .then(chatData => {
        saveChatKeyToLocal(chatData.id, chatKeyBase64);
        AddChat();
    })
    .catch(error => {
        console.error('Ошибка:', error);
        throw error;
    });
}

// ============================================
// ХРАНЕНИЕ КЛЮЧЕЙ ЧАТОВ В localStorage
// ============================================

function saveChatKey(chatId, chatKeyBase64) {
  const keys = JSON.parse(localStorage.getItem('chat_keys') || '{}');
  keys[chatId] = chatKeyBase64;
  localStorage.setItem('chat_keys', JSON.stringify(keys));
}

async function getChatKey(chatId) {
  const chatKeys = JSON.parse(localStorage.getItem('chat_keys') || '{}');
  if (chatKeys[chatId] == null) {
    await loadKeys()
  };
  return chatKeys[chatId] || null;
}

function removeChatKey(chatId) {
  const keys = JSON.parse(localStorage.getItem('chat_keys') || '{}');
  delete keys[chatId];
  localStorage.setItem('chat_keys', JSON.stringify(keys));
}
// ============================================
// ШИФРОВАНИЕ / РАСШИФРОВКА СООБЩЕНИЙ В ЧАТЕ
// ============================================

async function encryptMessage(chatKeyBase64, plaintext) {
  const key = nacl.util.decodeBase64(chatKeyBase64);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = nacl.util.decodeUTF8(plaintext);

  const encrypted = nacl.secretbox(messageBytes, nonce, key);

  return {
    encrypted: nacl.util.encodeBase64(encrypted),
    nonce: nacl.util.encodeBase64(nonce)
  };
}

async function decryptMessage(chatKeyBase64, encryptedBase64, nonceBase64) {
  const key = nacl.util.decodeBase64(chatKeyBase64);
  const decrypted = nacl.secretbox.open(
    nacl.util.decodeBase64(encryptedBase64),
    nacl.util.decodeBase64(nonceBase64),
    key
  );

  if (!decrypted) {
    return null; // неверный ключ или повреждены данные
  }

  return nacl.util.encodeUTF8(decrypted);
}

function getUserId() {
    if (localStorage.getItem('userId')) {
        return localStorage.getItem('userId')
    } else {
        return false
    }
}
function setUserId(id) {
    localStorage.setItem('userId', id);
}
async function reciveMessage(data) {
    if (data.type == "new_msg") {
        // Проверяем, что сообщение для текущего чата
        if (data.chat_id.toString() != getChatId().toString()) {
            return;
        }
        
        // Рендерим сообщение через общую функцию
        const messageObj = {
            id: data.message_id,
            user_id: data.user_id,
            login: data.login,
            avatar_url: data.avatar_url,
            content: data.text || data.content,
            nonce: data.nonce
        };
        
        const messageHtml = await renderMessage(messageObj);
        
        const chatsContainer = document.querySelector('#mss_block_id');
        chatsContainer.insertAdjacentHTML('beforeend', messageHtml);
        
        // Прокрутка вниз если пользователь был внизу
        const isAtBottom = chatsContainer.scrollHeight - chatsContainer.clientHeight <= chatsContainer.scrollTop + 100;
        if (isAtBottom) {
            chatsContainer.scrollTop = chatsContainer.scrollHeight;
        }
    } else if (data.message == "Connection rejected by server") {
        let privateKey = localStorage.getItem("private_key");
        if (!privateKey || privateKey == 'null') {
            window.location.href = "/login.html";
        }
    }
}

// НОВАЯ ФУНКЦИЯ - НАСТРОЙКА БЕСКОНЕЧНОЙ ПРОКРУТКИ
function setupInfiniteScroll() {
    const container = document.querySelector('#mss_block_id');
    if (!container) return;
    
    // Удаляем старый обработчик, если есть
    container.removeEventListener('scroll', handleScroll);
    container.addEventListener('scroll', handleScroll);
}

function handleScroll() {
    const container = document.querySelector('#mss_block_id');
    if (!container) return;
    
    // Если прокрутили вверх на 100px от начала - загружаем старые сообщения
    if (container.scrollTop <= 100 && !isLoadingMessages && hasMoreMessages) {
        showLoader(true);
        loadOlderMessages(currentChatId || getChatId()).finally(() => {
            showLoader(false);
        });
    }
}

// ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ КОЛИЧЕСТВА СООБЩЕНИЙ (опционально)
async function checkUnreadMessages(chatId) {
    try {
        // Получаем только количество сообщений (можно добавить endpoint на сервере)
        const messages = await getChatMess(chatId, getUserId(), 1, 1);
        if (messages && messages.length > 0) {
            const lastMessageTime = new Date(messages[0].sent_at);
            // Здесь можно реализовать логику подсчета непрочитанных
            // Например, хранить в localStorage время последнего прочтения чата
        }
    } catch (error) {
        console.error('Failed to check unread messages:', error);
    }
}

// ФУНКЦИЯ ДЛЯ ПРИНУДИТЕЛЬНОЙ ОЧИСТКИ КЭША СООБЩЕНИЙ (при выходе из чата)
function clearMessagesCache() {
    currentPage = 1;
    hasMoreMessages = true;
    currentChatId = null;
    
    const container = document.querySelector('#mss_block_id');
    if (container) {
        container.innerHTML = '';
    }
}

function getChatId() {
    if (localStorage.getItem('chatId')) {
        return localStorage.getItem('chatId')
    } else {
        return false
    }
}
function setChatId(id) {
    localStorage.setItem('chatId', id);
}
function getToken() {
    if (localStorage.getItem('token')) {
        return localStorage.getItem('token')
    } else {
        return false
    }
}
function setToken(tk) {
    localStorage.setItem('token', tk);
}


function openChatModal() {
    const modal = document.getElementById('chatModal');
    modal.style.display = 'flex';
    
    // Блокировка скролла body
    document.body.style.overflow = 'hidden';
    
    // Очистка формы
    document.getElementById('chatForm').reset();
}

// Функция закрытия модального окна
function closeChatModal() {
    const modal = document.getElementById('chatModal');
    modal.style.display = 'none';
    
    // Возвращаем скролл
    document.body.style.overflow = '';
}

// Обработка отправки формы
// Глобальная переменная для текущих выбранных файлов
let pendingFiles = [];

// Функция выбора файла
function setupFileUpload() {
    const fileBtn = document.querySelector('#addFile');
    if (!fileBtn) return;
    
    // Удаляем старый input если есть
    const oldInput = document.querySelector('#hidden-file-input');
    if (oldInput) oldInput.remove();
    
    // Создаём скрытый input
    const fileInput = document.createElement('input');
    fileInput.id = 'hidden-file-input';
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/*,video/*,audio/*,.pdf,.txt,.doc,.docx';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        
        // Проверяем, что файлы получены корректно
        if (files.length === 0) return;
        
        console.log('Selected files:', files.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            isFile: f instanceof File,
            isBlob: f instanceof Blob,
            hasArrayBuffer: typeof f.arrayBuffer === 'function'
        })));
        
        // Показываем превью перед отправкой
        showFilePreviewModal(files);
        
        // Очищаем input для возможности повторного выбора тех же файлов
        fileInput.value = '';
    });
}
async function setAvatar(file) { 
    const formData = new FormData();
    formData.append('user_id', getUserId()); 
    formData.append('file', file);
   
    
    try {
        showNotification(`Загрузка ${file.name}...`, 'info');
        
        const response = await fetch('/api/v1/setAvatar', { 
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${getToken()}`

            }
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const result = await response.json(); 
        reloadMyProfile()
    } catch (error) {
        console.error('Upload error:', error);
        showNotification(`Ошибка загрузки ${file.name}`, 'error');
    }
    await reloadChat(getChatId());
}

async function setChatAvatar(file) { 
    const formData = new FormData();
    formData.append('user_id', getUserId()); 
    formData.append('file', file);
    formData.append('chat_id', getChatId()); 
    
    try {
        showNotification(`Загрузка ${file.name}...`, 'info');
        
        const response = await fetch('/api/v1/setChatAvatar', { 
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${getToken()}`

            }
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const result = await response.json(); 
        reloadProfile()
    } catch (error) {
        console.error('Upload error:', error);
        showNotification(`Ошибка загрузки ${file.name}`, 'error');
    }
    await reloadChat(getChatId());
}


function showFilePreviewModal(files) {
    // Удаляем старую модалку если есть
    const oldModal = document.querySelector('#filePreviewModal');
    if (oldModal) oldModal.remove();
    
    // Создаём контейнер для превью
    const modal = document.createElement('div');
    modal.id = 'filePreviewModal';
    modal.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: #2d2d2d;
        border-radius: 12px;
        padding: 12px;
        z-index: 1000;
        max-width: 350px;
        max-height: 400px;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border: 1px solid #00eeff;
    `;
    document.body.appendChild(modal);
    
    // Создаём превью для каждого файла
    let previewsHtml = '<div style="color: white; margin-bottom: 8px; font-weight: bold;">Файлы для отправки:</div>';
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImage = file.type && file.type.startsWith('image/');
        
        previewsHtml += `
            <div class="preview-file-item" data-file-index="${i}" style="
                display: flex; 
                align-items: center; 
                margin-bottom: 8px; 
                gap: 8px;
                padding: 4px;
                border-radius: 6px;
                background: #1a1a1a;
            ">
                <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    ${isImage ? '🖼️' : '📄'}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(file.name || 'unnamed')}
                    </div>
                    <div style="font-size: 10px; color: #888;">
                        ${formatSize(file.size || 0)}
                    </div>
                </div>
                <button class="remove-file-btn" style="
                    background: none; 
                    border: none; 
                    color: #ff5555; 
                    cursor: pointer;
                    font-size: 16px;
                    padding: 4px 8px;
                ">✖</button>
            </div>
        `;
    }
    
    previewsHtml += `
        <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button id="sendFilesBtn" style="
                flex: 1;
                background: #4CAF50; 
                border: none; 
                padding: 8px 12px; 
                border-radius: 6px; 
                color: white; 
                cursor: pointer;
                font-weight: bold;
            ">📤 Отправить</button>
            <button id="cancelFilesBtn" style="
                flex: 1;
                background: #666; 
                border: none; 
                padding: 8px 12px; 
                border-radius: 6px; 
                color: white; 
                cursor: pointer;
            ">Отмена</button>
        </div>
    `;
    
    modal.innerHTML = previewsHtml;
    modal.style.display = 'block';
    
    // Сохраняем файлы в глобальную переменную
    pendingFiles = files;
    
    // Обработчики кнопок
    document.querySelector('#sendFilesBtn').onclick = async () => {
        // Копируем массив и очищаем модалку сразу
        const filesToUpload = [...pendingFiles];
        modal.style.display = 'none';
        pendingFiles = [];
        
        // Загружаем файлы
        await uploadAndSendFiles(filesToUpload);
    };
    
    document.querySelector('#cancelFilesBtn').onclick = () => {
        modal.style.display = 'none';
        pendingFiles = [];
    };
    
    // Кнопки удаления отдельных файлов
    document.querySelectorAll('.remove-file-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.closest('.preview-file-item').dataset.fileIndex);
            pendingFiles.splice(idx, 1);
            
            if (pendingFiles.length === 0) {
                modal.style.display = 'none';
            } else {
                showFilePreviewModal(pendingFiles);
            }
        };
    });
}
// Загрузка файлов на сервер и отправка сообщения
async function uploadAndSendFiles(files) {
    if (!getChatId()) {
        showNotification('Выберите чат', 'error');
        return;
    }
    
    const chatKey = nacl.util.decodeBase64(await getChatKey(getChatId()));
    
    for (const file of files) {
        try {
            showNotification(`Шифрую ${file.name}...`, 'info');
            
            // Шифруем файл
            const encrypted = await encryptFileForUpload(file, chatKey);
            
            showNotification(`Отправляю ${file.name}...`, 'info');
            
            // Загружаем блоб на сервер
            const response = await fetch('/api/v1/blobs', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'X-Blob-Hash': encrypted.blobHash,
                    'Content-Type': 'application/octet-stream'
                },
                body: encrypted.blob
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }
            
            const result = await response.json();
            
            // Сохраняем метаданные локально
            saveFileMetadata(encrypted.blobHash, {
                original_name: file.name,
                mime_type: file.type || 'application/octet-stream',
                original_size: file.size,
                file_nonce: encrypted.fileNonce
            });
            
            // Добавляем в currentAttachments
            currentAttachments.push({
                blob_hash: encrypted.blobHash
            });
            
            showNotification(`${file.name} готов к отправке`, 'success');
            
        } catch (error) {
            console.error('Upload error:', error);
            showNotification(`Ошибка загрузки ${file.name}`, 'error');
        }
    }
    
    if (currentAttachments.length > 0) {
        showNotification(
            `${currentAttachments.length} файл(ов) готово. Напишите текст и нажмите отправить.`,
            'info'
        );
    }
}
// Функция отображения сообщения с вложениями (обновить reloadChat)
// Замените существующую функцию reloadChat на эту:

async function encryptFileForUpload(file, chatKey) {
    // Читаем файл — поддержка как File, так и Blob
    let fileBytes;
    
    if (file instanceof File || file instanceof Blob) {
        // Современные браузеры
        if (typeof file.arrayBuffer === 'function') {
            const fileBuffer = await file.arrayBuffer();
            fileBytes = new Uint8Array(fileBuffer);
        } else {
            // Fallback для старых браузеров
            fileBytes = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(new Uint8Array(reader.result));
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
        }
    } else if (file.buffer instanceof ArrayBuffer) {
        // Уже ArrayBuffer
        fileBytes = new Uint8Array(file.buffer);
    } else if (file.data && file.size) {
        // Объект с data и size (например, после десериализации)
        fileBytes = new Uint8Array(file.data);
    } else {
        throw new Error('Unsupported file format: ' + typeof file);
    }
    
    // Паддинг до 1КБ
    const CHUNK_SIZE = 1024;
    const paddedSize = Math.ceil(fileBytes.length / CHUNK_SIZE) * CHUNK_SIZE;
    const padded = new Uint8Array(paddedSize);
    padded.set(fileBytes);
    
    if (paddedSize > fileBytes.length) {
        const randomPadding = nacl.randomBytes(paddedSize - fileBytes.length);
        padded.set(randomPadding, fileBytes.length);
    }
    
    // Шифруем файл
    const fileNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encryptedFile = nacl.secretbox(padded, fileNonce, chatKey);
    
    // Создаем метаданные
    const metadata = {
        originalName: file.name || 'unnamed_file',
        mimeType: file.type || 'application/octet-stream',
        originalSize: fileBytes.length,
        paddedSize: paddedSize,
        fileNonce: nacl.util.encodeBase64(fileNonce)
    };
    
    // Шифруем метаданные
    const metadataNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const metadataBytes = nacl.util.decodeUTF8(JSON.stringify(metadata));
    const encryptedMetadata = nacl.secretbox(metadataBytes, metadataNonce, chatKey);
    
    // Упаковываем: [metadata_length:4][metadata_nonce:24][encrypted_metadata][encrypted_file]
    const metadataTotalLength = metadataNonce.length + encryptedMetadata.length;
    const combined = new Uint8Array(4 + metadataTotalLength + encryptedFile.length);
    
    // Заголовок: длина метаданных
    combined[0] = (metadataTotalLength >> 24) & 0xFF;
    combined[1] = (metadataTotalLength >> 16) & 0xFF;
    combined[2] = (metadataTotalLength >> 8) & 0xFF;
    combined[3] = metadataTotalLength & 0xFF;
    
    let offset = 4;
    combined.set(metadataNonce, offset); offset += metadataNonce.length;
    combined.set(encryptedMetadata, offset); offset += encryptedMetadata.length;
    combined.set(encryptedFile, offset);
    
    // Считаем хеш
    const blobHash = await sha256FromBytes(combined);
    
    return {
        blob: combined,
        blobHash: blobHash,
        fileNonce: nacl.util.encodeBase64(fileNonce)
    };
}
async function sha256FromBytes(bytes) {
    // Web Crypto API работает с ArrayBuffer
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
// Функция рендеринга сообщения с вложениями
async function renderMessage(ms) {
    const isSelf = ms.user_id == getUserId();
    const chatKeyBase64 = await getChatKey(getChatId());
    const chatKey = nacl.util.decodeBase64(chatKeyBase64);
    
    // Расшифровываем content
    const decryptedText = await decryptMessage(chatKeyBase64, ms.content, ms.nonce);
    
    if (!decryptedText) {
        return `
            <div class="mss_block${isSelf ? '_slf' : ''}">
                ${isSelf ? '' : `<img src="${ms.avatar_url}" class="chat_icon">`}
                <div class="${isSelf ? 'self_mss' : 'mss'}">
                    <p id="name">${escapeHtml(ms.login)}</p>
                    <div class="message-content" style="color: #ff5555;">⚠️ Не удалось расшифровать</div>
                </div>
                ${isSelf ? `<img src="${ms.avatar_url}" class="chat_icon_self">` : ''}
            </div>
        `;
    }
    
    // Пробуем распарсить как JSON
    let messageObj;
    try {
        messageObj = JSON.parse(decryptedText);
    } catch {
        // Старый формат — просто текст
        return renderSimpleMessage(ms, decryptedText, isSelf);
    }
    
    // Новый формат
    if (!messageObj.type || messageObj.type === 'message') {
        return await renderRichMessage(ms, messageObj, isSelf, chatKey);
    }
    
    // Для неизвестных типов — показываем как текст
    return renderSimpleMessage(ms, decryptedText, isSelf);
}

function renderSimpleMessage(ms, text, isSelf) {
    const contentHtml = text ? `<div class="message-content">${escapeHtml(text)}</div>` : '';
    
    if (isSelf) {
        return `
            <div class="mss_block_slf">
                <div class="self_mss">
                    <p class="message-username" data-user-id="${ms.user_id}" 
                       style="cursor: pointer; color: #00eeff; font-weight: bold;"
                       onclick="showUserProfile(${ms.user_id})">
                       ${escapeHtml(ms.login)}
                    </p>
                    ${contentHtml}
                </div>
                <img src="${ms.avatar_url}" class="chat_icon_self">
            </div>
        `;
    } else {
        return `
            <div class="mss_block">
                <img src="${ms.avatar_url}" class="chat_icon">
                <div class="mss">
                    <p class="message-username" data-user-id="${ms.user_id}" 
                        style="cursor: pointer; color: #00eeff; font-weight: bold;"
                        onclick="showUserProfile(${ms.user_id})">
                        ${escapeHtml(ms.login)}
                    </p>
                    ${contentHtml}
                </div>
            </div>
        `;
    }
}

async function renderRichMessage(ms, messageObj, isSelf, chatKey) {
    let textHtml = '';
    if (messageObj.text) {
        textHtml = `<div class="message-content">${escapeHtml(messageObj.text)}</div>`;
    }
    
    let attachmentsHtml = '';
    if (messageObj.attachments && messageObj.attachments.length > 0) {
        attachmentsHtml = '<div class="attachments">';
        
        for (const att of messageObj.attachments) {
            const meta = await getFileMetadata(att.blob_hash) || att.metadata || {};
            const mimeType = meta.mime_type || meta.mimeType || 'application/octet-stream';
            const name = meta.original_name || meta.originalName || 'file.bin';
            const size = meta.original_size || meta.originalSize || 0;
            console.log(await getFileMetadata(att.blob_hash));
            if (mimeType.startsWith('image/')) {
                attachmentsHtml += `
                    <div class="attachment-image">
                        <div class="image-container" 
                             onclick="openEncryptedImage('${att.blob_hash}', '${escapeHtml(name)}')"
                             style="cursor: pointer; padding: 8px; border: 1px solid #444; border-radius: 8px; display: inline-block; margin: 4px;">
                            <div style="text-align: center;">
                                🖼️ ${escapeHtml(name)}
                                <br><small style="color: #888;">${formatSize(size)}</small>
                                <br><small style="color: #00eeff;">Нажмите для просмотра</small>
                            </div>
                        </div>
                    </div>
                `;
            } else if (mimeType.startsWith('audio/')) {
                attachmentsHtml += `
                    <div class="attachment-audio">
                        <div style="padding: 8px; border: 1px solid #444; border-radius: 8px; margin: 4px;">
                            🎵 ${escapeHtml(name)}
                            <br><small style="color: #888;">${formatSize(size)}</small>
                            <br><button onclick="loadAndPlayAudio('${att.blob_hash}')" 
                                 style="background: #4CAF50; border: none; padding: 4px 12px; border-radius: 4px; color: white; cursor: pointer; margin-top: 4px;">
                                ▶ Воспроизвести
                            </button>
                        </div>
                    </div>
                `;
            } else {
                
                attachmentsHtml += `
                    <div class="attachment-file">
                        <div style="padding: 8px; border: 1px solid #444; border-radius: 8px; margin: 4px;">
                            📄 ${escapeHtml(name)}
                            <br><small style="color: #888;">${formatSize(size)}</small>
                            <br><button onclick="downloadAndDecryptFile('${att.blob_hash}', '${escapeHtml(name)}')"
                                 style="background: #2196F3; border: none; padding: 4px 12px; border-radius: 4px; color: white; cursor: pointer; margin-top: 4px;">
                                ⬇ Скачать
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        
        attachmentsHtml += '</div>';
    }
    
    if (isSelf) {
        return `
            <div class="mss_block_slf">
                <div class="self_mss">
                    <p id="name">${escapeHtml(ms.login)}</p>
                    ${textHtml}
                    ${attachmentsHtml}
                </div>
                <img src="${ms.avatar_url}" class="chat_icon_self">
            </div>
        `;
    } else {
        return `
            <div class="mss_block">
                <img src="${ms.avatar_url}" class="chat_icon">
                <div class="mss">
                    <p class="message-username" data-user-id="${ms.user_id}" 
                       style="cursor: pointer; color: #00eeff; font-weight: bold;"
                       onclick="showUserProfile(${ms.user_id})">
                       ${escapeHtml(ms.login)}
                    </p>
                    ${textHtml}
                    ${attachmentsHtml}
                </div>
            </div>
        `;
    }
}

async function decryptBlob(blobHash) {
    const chatKey = nacl.util.decodeBase64(await getChatKey(getChatId()));
    
    // Скачиваем блоб
    const response = await fetch(`/api/v1/blobs/${blobHash}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }
    
    const encryptedData = new Uint8Array(await response.arrayBuffer());
    
    // Разбираем упаковку
    const metadataLength = (encryptedData[0] << 24) | 
                          (encryptedData[1] << 16) | 
                          (encryptedData[2] << 8) | 
                          encryptedData[3];
    
    let offset = 4;
    const metadataNonce = encryptedData.slice(offset, offset + nacl.secretbox.nonceLength);
    offset += nacl.secretbox.nonceLength;
    
    const encryptedMetadata = encryptedData.slice(offset, offset + metadataLength - nacl.secretbox.nonceLength);
    offset += metadataLength - nacl.secretbox.nonceLength;
    
    const encryptedFile = encryptedData.slice(offset);
    
    // Расшифровываем метаданные
    const metadataBytes = nacl.secretbox.open(encryptedMetadata, metadataNonce, chatKey);
    if (!metadataBytes) throw new Error('Metadata decryption failed');
    
    const metadata = JSON.parse(nacl.util.encodeUTF8(metadataBytes));
    
    // Расшифровываем файл
    const fileNonce = nacl.util.decodeBase64(metadata.fileNonce);
    const decryptedPadded = nacl.secretbox.open(encryptedFile, fileNonce, chatKey);
    if (!decryptedPadded) throw new Error('File decryption failed');
    
    // Убираем паддинг
    const decryptedFile = decryptedPadded.slice(0, metadata.originalSize);
    
    // Создаем Blob
    const blob = new Blob([decryptedFile], { type: metadata.mimeType });
    const url = URL.createObjectURL(blob);
    
    return {
        url: url,
        metadata: metadata
    };
}

async function openEncryptedImage(blobHash, fileName) {
    showNotification('Загрузка и расшифровка изображения...', 'info');
    
    try {
        const result = await decryptBlob(blobHash);
        
        // Создаем модалку
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 2000;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
        `;
        overlay.onclick = () => {
            document.body.removeChild(overlay);
            URL.revokeObjectURL(result.url);
        };
        
        const img = document.createElement('img');
        img.src = result.url;
        img.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain;';
        img.onclick = (e) => e.stopPropagation();
        
        overlay.appendChild(img);
        document.body.appendChild(overlay);
        
        showNotification('Изображение загружено', 'success');
        
    } catch (error) {
        console.error('Image load error:', error);
        showNotification('Ошибка загрузки изображения', 'error');
    }
}

async function loadAndPlayAudio(blobHash) {
    showNotification('Загрузка аудио...', 'info');
    
    try {
        const result = await decryptBlob(blobHash);
        
        const audio = new Audio(result.url);
        audio.onended = () => URL.revokeObjectURL(result.url);
        audio.play();
        
        showNotification('Воспроизведение...', 'success');
        
    } catch (error) {
        console.error('Audio load error:', error);
        showNotification('Ошибка загрузки аудио', 'error');
    }
}

async function downloadAndDecryptFile(blobHash, originalName) {
    showNotification('Скачивание и расшифровка...', 'info');
    
    try {
        const result = await decryptBlob(blobHash);
        
        const a = document.createElement('a');
        a.href = result.url;
        a.download = originalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(result.url), 60000);
        
        showNotification('Файл сохранен', 'success');
        
    } catch (error) {
        console.error('File download error:', error);
        showNotification('Ошибка скачивания файла', 'error');
    }
}

// Функция для открытия полноразмерного изображения
function openImageModal(imageUrl) {
    let modal = document.querySelector('#imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 2000;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
        `;
        modal.onclick = () => modal.style.display = 'none';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `<img src="${imageUrl}" style="max-width: 90%; max-height: 90%; object-fit: contain;">`;
    modal.style.display = 'flex';
}

// Обновить функцию reciveMessage для поддержки вложений
