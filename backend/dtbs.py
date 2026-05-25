# dtbs.py
import hashlib
from datetime import datetime
from typing import List, Optional
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import BigInteger, Integer, String, Text, DateTime, ForeignKey, Index, UniqueConstraint, JSON, BOOLEAN
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

# Создаем db здесь, без импорта из main_app
db = SQLAlchemy()

# Ассоциативная таблица
chat_participants = db.Table(
    'chat_participants',
    db.Column('chat_id', db.Integer, db.ForeignKey('chats.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, server_default=func.now()),
    db.Column('left_at', db.DateTime, nullable=True)
)
class Blob(db.Model):
    __tablename__ = 'blobs'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    blob_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    padded_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ref_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Никаких внешних ключей на users/chats/messages
class User(db.Model):
    __tablename__ = 'users'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    avatar_filename: Mapped[str] = mapped_column(String(255), server_default="default_avatar.webp")
    desk: Mapped[str] = mapped_column(String(255), server_default="...")
    public_key: Mapped[str] = mapped_column(String(48), nullable=False)
    titules: Mapped[List[str]] = mapped_column(JSON, server_default='[]')
    chat_keys: Mapped[List[dict]] = mapped_column(JSON, server_default='[]') #шифровано
    # online: Mapped[bool] = mapped_column(BOOLEAN, server_default=False)
    # Связи
    created_chats: Mapped[List['Chat']] = relationship(
        'Chat', foreign_keys='Chat.created_by', back_populates='creator', lazy='selectin'
    )
    chats: Mapped[List['Chat']] = relationship(
        'Chat', secondary=chat_participants, back_populates='participants', lazy='selectin'
    )
    messages: Mapped[List['Message']] = relationship(
        'Message', back_populates='user', lazy='selectin'
    )
    
    def __repr__(self) -> str:
        return f'<User {self.login}>'

class Chat(db.Model):
    __tablename__ = 'chats'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    avatar_filename: Mapped[str] = mapped_column(String(255), server_default="default_avatar.webp", nullable=True)
    desk: Mapped[str] = mapped_column(String(255), server_default="G.O.A.Ts")
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    creator: Mapped['User'] = relationship(
        'User', foreign_keys=[created_by], back_populates='created_chats', lazy='joined'
    )
    participants: Mapped[List['User']] = relationship(
        'User', secondary=chat_participants, back_populates='chats', lazy='selectin'
    )
    messages: Mapped[List['Message']] = relationship(
        'Message', back_populates='chat', lazy='selectin', cascade='all, delete-orphan'
    )
    
    def __repr__(self) -> str:
        return f'<Chat {self.id} Name:{self.name}>'

class Message(db.Model):
    __tablename__ = 'messages'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    attachments: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey('chats.id'), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    user_login: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    nonce: Mapped[Optional[str]] = mapped_column(String(100), nullable=False)
    chat: Mapped['Chat'] = relationship('Chat', back_populates='messages', lazy='joined')
    user: Mapped['User'] = relationship('User', back_populates='messages', lazy='joined')
    reactions: Mapped[List['MessageReaction']] = relationship(
        'MessageReaction', back_populates='message', cascade='all, delete-orphan', lazy='selectin'
    )
    
    __table_args__ = (
        Index('idx_chat_messages', 'chat_id', 'sent_at'),
        Index('idx_user_messages', 'user_id', 'sent_at'),
    )
    
    def __repr__(self) -> str:
        return f'<Message {self.id} Chat:{self.chat_id}>'

class MessageReaction(db.Model):
    __tablename__ = 'message_reactions'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey('messages.id'), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False)
    reaction: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    
    message: Mapped['Message'] = relationship('Message', back_populates='reactions', lazy='joined')
    user: Mapped['User'] = relationship('User', lazy='joined')
    
    __table_args__ = (
        UniqueConstraint('message_id', 'user_id', 'reaction', name='unique_user_message_reaction'),
        Index('idx_reaction_message', 'message_id'),
    )

# Функции-хелперы (без db.create_all здесь!)
def add_user(username, password):
    psw = hashlib.sha256(password.encode()).hexdigest()
    new_user = User(login=username, password_hash=psw)
    db.session.add(new_user)
    db.session.commit()
    return new_user

def get_user(user_id):
    return db.session.get(User, user_id)

def get_user_by_login(login):
    return db.session.execute(db.select(User).where(User.login == login)).scalar_one_or_none()

def get_all_users():
    return db.session.execute(db.select(User)).scalars().all()

def update_user(user_id, new_login=None, new_password=None):
    user = db.session.get(User, user_id)
    if user:
        if new_login:
            user.login = new_login
        if new_password:
            user.password_hash = hashlib.sha256(new_password.encode()).hexdigest()
        db.session.commit()
        return user
    return None

def delete_user(user_id):
    user = db.session.get(User, user_id)
    if user:
        db.session.delete(user)
        db.session.commit()
        return True
    return False