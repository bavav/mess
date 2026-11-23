# dtbs.py
import hashlib
from datetime import datetime
from typing import List, Optional
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import BigInteger, Integer, String, Text, DateTime, ForeignKey, Index, UniqueConstraint, JSON, BOOLEAN
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

db = SQLAlchemy()

# Ассоциативная таблица для связи пользователей с карточками
users_cards = db.Table(
    'users_cards',
    db.Column('card_id', db.Integer, db.ForeignKey('cards.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('quantity', db.Integer, default=0),
    db.Column('favorite', db.Boolean, nullable=True)
)

# Ассоциативная таблица для связи пользователей с фрагментами
# У каждого фрагмента своя запись (каждый фрагмент уникален)
users_fragments = db.Table(
    'users_fragments',
    db.Column('fragment_id', db.Integer, db.ForeignKey('fragments.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('collected', db.Boolean, default=False),
    db.Column('quantity', db.Integer, default=0) # собран ли этот конкретный фрагмент
)

class User(db.Model):
    __tablename__ = 'users'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
    titules: Mapped[List[str]] = mapped_column(JSON, server_default='[]')
    gold: Mapped[int] = mapped_column(default=0)
    diamonds: Mapped[int] = mapped_column(default=0)
    energy: Mapped[int] = mapped_column(default=100)
    maxenergy: Mapped[int] = mapped_column(default=100)
    lvl: Mapped[int] = mapped_column(default=1)
    kubes: Mapped[int] = mapped_column(default=0)
    tickets: Mapped[int] = mapped_column(default=0)
    
    cards: Mapped[List['Card']] = relationship(
        'Card', secondary=users_cards, back_populates='users', lazy='dynamic'
    )
    
    fragments: Mapped[List['Fragment']] = relationship(
        'Fragment', secondary=users_fragments, back_populates='users', lazy='dynamic'
    )
    
    def add_fragment(self, fragment_id: int) -> bool:
        """Добавить конкретный фрагмент пользователю"""
        fragment = Fragment.query.get(fragment_id)
        if not fragment:
            return False
        
        # Проверяем, есть ли уже такой фрагмент у пользователя
        existing = db.session.query(users_fragments).filter_by(
            user_id=self.id, fragment_id=fragment_id
        ).first()
        
        if existing:
            existing.quantity += 1  # Фрагмент уже есть
        else:
        # Добавляем фрагмент
            db.session.execute(users_fragments.insert().values(
                user_id=self.id, fragment_id=fragment_id, collected=True
            ))
        db.session.commit()
        return True
    
    def get_fragments_for_card(self, card_id: int) -> List['Fragment']:
        """Получить все фрагменты, которые есть у пользователя для конкретной карты"""
        return [f for f in self.fragments if f.card_id == card_id]
    
    def get_fragments_count_for_card(self, card_id: int) -> int:
        """Получить количество собранных фрагментов для карты (0-20)"""
        return len(self.get_fragments_for_card(card_id))
    
    def can_craft_card(self, card_id: int) -> bool:
        """Проверить, можно ли собрать карту (нужно 20 фрагментов)"""
        return self.get_fragments_count_for_card(card_id) >= 20
    
    def craft_card(self, card_id: int) -> bool:
        """Собрать карту из 20 фрагментов"""
        card = Card.query.get(card_id)
        if not card or not card.can_be_crafted:
            return False
        
        # Проверяем, есть ли уже такая карта у пользователя
        user_card = db.session.query(users_cards).filter_by(
            user_id=self.id, card_id=card_id
        ).first()
        
        if user_card and user_card.quantity > 0:
            return False  # Карточка уже есть
        
        # Проверяем количество фрагментов
        fragments_count = self.get_fragments_count_for_card(card_id)
        if fragments_count < 20:
            return False  # Недостаточно фрагментов
        
        # Забираем все 20 фрагментов (удаляем их у пользователя)
        for fragment in self.get_fragments_for_card(card_id):
            db.session.execute(users_fragments.delete().where(
                users_fragments.c.user_id == self.id,
                users_fragments.c.fragment_id == fragment.id
            ))
        
        # Добавляем карточку пользователю
        if user_card:
            user_card.quantity = 1
        else:
            db.session.execute(users_cards.insert().values(
                user_id=self.id, card_id=card_id, quantity=1
            ))
        
        db.session.commit()
        return True

class Vers(db.Model):
    __tablename__ = 'verses'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    
    cards: Mapped[List['Card']] = relationship(
        'Card', back_populates='vers', lazy='selectin'
    )

class Fragment(db.Model):
    __tablename__ = 'fragments'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey('cards.id'))
    fragment_number: Mapped[int] = mapped_column(Integer, nullable=False)  # Номер фрагмента от 1 до 20
    photo_path: Mapped[str] = mapped_column(String(255), nullable=False)  # Путь к фото фрагмента
    
    # Связи
    card: Mapped['Card'] = relationship('Card', back_populates='fragments')
    users: Mapped[List['User']] = relationship(
        'User', secondary=users_fragments, back_populates='fragments', lazy='selectin'
    )
    
    __table_args__ = (
        UniqueConstraint('card_id', 'fragment_number', name='unique_card_fragment'),
    )

class Card(db.Model):
    __tablename__ = 'cards'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    vers_id: Mapped[int] = mapped_column(ForeignKey('verses.id'))
    rarity: Mapped[str] = mapped_column(String(50), nullable=False)
    can_be_crafted: Mapped[bool] = mapped_column(BOOLEAN, default=True)
    photo_path: Mapped[str] = mapped_column(String(255), nullable=False)  # Путь к фото карты
    
    # Связи
    vers: Mapped['Vers'] = relationship('Vers', back_populates='cards')
    fragments: Mapped[List['Fragment']] = relationship(
        'Fragment', back_populates='card', cascade="all, delete-orphan"
    )
    users: Mapped[List['User']] = relationship(
        'User', secondary=users_cards, back_populates='cards', lazy='selectin'
    )