# main_app.py - исправленная версия с обработкой ошибок

import hashlib
from datetime import datetime, timedelta
from typing import List
from flask import Flask, request, jsonify, url_for, render_template
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from flask_migrate import Migrate
from sqlalchemy import select, func, and_, desc, text
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.orm.attributes import flag_modified
import jwt
import traceback
import os
import uuid
from werkzeug.utils import secure_filename
from flask import send_from_directory
# Импортируем config и db из правильных мест
from config import Config
from dtbs import db, User, Chat, Message, MessageReaction, Blob, chat_participants
from PIL import Image
import io

def make_square_with_padding_transparent(image_path, target_size=500, use_transparent=True):
    """
    Превращает прямоугольное изображение в квадратное
    use_transparent: True - прозрачные поля (для PNG/WebP), False - подбираем цвет
    """
    with Image.open(image_path) as img:
        # Определяем, нужно ли использовать прозрачность
        supports_transparency = img.mode in ('RGBA', 'LA', 'P')
        will_use_transparency = use_transparent and supports_transparency
        
        if will_use_transparency:
            # Конвертируем в RGBA для поддержки прозрачности
            if img.mode != 'RGBA':
                if img.mode == 'P':
                    img = img.convert('RGBA')
                elif img.mode == 'LA':
                    rgb_img = Image.new('RGBA', img.size, (0, 0, 0, 0))
                    rgb_img.putalpha(img.split()[1])
                    img = rgb_img
                else:
                    img = img.convert('RGBA')
            bg_color = (0, 0, 0, 0)  # Полностью прозрачный
        else:
            # Определяем доминирующий цвет для полей
            bg_color = get_dominant_color(image_path)
            # Конвертируем в RGB
            if img.mode != 'RGB':
                rgb_img = Image.new('RGB', img.size, bg_color)
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode == 'RGBA':
                    rgb_img.paste(img, mask=img.split()[-1])
                else:
                    rgb_img.paste(img)
                img = rgb_img
        
        width, height = img.size
        
        # Вычисляем масштаб чтобы вписать в квадрат
        scale = target_size / max(width, height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        # Ресайзим с сохранением пропорций
        if will_use_transparency:
            img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        else:
            img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Создаем квадратное полотно (прозрачное или цветное)
        if will_use_transparency:
            square_img = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
        else:
            square_img = Image.new('RGB', (target_size, target_size), bg_color)
        
        # Вставляем изображение по центру
        x_offset = (target_size - new_width) // 2
        y_offset = (target_size - new_height) // 2
        square_img.paste(img_resized, (x_offset, y_offset))
        
        return square_img, will_use_transparency

def get_dominant_color(image_path):
    """Определяет доминирующий цвет изображения для полей"""
    with Image.open(image_path) as img:
        # Создаем маленькую копию для анализа
        img_small = img.copy()
        img_small.thumbnail((50, 50))
        
        # Конвертируем в RGB если нужно
        if img_small.mode != 'RGB':
            if img_small.mode == 'RGBA':
                # Убираем прозрачность, заменяя на белый фон
                background = Image.new('RGB', img_small.size, (255, 255, 255))
                background.paste(img_small, mask=img_small.split()[-1])
                img_small = background
            else:
                img_small = img_small.convert('RGB')
        
        # Берем средний цвет
        from collections import Counter
        pixels = list(img_small.getdata())
        
        # Округляем цвета для уменьшения количества уникальных
        rounded_pixels = [tuple((c // 10) * 10 for c in pixel) for pixel in pixels]
        most_common = Counter(rounded_pixels).most_common(1)[0][0]
        
        # Возвращаем оригинальные значения (без округления)
        return tuple(int(c) for c in most_common)
    
    
app = Flask(__name__)
app.config.from_object(Config)

# Инициализируем db с app
db.init_app(app)
migrate = Migrate(app, db)

# Замените текущую настройку CORS на эту:
CORS(app, supports_credentials=True)
# Добавьте обработчик OPTIONS для всех маршрутов:
# Настройки для файлов
UPLOAD_FOLDER = 'static/uploads'
AVAS_FOLDER = 'static/avas'
BLOBS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'blobs')

# Создаём папки
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(AVAS_FOLDER, exist_ok=True)
os.makedirs(BLOBS_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mp3', 'wav', 'pdf', 'txt', 'doc', 'docx'}

app.config['BLOBS_FOLDER'] = BLOBS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB для блобов
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['AVAS_FOLDER'] = AVAS_FOLDER


# Создаём папку для загрузок, если её нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
# Для WebSocket
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Хранилища
active_connections = {}
typing_users = {}
@app.before_request
def log_request_info():
    print(f"Path: {request.path}")
from flask import send_from_directory

# Получаем путь к фронтенду
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'airzer0', 'frontend')

# @app.route('/')
# @app.route('/<path:filename>')
# def serve_frontend(filename='login.html'):
#     return send_from_directory(FRONTEND_DIR, filename)
# ============ WebSocket Handlers ============

@socketio.on('connect')
def handle_connect():
    token = request.args.get('token')
    if not token:
        return False
    data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    user_id = data.get('user_id')  # Используем .get() вместо прямого доступа
    username = data.get('username')
    
    print(f"📝 Decoded token: user_id={user_id}, username={username}")
    try:
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = data['user_id']
        username = data['username']
        if User.query.filter_by(id=user_id).first():
            active_connections[user_id] = request.sid
            emit('user_online', {'user_id': user_id, 'username': username}, broadcast=True)
            print(f"✅ User {username} connected via WebSocket")
            return True
        else:
            return False
    except Exception as e:
        print(f"Connection error: {e}")
        return False

@socketio.on('disconnect')
def handle_disconnect():
    user_id = None
    for uid, sid in active_connections.items():
        if sid == request.sid:
            user_id = uid
            break
    
    if user_id:
        del active_connections[user_id]
        emit('user_offline', {'user_id': user_id}, broadcast=True)
        print(f"❌ User {user_id} disconnected")

# ============ HTTP Routes ============
#files
@app.route('/api/v1/upload', methods=['POST'])
def upload_file():
    try:
        print(request.form)
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        token = request.headers.get('Authorization').split(" ")[1] 
        data2 = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(request.form["user_id"]) != str(data2['user_id']):
            return jsonify({"msg":"notoken"}), 400
        # Оригинальное имя (может быть с кириллицей) — для отображения пользователю
        original_filename = file.filename
        
        # Определяем расширение из mimetype (надёжнее, чем из имени)
        mime_to_ext = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/bmp': 'bmp',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
        }
        
        # Берём расширение из mimetype
        ext = mime_to_ext.get(file.mimetype, 'bin')
        
        # Если не нашли по mimetype, пробуем из имени файла (латиница)
        if ext == 'bin' and '.' in original_filename:
            # Пытаемся взять расширение из имени, если оно латиницей
            possible_ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
            if possible_ext.isascii():
                ext = possible_ext
        
        # Генерируем уникальное имя с расширением
        unique_filename = f"{uuid.uuid4().hex}.{ext}"
        
        # Сохраняем файл
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        
        print(f"Saved: {original_filename} -> {unique_filename} (mime: {file.mimetype})")
        
        # Определяем тип файла для предпросмотра
        image_exts = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'}
        audio_exts = {'mp3',"wav"}
        print(ext)
        if ext in image_exts:
            
            file_type = 'image' 
        elif ext in audio_exts:
            file_type = 'audio' 
        else:
            file_type = 'file'
        
        # Генерируем URL
        file_url = url_for('static', filename=f'uploads/{unique_filename}')
        
        # Для изображений — тот же URL как превью
        preview_url = file_url if file_type == 'image' else None
        
        return jsonify({
            'success': True,
            'file_url': file_url,
            'preview_url': preview_url,
            'file_type': file_type,
            'file_name': original_filename,  # Оригинальное имя с кириллицей
            'file_size': os.path.getsize(filepath)
        }), 200
        
    except Exception as e:
        print(f"Upload error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# Опционально: раздача файлов (если нужно)
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


#main
@app.route('/api/v1/setAvatar', methods=['POST'])
def upload_avas():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        token = request.headers.get('Authorization').split(" ")[1] 
        data2 = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(request.form["user_id"]) != str(data2['user_id']):
            return jsonify({"msg": "notoken"}), 400
        
        original_filename = file.filename
        
        # Сохраняем временно оригинал
        temp_path = os.path.join(app.config['AVAS_FOLDER'], f"temp_{uuid.uuid4().hex}")
        file.save(temp_path)
        
        # Определяем формат исходного файла
        with Image.open(temp_path) as img:
            original_format = img.format
            supports_transparency = img.mode in ('RGBA', 'LA', 'P')
        
        # Параметры аватара
        AVATAR_SIZE = 500
        
        # Создаем квадратную версию (с прозрачностью если поддерживается)
        use_transparent = supports_transparency and original_format in ['PNG', 'WEBP']
        square_avatar, used_transparency = make_square_with_padding_transparent(
            temp_path, 
            target_size=AVATAR_SIZE, 
            use_transparent=use_transparent
        )
        
        # Определяем формат сохранения
        if used_transparency:
            # Сохраняем с прозрачностью
            save_format = 'PNG' if original_format == 'PNG' else 'WEBP'
            ext = 'png' if save_format == 'PNG' else 'webp'
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            final_path = os.path.join(app.config['AVAS_FOLDER'], unique_filename)
            
            # Сохраняем с оптимизацией
            if save_format == 'PNG':
                square_avatar.save(final_path, 'PNG', optimize=True)
            else:
                square_avatar.save(final_path, 'WEBP', quality=85, method=6)
        else:
            # Сохраняем как JPEG с полями подобранного цвета
            ext = 'jpg'
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            final_path = os.path.join(app.config['AVAS_FOLDER'], unique_filename)
            square_avatar.save(final_path, 'JPEG', quality=85, optimize=True)
        
        # Удаляем временный файл
        os.remove(temp_path)
        
        file_url = url_for('static', filename=f'avas/{unique_filename}')
        user = db.session.get(User, data2['user_id'])
        user.avatar_filename = unique_filename
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'file_url': file_url,
            'preview_url': file_url,
            'file_type': 'image',
            'file_name': original_filename,
            'file_size': os.path.getsize(final_path),
            'has_transparency': used_transparency
        }), 200
        
    except Exception as e:
        print(f"Upload error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/v1/setChatAvatar', methods=['POST'])
def upload_avas_ch():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        token = request.headers.get('Authorization').split(" ")[1] 
        data2 = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(request.form["user_id"]) != str(data2['user_id']):
            return jsonify({"msg": "notoken"}), 400
        
        original_filename = file.filename
        
        # Сохраняем временно оригинал
        temp_path = os.path.join(app.config['AVAS_FOLDER'], f"temp_{uuid.uuid4().hex}")
        file.save(temp_path)
        
        # Определяем формат исходного файла
        with Image.open(temp_path) as img:
            original_format = img.format
            supports_transparency = img.mode in ('RGBA', 'LA', 'P')
        
        # Параметры аватара
        AVATAR_SIZE = 500
        
        # Создаем квадратную версию (с прозрачностью если поддерживается)
        use_transparent = supports_transparency and original_format in ['PNG', 'WEBP']
        square_avatar, used_transparency = make_square_with_padding_transparent(
            temp_path, 
            target_size=AVATAR_SIZE, 
            use_transparent=use_transparent
        )
        
        # Определяем формат сохранения
        if used_transparency:
            # Сохраняем с прозрачностью
            save_format = 'PNG' if original_format == 'PNG' else 'WEBP'
            ext = 'png' if save_format == 'PNG' else 'webp'
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            final_path = os.path.join(app.config['AVAS_FOLDER'], unique_filename)
            
            # Сохраняем с оптимизацией
            if save_format == 'PNG':
                square_avatar.save(final_path, 'PNG', optimize=True)
            else:
                square_avatar.save(final_path, 'WEBP', quality=85, method=6)
        else:
            # Сохраняем как JPEG с полями подобранного цвета
            ext = 'jpg'
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            final_path = os.path.join(app.config['AVAS_FOLDER'], unique_filename)
            square_avatar.save(final_path, 'JPEG', quality=85, optimize=True)
        
        # Удаляем временный файл
        os.remove(temp_path)
        
        file_url = url_for('static', filename=f'avas/{unique_filename}')
        user = db.session.get(Chat, request.form["chat_id"])
        user.avatar_filename = unique_filename
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'file_url': file_url,
            'preview_url': file_url,
            'file_type': 'image',
            'file_name': original_filename,
            'file_size': os.path.getsize(final_path),
            'has_transparency': used_transparency
        }), 200
        
    except Exception as e:
        print(f"Upload error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/users/reg', methods=['POST'])
def create_user():
    try:
        data = request.json
        print(f"Registration attempt: {data}")
        
        if not data or 'login' not in data or 'password' not in data:
            return jsonify({'error': 'Missing login or password'}), 400
        
        psw = hashlib.sha256(data["password"].encode()).hexdigest()
        
        existing_user = User.query.filter_by(login=data['login']).first()
        if existing_user:
            return jsonify({'error': 'User already exists'}), 409
        
        user = User(login=data['login'], password_hash=psw, public_key=data['public_key'])
        db.session.add(user)
        db.session.commit()
        token = jwt.encode(
            {'user_id': user.id, 'username': user.login},
            app.config['SECRET_KEY'],
            algorithm='HS256'
        )
        return jsonify({'id': user.id, 'login': user.login, "token": token}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Registration error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/users/login', methods=['POST'])
def login_user():
    try:
        data = request.json
        print(f"Login attempt: {data}")
        
        if not data or 'login' not in data or 'password' not in data:
            return jsonify({'error': 'Missing login or password'}), 400
        
        psw = hashlib.sha256(data["password"].encode()).hexdigest()
        
        # Используем простой запрос вместо select
        
        user = User.query
        user.filter_by(login=data['login']).first()
        if not user:
            return jsonify({'error': "UserNotFound"}), 401
        user = User.query.filter_by(login=data['login'],password_hash=psw).first()
        if not user:
            return jsonify({'error': "PasswordNotCorrect"}), 401
        user = User.query.filter_by(login=data['login'],password_hash=psw,public_key=data['public_key']).first()
        if not user:
            return jsonify({'error': "KeyNotCorrect"}), 401
        # Генерируем JWT токен
        token = jwt.encode(
            {'user_id': user.id, 'username': user.login},
            app.config['SECRET_KEY'],
            algorithm='HS256'
        )
        
        print(f"User {user.login} logged in successfully {token}")
        
        return jsonify({
            'id': user.id, 
            'login': user.login, 
            'token': token
        }), 200
    except Exception as e:
        print(f"Login error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500



@app.route('/api/v1/chats', methods=['POST'])
def create_chat():
    try:
        data = request.json
        token = request.headers.get('Authorization').split(" ")[1] 
        data2 = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(data["user_id"]) != str(data2['user_id']):
            return jsonify({"msg":"notoken"}), 400
        chat = Chat(
            name=data.get('name', "G.O.A.Ts"),
            created_by=data['user_id'],
            desk = data["desk"],
            key_hash = data["chat_key_hash"]
        )
        
        db.session.add(chat)
        db.session.flush()  # Чтобы получить chat.id
    
        user = db.session.get(User, int(data2['user_id']))
        print(user.chat_keys)
        # ИСПРАВЛЕННЫЙ КОД:
        # Получаем текущие ключи или создаём новый список
        if user.chat_keys is None:
            user.chat_keys = []
        elif not isinstance(user.chat_keys, list):
            # Если это не список, пробуем конвертировать
            try:
                user.chat_keys = list(user.chat_keys) if user.chat_keys else []
            except:
                user.chat_keys = []
        
        # Добавляем новую запись
        new_key_entry = {str(chat.id): data["coded_key"]}  # Ключ как строка для JSON
        user.chat_keys.append(new_key_entry)
        chat.participants.append(user)
        flag_modified(user, 'chat_keys')  # Говорим SQLAlchemy, что поле изменилось
        db.session.flush()
        print(user.chat_keys)
        db.session.commit()
        
        return jsonify({'id': chat.id, 'name': chat.name}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Create chat error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/chats/<int:chat_id>/messages', methods=['POST'])
def send_message(chat_id: int):
    try:
        data = request.json
        token = request.headers.get('Authorization').split(" ")[1] 
        data2 = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(data["user_id"]) != str(data2['user_id']):
            return jsonify({"msg":"notoken"}), 400
        user = db.session.get(User, int(data2['user_id']))
        
        message = Message(
            content=data.get('content', ''),
            chat_id=chat_id,
            user_id=int(data['user_id']),
            user_login=user.login if user else None,
            user=user,
            nonce = data["nonce"],
            
        )
        
        db.session.add(message)
        db.session.commit()
        
        avatar_filename = user.avatar_filename if user and hasattr(user, 'avatar_filename') else None
        if avatar_filename:
            avatar_url = url_for('static', filename=f'avas/{avatar_filename}')
        else:
            avatar_url = url_for('static', filename='default_avatar.webp')
        
        # Отправляем через сокет с вложениями
        socketio.emit('message', {
            "type":"new_msg",
            "user_id": data['user_id'],
            "avatar_url": avatar_url,
            "text": data.get('content', ''),
            "chat_id": chat_id,
            "message_id": message.id,
            'login': user.login,
            'nonce': data["nonce"],
            
        })
        
        return jsonify({
            'id': message.id,
            'content': message.content,
            'sent_at': message.sent_at.isoformat(),
            
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"Send message error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
@app.route('/api/v1/chats/<int:chat_id>/accept-invite', methods=['POST'])
def accept_invite(chat_id: int):
    """Принимает приглашение: проверяет хеш ключа и добавляет в чат"""
    try:
        data = request.json
        token = request.headers.get('Authorization').split(" ")[1]
        token_data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = token_data['user_id']
        
        chat = db.session.get(Chat, chat_id)
        if not chat:
            return jsonify({'error': 'Chat not found'}), 404
        
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Проверяем, не в чате ли уже
        if user in chat.participants:
            return jsonify({
                'message': 'Already in chat',
                'chat_id': chat_id,
                'already_joined': True
            }), 200
        
        # Сверяем хеш ключа
        client_hash = data.get('key_hash')
        if client_hash != chat.key_hash:
            return jsonify({'error': 'Key hash mismatch — possible tampering'}), 400
        
        # Добавляем пользователя
        chat.participants.append(user)
        
        # Сохраняем зашифрованный ключ чата (пользователь присылает его)
        coded_key = data.get('coded_key')
        if coded_key:
            # Убедись, что у User есть поле chat_keys (JSON или Text)
            if hasattr(user, 'chat_keys') and user.chat_keys is not None:
                keys_list = list(user.chat_keys) if isinstance(user.chat_keys, list) else []
            else:
                keys_list = []
            
            if coded_key not in keys_list:
                keys_list.append({chat.id:coded_key})
                user.chat_keys = keys_list
        
        db.session.commit()
        
        return jsonify({
            'message': 'Joined chat successfully',
            'chat_id': chat_id,
            'chat_name': chat.name
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Accept invite error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
@app.route('/api/v1/chats/<int:chat_id>/messages', methods=['GET'])
def get_messages(chat_id: int):
    try:
        token = request.headers.get('Authorization').split(" ")[1] 
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        stmt = (
            select(Chat)
            .where(Chat.id == chat_id)
            .where(Chat.participants.any(id=data['user_id']))
        )

        chat_exists = db.session.execute(stmt).scalar_one_or_none()
        if str(request.args.get('user_id')) != str(data['user_id']) or not chat_exists:
            return jsonify({"msg":"notoken"}), 400
        page = int(request.args.get('page', 1, type=int))
        per_page = int(request.args.get('per_page', 50, type=int))
        
        # Create query
        stmt = (
            select(Message)
            .filter_by(chat_id=chat_id)
            .order_by(Message.sent_at.desc())
            .limit(per_page)
            .offset((page - 1) * per_page)
            .options(joinedload(Message.user))
        )

        # Execute query
        messages = db.session.scalars(stmt).all()
        d = []
        
        db.session.scalars(select(Chat).filter_by(id=chat_id)).one_or_none()
        for m in messages:
            avatar_filename = m.user.avatar_filename if m.user and hasattr(m.user, 'avatar_filename') else None
            if avatar_filename:
                avatar_url = url_for('static', filename=f'avas/{avatar_filename}')
            else:
                avatar_url = url_for('static', filename='default_avatar.webp')
            
            d.append({
                'id': m.id,
                "chat_id": m.chat_id,
                'content': m.content,
                'user_id': m.user_id,  # Added user_id
                'user': m.user.login if m.user else None,
                'login': m.user.login,
                "nonce": m.nonce,
                'avatar_url': avatar_url,
                'sent_at': m.sent_at.isoformat(),
                'reactions': [{'reaction': r.reaction, 'user': r.user.login} for r in m.reactions]
                
            })
        d.reverse()
        print(d)
        return jsonify(d)  # Moved outside the loop
    except jwt.ExpiredSignatureError:
        return jsonify({"msg": "Token expired"}), 401
    
    except Exception as e:
        print(f'Error in get_messages: {e}')
        return jsonify({'msg': 'Failed to fetch messages'}), 500

@app.route('/api/v1/users/<int:user_id>/chats', methods=['GET'])
def get_user_chats(user_id: int):
    try:
        token = request.headers.get('Authorization').split(" ")[1] 
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        print(data['user_id'])
        if str(request.args.get('user_id')) != str(data['user_id']):
            return jsonify({"msg":"notoken"}), 423
        chats = (Chat.query
                .join(chat_participants)
                .filter(chat_participants.c.user_id == user_id)
                .options(selectinload(Chat.participants), selectinload(Chat.creator))
                .order_by(Chat.started_at.desc())
                .all())
        
        result = []
        for c in chats:
            avatar_filename = getattr(c, 'avatar_filename', None)
            if avatar_filename:
                avatar_url = url_for('static', filename=f'avas/{avatar_filename}')
            else:
                avatar_url = url_for('static', filename='default_avatar.webp')
            
            result.append({
                'id': c.id,
                'name': c.name or f"Chat {c.id}",
                'desk': getattr(c, 'desk', "No description"),
                'avatar_url': avatar_url,
                'participants_count': len(c.participants),
                'creator': c.creator.login if c.creator else 'Unknown'
            })
        return jsonify(result)
    except Exception as e:
        print(f"Get user chats error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
@app.route('/api/v1/users/<int:user_id>', methods=['GET'])
def get_user(user_id: int):
    try:
        token = request.headers.get('Authorization').split(" ")[1] 
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        print(data['user_id'])
        
        user = db.session.get(User, user_id)
        if user:
            avatar_filename = getattr(user, 'avatar_filename', None)
            if avatar_filename:
                avatar_url = url_for('static', filename=f'avas/{avatar_filename}')
            else:
                avatar_url = url_for('static', filename='default_avatar.webp')
            return jsonify({
                    'id': user.id,
                    'name': user.login or f"USer {user.id}",
                    'desk': getattr(user, 'desk', "No description"),
                    'avatar_url': avatar_url,
                    'status': getattr(user, 'titules', "Вроде существует"),
                    'lifetime': datetime.fromtimestamp(datetime.now().timestamp() - user.registered_at.timestamp()).isoformat()
                }), 200
        else:
            return jsonify({
                    "error":"userNotFound"
                }), 432
    except Exception as e:
        print(f"Get user chats error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/chats/<int:chat_id>', methods=['GET'])
def get_chat(chat_id: int):
    try:
        
        chat = db.session.get(Chat, chat_id)
        if chat:
            avatar_filename = getattr(chat, 'avatar_filename', None)
            if avatar_filename:
                avatar_url = url_for('static', filename=f'avas/{avatar_filename}')
            else:
                avatar_url = url_for('static', filename='default_avatar.webp')
            return jsonify({
                    'id': chat.id,
                    'name': chat.name or f"CHat {chat.id}",
                    'desk': getattr(chat, 'desk', "No description"),
                    'avatar_url': avatar_url,
                    'lifetime': getattr(chat, 'started_at', "Вовремя"),
                    "participants" : len(chat.participants) or -1
                }), 200
        else:
            return jsonify({
                    "error":"chatNotFound"
                }), 432
    except Exception as e:
        print(f"Get chat error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/users/<int:user_id>/keys', methods=['GET'])
def get_userk(user_id: int):
    try:
        token = request.headers.get('Authorization').split(" ")[1] 
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(user_id) != str(data['user_id']):
            return jsonify({"msg": "notoken"}), 423
            
        user = db.session.get(User, user_id)
        if user:
            # Возвращаем ключи в правильном формате
            # chat_keys хранится как JSON: [{chat_id: "encrypted_key_base64"}, ...]
            keys_dict = {}
            if user.chat_keys:
                # Преобразуем список словарей в один словарь
                for item in user.chat_keys:
                    if isinstance(item, dict):
                        keys_dict.update(item)
            print(keys_dict)
            return jsonify({
                'success': True,
                'keys': keys_dict  # Формат: {"chat_id": "encrypted_key", ...}
            }), 200
        else:
            return jsonify({
                "error": "userNotFound"
            }), 404
    except Exception as e:
        print(f"Get user keys error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/messages/<int:message_id>/react', methods=['POST'])
def add_reaction(message_id: int):
    try:
        data = request.json
        
        existing = MessageReaction.query.filter_by(
            message_id=message_id,
            user_id=data['user_id'],
            reaction=data['reaction']
        ).first()
        
        if existing:
            db.session.delete(existing)
        else:
            reaction = MessageReaction(
                message_id=message_id,
                user_id=data['user_id'],
                reaction=data['reaction']
            )
            db.session.add(reaction)
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        print(f"Add reaction error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/chats/<int:chat_id>/stats')
def chat_stats(chat_id: int):
    try:
        user_stats = (db.session.query(Message.user_id, User.login, func.count(Message.id).label('msg_count'))
                     .join(User, Message.user_id == User.id)
                     .filter(Message.chat_id == chat_id)
                     .group_by(Message.user_id, User.login)
                     .order_by(desc('msg_count'))
                     .all())
        
        hourly_activity = (db.session.query(
                              func.extract('hour', Message.sent_at).label('hour'),
                              func.count().label('count')
                          )
                          .filter(Message.chat_id == chat_id)
                          .group_by('hour')
                          .order_by('hour')
                          .all())
        
        return jsonify({
            'user_messages': [{'user': u.login, 'count': u.msg_count} for u in user_stats],
            'hourly_activity': [{'hour': int(h.hour), 'count': h.count} for h in hourly_activity]
        })
    except Exception as e:
        print(f"Chat stats error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/chats/<int:chat_id>/join', methods=['POST'])
def chat_join(chat_id: int):
    try:
        # Get user_id from JSON request body
        data = request.get_json()
        if not data or 'user_id' not in data:
            return jsonify({'error': 'user_id is required'}), 400
            
        user_id = data['user_id']
        
        # Get user and chat
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        chat = db.session.get(Chat, chat_id)
        if not chat:
            return jsonify({'error': 'Chat not found'}), 404
        
        # Check if user is already in chat
        if user in chat.participants:
            return jsonify({'message': 'User already in chat', 'chat_id': chat_id, 'user_id': user_id}), 200
        
        # Add user to chat
        chat.participants.append(user)
        
        # Update the participant's joined_at timestamp in association table
        # If you need to update joined_at, you would need to access the association object
        # For simplicity, the joined_at will be set automatically via server_default
        
        db.session.commit()
        
        return jsonify({
            'message': 'User joined chat successfully',
            'chat_id': chat_id,
            'user_id': user_id,
            'user_login': user.login,
            'chat_name': chat.name
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Chat join error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
    
    
@app.route('/api/v1/blobs', methods=['POST'])
def upload_blob():
    """
    Загрузка зашифрованного блоба.
    Сервер НЕ знает: тип файла, оригинальное имя, реальный размер.
    Сервер знает ТОЛЬКО: blob_hash, padded_size, storage_path.
    """
    try:
        # Аутентификация
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'No token'}), 401
        
        token = auth_header.split(" ")[1]
        try:
            jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        # Получаем сырые бинарные данные
        blob_data = request.get_data()
        
        if not blob_data:
            return jsonify({'error': 'Empty blob'}), 400
        
        # Хеш от клиента
        client_hash = request.headers.get('X-Blob-Hash')
        if not client_hash:
            return jsonify({'error': 'Missing X-Blob-Hash header'}), 400
        
        # Проверяем хеш
        computed_hash = hashlib.sha256(blob_data).hexdigest()
        if client_hash != computed_hash:
            return jsonify({'error': 'Hash mismatch',"hashs":[client_hash,computed_hash]}), 400
        
        # Дедупликация
        existing = db.session.scalars(
            select(Blob).where(Blob.blob_hash == computed_hash)
        ).first()
        
        if existing:
            existing.ref_count += 1
            db.session.commit()
            return jsonify({
                'blob_hash': computed_hash,
                'status': 'exists',
                'padded_size': existing.padded_size
            }), 200
        
        # Сохраняем блоб
        # Поддиректория из первых двух символов хеша (для файловых систем)
        subdir = computed_hash[:2]
        blob_dir = os.path.join(app.config['BLOBS_FOLDER'], subdir)
        os.makedirs(blob_dir, exist_ok=True)
        
        blob_path = os.path.join(blob_dir, computed_hash)
        with open(blob_path, 'wb') as f:
            f.write(blob_data)
        
        blob = Blob(
            blob_hash=computed_hash,
            storage_path=blob_path,
            padded_size=len(blob_data)
        )
        db.session.add(blob)
        db.session.commit()
        
        return jsonify({
            'blob_hash': computed_hash,
            'status': 'uploaded',
            'padded_size': len(blob_data)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Blob upload error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/blobs/<blob_hash>', methods=['GET'])
def download_blob(blob_hash):
    """
    Скачивание блоба по хешу.
    Сервер отдает application/octet-stream без знания содержимого.
    """
    try:
        # Аутентификация
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'No token'}), 401
        
        token = auth_header.split(" ")[1]
        try:
            jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        blob = db.session.scalars(
            select(Blob).where(Blob.blob_hash == blob_hash)
        ).first()
        
        if not blob:
            return jsonify({'error': 'Blob not found'}), 404
        
        if not os.path.exists(blob.storage_path):
            return jsonify({'error': 'Blob file missing'}), 500
        
        # Отдаем как бинарный поток — без имени, без Content-Type кроме octet-stream
        from flask import send_file
        return send_file(
            blob.storage_path,
            mimetype='application/octet-stream',
            as_attachment=False,
            download_name=f'{blob_hash}.bin'
        )
        
    except Exception as e:
        print(f"Blob download error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/blobs/<blob_hash>/info', methods=['GET'])
def blob_info(blob_hash):
    """
    Информация о блобе (только padded_size и статус).
    Сервер НЕ раскрывает содержимое.
    """
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'No token'}), 401
        
        token = auth_header.split(" ")[1]
        try:
            jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        blob = db.session.scalars(
            select(Blob).where(Blob.blob_hash == blob_hash)
        ).first()
        
        if not blob:
            return jsonify({'error': 'Not found'}), 404
        
        return jsonify({
            'blob_hash': blob.blob_hash,
            'padded_size': blob.padded_size,
            'created_at': blob.created_at.isoformat(),
            'exists': os.path.exists(blob.storage_path)
        }), 200
        
    except Exception as e:
        print(f"Blob info error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/blobs/<blob_hash>/refcount', methods=['POST'])
def update_blob_refcount(blob_hash):
    """
    Клиент сообщает, что блоб больше не нужен (decrement) или нужен (increment).
    """
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'No token'}), 401
        
        token = auth_header.split(" ")[1]
        try:
            jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        data = request.get_json()
        action = data.get('action', 'decrement')
        
        blob = db.session.scalars(
            select(Blob).where(Blob.blob_hash == blob_hash)
        ).first()
        
        if not blob:
            return jsonify({'error': 'Not found'}), 404
        
        if action == 'increment':
            blob.ref_count += 1
        elif action == 'decrement':
            blob.ref_count = max(0, blob.ref_count - 1)
        else:
            return jsonify({'error': 'Invalid action'}), 400
        
        db.session.commit()
        
        return jsonify({
            'blob_hash': blob_hash,
            'ref_count': blob.ref_count
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Blob refcount error: {e}")
        return jsonify({'error': str(e)}), 500
# ============ Запуск ============

if __name__ == '__main__':
    with app.app_context():
        # Создаем все таблицы
        db.create_all()
        print("✅ Database tables created")
        
        # Проверяем структуру таблиц
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"📊 Tables in database: {tables}")
        
        for table in tables:
            columns = inspector.get_columns(table)
            print(f"  Table {table}: {[col['name'] for col in columns]}")
    
    print("🚀 Starting server on http://localhost:5000")
    socketio.run(app, debug=True, port=48620, host='127.0.0.1', allow_unsafe_werkzeug=True)