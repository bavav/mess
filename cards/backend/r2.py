import os
import sys
import math
import random
from PIL import Image
import numpy as np
from pathlib import Path

# Добавляем путь к проекту
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Импортируем Flask и модели
from flask import Flask
from dtbs import db, Card, Fragment  # ЗАМЕНИТЕ на ваш actual import

def create_app():
    """Создает контекст Flask приложения"""
    app = Flask(__name__)
    
    # Настройки базы данных - ЗАМЕНИТЕ на ваши настройки
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'  # или ваш URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    return app

def calculate_block_size(image_size, block_percent=8):
    """
    Вычисляет размер блока в пикселях на основе процента от размера изображения
    """
    return max(1, int(image_size * block_percent / 100))

def create_fragments_for_card(image_path, card_id, block_percent=8, num_fragments=20, output_base_dir="static/fragments"):
    """
    Создает фрагменты для одной карты
    """
    print(f"   Загрузка изображения: {image_path}")
    img = Image.open(image_path).convert('RGBA')
    original_array = np.array(img)
    height, width, _ = original_array.shape
    
    # Вычисляем размер блока
    block_w = calculate_block_size(width, block_percent)
    block_h = calculate_block_size(height, block_percent)
    
    print(f"   Размер изображения: {width}x{height}")
    print(f"   Размер блока ({block_percent}%): {block_w}x{block_h} пикселей")
    
    # Вычисляем количество блоков
    blocks_w = width // block_w
    blocks_h = height // block_h
    total_blocks = blocks_w * blocks_h
    
    if total_blocks < num_fragments:
        print(f"   ⚠️ Внимание: всего блоков ({total_blocks}) меньше чем фрагментов ({num_fragments})")
        print(f"   Некоторые фрагменты будут пустыми")
    
    blocks_per_fragment = max(1, total_blocks // num_fragments)
    
    print(f"   Всего блоков: {total_blocks}")
    print(f"   Блоков на фрагмент: {blocks_per_fragment}")
    
    # Создаем директорию для фрагментов этой карты
    card_fragments_dir = Path(output_base_dir) / f"card_{card_id}"
    card_fragments_dir.mkdir(parents=True, exist_ok=True)
    
    # Создаем карту всех блоков и перемешиваем
    all_blocks = [(bh, bw) for bh in range(blocks_h) for bw in range(blocks_w)]
    random.shuffle(all_blocks)
    
    # Распределяем блоки по фрагментам
    fragment_blocks = [[] for _ in range(num_fragments)]
    
    for frag_num in range(num_fragments):
        start = frag_num * blocks_per_fragment
        end = min(start + blocks_per_fragment, total_blocks)
        
        for idx in range(start, end):
            if idx < len(all_blocks):
                bh, bw = all_blocks[idx]
                fragment_blocks[frag_num].append((bh, bw))
    
    # Создаем изображения для каждого фрагмента
    created_fragments = []
    
    for frag_num in range(num_fragments):
        # Создаем пустое изображение
        fragment_img = np.zeros((height, width, 4), dtype=np.uint8)
        
        # Добавляем блоки этого фрагмента
        for bh, bw in fragment_blocks[frag_num]:
            y_start = bh * block_h
            y_end = min(y_start + block_h, height)
            x_start = bw * block_w
            x_end = min(x_start + block_w, width)
            
            fragment_img[y_start:y_end, x_start:x_end] = original_array[y_start:y_end, x_start:x_end]
        
        # Сохраняем фрагмент
        fragment_image = Image.fromarray(fragment_img, 'RGBA')
        fragment_path = card_fragments_dir / f"fragment_{frag_num + 1}.png"
        fragment_image.save(fragment_path)
        
        # Создаем миниатюру
        thumbnail = fragment_image.copy()
        thumbnail.thumbnail((300, 300))
        thumb_path = card_fragments_dir / f"thumb_{frag_num + 1}.png"
        thumbnail.save(thumb_path)
        
        # Сохраняем информацию о фрагменте
        created_fragments.append({
            'number': frag_num + 1,
            'path': str(fragment_path),
            'blocks_count': len(fragment_blocks[frag_num])
        })
        
        if (frag_num + 1) % 5 == 0:  # Печатаем прогресс каждые 5 фрагментов
            print(f"   ✅ Создано {frag_num + 1}/{num_fragments} фрагментов")
    
    # Сохраняем информацию о распределении
    info_path = card_fragments_dir / "distribution_info.txt"
    with open(info_path, 'w', encoding='utf-8') as f:
        f.write(f"ID карты: {card_id}\n")
        f.write(f"Размер изображения: {width}x{height}\n")
        f.write(f"Процент блока: {block_percent}%\n")
        f.write(f"Размер блока: {block_w}x{block_h} пикселей\n")
        f.write(f"Всего блоков: {total_blocks}\n")
        f.write(f"Всего фрагментов: {num_fragments}\n")
        f.write(f"Блоков на фрагмент: {blocks_per_fragment}\n\n")
        f.write("Распределение блоков по фрагментам:\n")
        for frag in created_fragments:
            f.write(f"Фрагмент {frag['number']}: {frag['blocks_count']} блоков\n")
    
    print(f"   ✅ Завершено: {len(created_fragments)} фрагментов создано")
    return created_fragments

def scan_and_create_fragments(cards_dir="static/cards", block_percent=8, num_fragments=20):
    """
    Сканирует папку с картами и создает фрагменты для каждой
    """
    cards_path = Path(cards_dir)
    
    if not cards_path.exists():
        print(f"❌ Директория {cards_dir} не найдена!")
        return []
    
    # Поддерживаемые форматы изображений
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    
    # Находим все изображения карт
    card_images = []
    for ext in image_extensions:
        card_images.extend(cards_path.glob(f"*{ext}"))
        card_images.extend(cards_path.glob(f"*{ext.upper()}"))
    
    if not card_images:
        print(f"❌ Не найдено изображений в {cards_dir}")
        return []
    
    print(f"🖼️ Найдено {len(card_images)} карт")
    print(f"🔧 Настройки: блок = {block_percent}%, фрагментов = {num_fragments}")
    print("="*60)
    
    results = []
    
    for idx, img_path in enumerate(card_images, 1):
        print(f"\n📄 [{idx}/{len(card_images)}] Обработка: {img_path.name}")
        
        # Извлекаем имя карты из имени файла (без расширения)
        card_name = img_path.stem
        
        # Проверяем, существует ли уже карта в БД с таким именем
        card = Card.query.filter_by(name=card_name).first()
        
        if not card:
            print(f"   ⚠️ Карта '{card_name}' не найдена в БД, создаем новую...")
            
            # Определяем редкость на основе имени файла или папки
            rarity = "Обычная"
            if "legend" in img_path.name.lower() or "легенд" in img_path.name.lower():
                rarity = "Легендарная"
            elif "epic" in img_path.name.lower() or "эпич" in img_path.name.lower():
                rarity = "Эпическая"
            elif "rare" in img_path.name.lower() or "редк" in img_path.name.lower():
                rarity = "Редкая"
            
            card = Card(
                name=card_name,
                vers_id=1,
                rarity=rarity,
                photo_path=str(img_path)
            )
            db.session.add(card)
            db.session.flush()  # Получаем ID карты
            print(f"   ✅ Создана новая карта с ID {card.id}, редкость: {rarity}")
        else:
            print(f"   ✅ Найдена существующая карта с ID {card.id}")
        
        # Удаляем старые фрагменты этой карты (если есть)
        old_fragments = Fragment.query.filter_by(card_id=card.id).all()
        if old_fragments:
            for fragment in old_fragments:
                # Удаляем файлы фрагментов
                fragment_path = Path(fragment.photo_path)
                if fragment_path.exists():
                    fragment_path.unlink()
                db.session.delete(fragment)
            db.session.commit()
            print(f"   🗑️ Удалено старых фрагментов: {len(old_fragments)}")
        
        # Создаем новые фрагменты
        fragments_data = create_fragments_for_card(
            image_path=str(img_path),
            card_id=card.id,
            block_percent=block_percent,
            num_fragments=num_fragments,
            output_base_dir="static/fragments"
        )
        
        # Сохраняем фрагменты в БД
        for frag_data in fragments_data:
            fragment = Fragment(
                card_id=card.id,
                fragment_number=frag_data['number'],
                photo_path=frag_data['path']
            )
            db.session.add(fragment)
        
        db.session.commit()
        print(f"   💾 Сохранено {len(fragments_data)} фрагментов в БД")
        
        results.append({
            'card_id': card.id,
            'card_name': card_name,
            'fragments_count': len(fragments_data),
            'fragments': fragments_data
        })
    
    return results

def create_summary_report(results, block_percent=8):
    """Создает отчет о создании фрагментов"""
    summary_path = Path("static/fragments") / f"summary_report_{block_percent}percent.txt"
    summary_path.parent.mkdir(exist_ok=True)
    
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write("="*80 + "\n")
        f.write(f"ОТЧЕТ О СОЗДАНИИ ФРАГМЕНТОВ (блок = {block_percent}%)\n")
        f.write("="*80 + "\n\n")
        
        total_fragments = 0
        for result in results:
            f.write(f"Карта: {result['card_name']} (ID: {result['card_id']})\n")
            f.write(f"Фрагментов: {result['fragments_count']}\n")
            f.write("Распределение блоков:\n")
            for frag in result['fragments']:
                f.write(f"  - Фрагмент {frag['number']}: {frag['blocks_count']} блоков\n")
                total_fragments += 1
            f.write("\n" + "-"*40 + "\n\n")
        
        f.write(f"\n✅ Всего обработано карт: {len(results)}\n")
        f.write(f"✅ Всего создано фрагментов: {total_fragments}\n")
    
    print(f"\n📊 Отчет сохранен: {summary_path}")
    return summary_path

# ============== ЗАПУСК ==============

if __name__ == "__main__":
    # Создаем контекст Flask приложения
    app = create_app()
    
    with app.app_context():
        # Создаем таблицы если их нет
        db.create_all()
        
        # Проверяем наличие необходимых директорий
        CARDS_DIR = "static/cards"
        FRAGMENTS_DIR = "static/fragments"
        
        # Создаем директории если их нет
        Path(CARDS_DIR).mkdir(parents=True, exist_ok=True)
        Path(FRAGMENTS_DIR).mkdir(parents=True, exist_ok=True)
        
        # Параметры
        BLOCK_PERCENT = 8  # Размер блока = 8% от размера картинки
        NUM_FRAGMENTS = 20  # Количество фрагментов
        
        print("="*60)
        print("🚀 ЗАПУСК СКРИПТА СОЗДАНИЯ ФРАГМЕНТОВ")
        print("="*60)
        print(f"📁 Карты: {CARDS_DIR}")
        print(f"📁 Фрагменты: {FRAGMENTS_DIR}")
        print(f"🔧 Размер блока: {BLOCK_PERCENT}% от изображения")
        print(f"🔧 Фрагментов на карту: {NUM_FRAGMENTS}")
        print("="*60)
        
        # Создаем фрагменты для всех карт
        results = scan_and_create_fragments(
            cards_dir=CARDS_DIR,
            block_percent=BLOCK_PERCENT,
            num_fragments=NUM_FRAGMENTS
        )
        
        # Создаем отчет
        if results:
            create_summary_report(results, BLOCK_PERCENT)
            
            print("\n" + "="*60)
            print("🎉 ГОТОВО!")
            print("="*60)
            print(f"\n✅ Обработано карт: {len(results)}")
            total_frags = sum(r['fragments_count'] for r in results)
            print(f"✅ Создано фрагментов: {total_frags}")
            print(f"✅ Размер блока: {BLOCK_PERCENT}% от размера каждого изображения")
            print("\n📁 Фрагменты сохранены в: static/fragments/card_{ID}/")
            print("📊 Отчет: static/fragments/summary_report.txt")
        else:
            print("\n❌ Не удалось создать фрагменты.")