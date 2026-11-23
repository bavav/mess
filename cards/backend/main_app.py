# main_app.py - исправленная версия с обработкой ошибок

import hashlib
from datetime import datetime, timedelta
import random
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

from dtbs import Fragment, db, User, Card, users_fragments, users_cards
from PIL import Image
import io

app = Flask(__name__)
#app.config.from_object(Config)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
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
app.config['SECRET_KEY'] = "eror"

# Создаём папку для загрузок, если её нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


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


@app.route('/api/v2/users/login', methods=['POST'])
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

@app.route('/api/v2/cards', methods=['GET'])
def cards():
    try:
        if request.headers.get('cards'):
            
            cards = request.headers.get('cards')
        else:
            cards = None
        
        
        if not cards:
            
        
            stmt = (
                select(Card)
                
            )

            cards = db.session.execute(stmt).all()
            test = []
            for i in cards:
                
                test.append(i[0].id)
            
            return test, 200
        else:
            stmt = (
                select(Card)
                .where(Card.id.in_(cards.split(",")))
            )

            cards = db.session.execute(stmt).all()
            test = []
            for i in cards:
                i = i[0]
                test.append({"id":i.id, "rarity":i.rarity, "name":i.name, "vers": i.vers_id, "image_url": url_for('static', filename=f'cards/{i.photo_path.split("\\")[-1]}')})
            
            return test, 200
    except Exception as e:
        print(f"error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v2/cards/<int:card_id>', methods=['GET'])
def card(card_id:int):
    try:
        stmt = (
            select(Card)
            .where(Card.id == card_id)
        )

        cards = db.session.execute(stmt).one_or_none()
        if cards:
            cards = cards[0]
            test = {"id":cards.id, "rarity":cards.rarity, "name":cards.name, "vers": cards.vers_id}
        
            return test, 200
        else:
            return {"msg":"error"}
    except Exception as e:
        print(f"error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/v2/users/<int:user_id>/res', methods=['GET'])
def user_res(user_id: int):
    try:
        
        token = request.headers.get('Authorization').split(" ")[1] 
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        
        if str(user_id) != str(data['user_id']):
            return jsonify({"msg": "notoken"}), 423
        user = db.session.get(User, int(data['user_id']))
        
        if user:
            
            return jsonify({
                'coins': user.gold,
                'diamonds': user.diamonds,
                'energy': user.energy,
                'maxEnergy': user.maxenergy,
                'level': user.lvl,
                'trophies': user.kubes,
                'tickets': user.tickets
            }), 200
        else:
            user = User(id=int(data['user_id']), gold=500,diamonds=0,energy=150,maxenergy=150,lvl= 1,kubes=0,tickets = 0)
            db.session.add(user)
            db.session.flush()
            db.session.commit()
            return jsonify({
                'coins': user.gold,
                'diamonds': user.diamonds,
                'energy': user.energy,
                'maxEnergy': user.maxenergy,
                'level': user.lvl,
                'trophies': user.kubes,
                'tickets': user.tickets
            }), 200
    except Exception as e:
        print(f"error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
@app.route('/api/v2/testToken', methods=['GET'])
def test(user_id: int):
    
    data = request.json
    token = request.headers.get('Authorization').split(" ")[1] 
    data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    
    if str(user_id) != str(data['user_id']):
        return jsonify({"msg": "notoken","ok":False}), 423
    else:
        return jsonify({"ok": True}), 200
    
@app.route('/api/v2/user/<int:user_id>/inventory', methods=['GET'])
def get_user_inventory(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    result = []
    
    # 1. Получаем все карты пользователя
    user_cards = db.session.query(users_cards).filter_by(user_id=user_id).all()
    
    for uc in user_cards:
        card = Card.query.get(uc.card_id)
        if card:
            result.append({
                'type': 'card',
                'card_id': card.id,
                'card_name': card.name,
                'rarity': card.rarity,
                'photo_path': card.photo_path,
                'quantity': uc.quantity,
                'favorite': uc.favorite or False
            })
    
    
    user_fragments = db.session.query(users_fragments).filter_by(user_id=user_id).all()
    
    
    fragments_by_card = {}
    for uf in user_fragments:
        fragment = Fragment.query.get(uf.fragment_id)
        if fragment:
            if fragment.card_id not in fragments_by_card:
                fragments_by_card[fragment.card_id] = []
            fragments_by_card[fragment.card_id].append(fragment.fragment_number)
    
    # Добавляем сгруппированные фрагменты в результат
    for card_id, fragment_numbers in fragments_by_card.items():
        card = Card.query.get(card_id)
        if card:
            result.append({
                'type': 'fragments',
                'card_id': card_id,
                'card_name': card.name,
                'fragments': sorted(fragment_numbers),  # [1,8,19...]
                'quantity': len(fragment_numbers),  # количество собранных фрагментов
                'total_needed': 20,  # всего нужно для сборки
                'can_craft': len(fragment_numbers) >= 20
            })
    
    return jsonify({
        'user_id': user_id,
        'inventory': result,
        'total_cards': len(user_cards),
        'total_fragments': len(user_fragments)
    })
    
    
@app.route('/api/v2/rollcard', methods=['GET'])
def rollcard():
    token = request.headers.get('Authorization').split(" ")[1] 
    data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    
    
    user = db.session.get(User, int(data['user_id']))
    if not user:
        return jsonify({"msg": "notoken"}), 423
    if user.energy > 50 or user.id == 3:
        user.energy -= 50
        stmt = (
            select(Fragment)
            
        )

        cards = db.session.execute(stmt).all()
        card = random.choice(cards)[0]
        crd = db.session.get(Card,card.card_id)
        db.session.merge(user)
        db.session.commit()
        print(card.photo_path.split("\\")[-1])
        user.add_fragment(card.id)
        return jsonify({"complited":True,"name":crd.name,"card_id":crd.id,"frg_id":card.fragment_number,"card":url_for('static', filename=f'fragments/card_{card.card_id}/{card.photo_path.split("\\")[-1]}')})
    else:
        return jsonify({"complited":False,"msg":"Нет энергии"})
    

@app.route('/static/fragments/card_<int:card_id>/<path:filename>')
def serve_frontend(card_id,filename):
    print(filename)
    return send_from_directory("static/fragments/"+f"card_{card_id}/", filename)
@app.route('/static/cards<path:filename>')
def serve_frontend2(filename):
    print(filename)
    return send_from_directory("static/cards/", filename)
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
    socketio.run(app, debug=True, port=48621 , host='127.0.0.1', allow_unsafe_werkzeug=True)