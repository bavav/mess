import os
from pathlib import Path
from PIL import Image
import shutil
from collections import Counter

def analyze_images_size(cards_dir="static/cards"):
    """Анализирует все изображения"""
    cards_path = Path(cards_dir)
    
    if not cards_path.exists():
        print(f"❌ Директория {cards_dir} не найдена!")
        return None, None
    
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    images = []
    for ext in image_extensions:
        images.extend(cards_path.glob(f"*{ext}"))
        images.extend(cards_path.glob(f"*{ext.upper()}"))
    
    if not images:
        print(f"❌ Не найдено изображений в {cards_dir}")
        return None, None
    
    print(f"\n📊 АНАЛИЗ {len(images)} ИЗОБРАЖЕНИЙ")
    print("="*60)
    
    size_counter = Counter()
    ratio_counter = Counter()
    
    for img_path in images:
        with Image.open(img_path) as img:
            width, height = img.size
            ratio = width / height
            size_counter[(width, height)] += 1
            ratio_counter[round(ratio, 2)] += 1
            
            print(f"📷 {img_path.name:35} | {width:4}x{height:4} | соотношение: {ratio:.2f}")
    
    print("\n" + "="*60)
    print("📈 СТАТИСТИКА:")
    print("="*60)
    
    print(f"\n🔹 Размеры изображений:")
    for size, count in size_counter.most_common(5):
        print(f"   {size[0]}x{size[1]} : {count} шт. ({count/len(images)*100:.1f}%)")
    
    print(f"\n🔹 Соотношения сторон (ширина/высота):")
    for ratio, count in ratio_counter.most_common(5):
        print(f"   {ratio:.2f} : {count} шт. ({count/len(images)*100:.1f}%)")
    
    most_common_ratio = ratio_counter.most_common(1)[0][0]
    print(f"\n⭐ САМОЕ ЧАСТОЕ СООТНОШЕНИЕ: {most_common_ratio:.2f}")
    
    return most_common_ratio, {
        'images_count': len(images),
        'size_counter': size_counter,
        'ratio_counter': ratio_counter,
    }

def resize_with_padding_preserve_side(image_path, target_ratio=1.0):
    """
    Добавляет поля, сохраняя одну сторону НЕТРОНУТОЙ
    
    Логика:
    - Если карта квадратная (1:1) - не трогаем вообще
    - Если карта портретная (высота > ширины) - добавляем поля по бокам
    - Если карта альбомная (ширина > высоты) - добавляем поля сверху/снизу
    
    Args:
        image_path: путь к изображению
        target_ratio: целевое соотношение (ширина/высота)
    
    Returns:
        обработанное изображение
    """
    img = Image.open(image_path).convert('RGBA')
    original_width, original_height = img.size
    original_ratio = original_width / original_height
    
    print(f"      Исходный размер: {original_width}x{original_height} (соотношение: {original_ratio:.2f})")
    
    # Если соотношение уже соответствует целевому - не трогаем
    if abs(original_ratio - target_ratio) < 0.01:
        print(f"      ✅ Соотношение уже правильное, размер не меняется")
        return img
    
    # Определяем новые размеры (сохраняем одну сторону нетронутой)
    if original_ratio > target_ratio:
        # Карта шире целевого соотношения -> добавляем поля сверху/снизу
        # Сохраняем ширину нетронутой, увеличиваем высоту
        new_width = original_width
        new_height = int(new_width / target_ratio)
        print(f"      ➕ Добавляем поля сверху/снизу: {new_width}x{new_height}")
    else:
        # Карта уже целевого соотношения или уже -> добавляем поля по бокам
        # Сохраняем высоту нетронутой, увеличиваем ширину
        new_height = original_height
        new_width = int(new_height * target_ratio)
        print(f"      ➕ Добавляем поля по бокам: {new_width}x{new_height}")
    
    # Создаем холст с новым размером (прозрачный фон)
    canvas = Image.new('RGBA', (new_width, new_height), (0, 0, 0, 0))
    
    # Центрируем оригинальное изображение на холсте
    left = (new_width - original_width) // 2
    top = (new_height - original_height) // 2
    
    canvas.paste(img, (left, top))
    
    print(f"      Результат: {new_width}x{new_height} (соотношение: {new_width/new_height:.2f})")
    
    return canvas

def resize_with_crop_preserve_content(image_path, target_ratio=1.0):
    """
    Обрезает изображение до целевого соотношения, сохраняя максимальную область
    
    Args:
        image_path: путь к изображению
        target_ratio: целевое соотношение (ширина/высота)
    """
    img = Image.open(image_path).convert('RGBA')
    original_width, original_height = img.size
    original_ratio = original_width / original_height
    
    print(f"      Исходный размер: {original_width}x{original_height} (соотношение: {original_ratio:.2f})")
    
    # Если соотношение уже правильное
    if abs(original_ratio - target_ratio) < 0.01:
        print(f"      ✅ Соотношение уже правильное, размер не меняется")
        return img
    
    # Определяем область обрезки (центрируем)
    if original_ratio > target_ratio:
        # Слишком широкое - обрезаем по ширине
        new_width = int(original_height * target_ratio)
        left = (original_width - new_width) // 2
        right = left + new_width
        cropped_img = img.crop((left, 0, right, original_height))
        print(f"      ✂️ Обрезаем по ширине: {new_width}x{original_height}")
    else:
        # Слишком высокое - обрезаем по высоте
        new_height = int(original_width / target_ratio)
        top = (original_height - new_height) // 2
        bottom = top + new_height
        cropped_img = img.crop((0, top, original_width, bottom))
        print(f"      ✂️ Обрезаем по высоте: {original_width}x{new_height}")
    
    print(f"      Результат: {cropped_img.size[0]}x{cropped_img.size[1]} (соотношение: {cropped_img.size[0]/cropped_img.size[1]:.2f})")
    
    return cropped_img

def normalize_card_images(
    cards_dir="static/cards",
    method="padding",  # "crop" или "padding"
    target_ratio=1.0,  # целевое соотношение
    convert_to_png=True,
    backup_original=True,
    create_preview=True
):
    """
    Приводит все карты к единому соотношению сторон
    
    Важно: при методе "padding" одна из сторон остается НЕТРОНУТОЙ!
    """
    cards_path = Path(cards_dir)
    
    if not cards_path.exists():
        print(f"❌ Директория {cards_dir} не найдена!")
        return False
    
    print(f"\n🎯 Целевое соотношение: {target_ratio:.2f}")
    print(f"🔧 Метод: {'Добавление полей' if method == 'padding' else 'Обрезка'}")
    
    # Создаем папку для бэкапов
    if backup_original:
        backup_dir = cards_path / "backup_original"
        backup_dir.mkdir(exist_ok=True)
        print(f"💾 Бэкапы: {backup_dir}")
    
    # Создаем папку для превью
    if create_preview:
        preview_dir = cards_path / "normalization_preview"
        preview_dir.mkdir(exist_ok=True)
        print(f"👁️ Превью: {preview_dir}")
    
    print("\n🔄 НАЧАЛО НОРМАЛИЗАЦИИ")
    print("="*60)
    
    processed_count = 0
    skipped_count = 0
    errors = []
    
    # Получаем все изображения
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    images = []
    for ext in image_extensions:
        images.extend(cards_path.glob(f"*{ext}"))
        images.extend(cards_path.glob(f"*{ext.upper()}"))
    
    for img_path in sorted(images):
        # Пропускаем служебные папки
        if img_path.name.startswith("backup_") or img_path.name.startswith("normalization_"):
            continue
        
        print(f"\n📷 {img_path.name}")
        
        try:
            # Проверяем текущее соотношение
            with Image.open(img_path) as test_img:
                w, h = test_img.size
                current_ratio = w / h
            
            # Если соотношение уже правильное и не нужно конвертировать в PNG
            if abs(current_ratio - target_ratio) < 0.01 and (not convert_to_png or img_path.suffix.lower() == '.png'):
                print(f"   ⏭️ Пропускаем (уже правильное соотношение и формат)")
                skipped_count += 1
                continue
            
            # Бэкап оригинала
            if backup_original:
                backup_path = backup_dir / img_path.name
                if not backup_path.exists():
                    shutil.copy2(img_path, backup_path)
                    print(f"   💾 Бэкап создан")
            
            # Нормализуем изображение
            if method == "crop":
                normalized_img = resize_with_crop_preserve_content(img_path, target_ratio)
            else:  # padding
                normalized_img = resize_with_padding_preserve_side(img_path, target_ratio)
            
            # Определяем путь для сохранения
            if convert_to_png:
                output_path = img_path.with_suffix('.png')
            else:
                output_path = img_path
            
            # Сохраняем результат
            normalized_img.save(output_path, 'PNG')
            
            # Удаляем оригинал если это был не PNG и мы конвертировали
            if convert_to_png and img_path.suffix.lower() != '.png' and output_path != img_path:
                if img_path.exists():
                    img_path.unlink()
                    print(f"   🗑️ Оригинал удален")
            
            # Создаем превью
            if create_preview:
                preview_path = preview_dir / f"{output_path.stem}.png"
                preview_img = normalized_img.copy()
                preview_img.thumbnail((300, 300))
                preview_img.save(preview_path)
            
            processed_count += 1
            print(f"   ✅ Сохранено: {output_path.name}")
            
        except Exception as e:
            error_msg = f"{img_path.name}: {str(e)}"
            errors.append(error_msg)
            print(f"   ❌ Ошибка: {e}")
    
    # Выводим результаты
    print("\n" + "="*60)
    print("📊 РЕЗУЛЬТАТЫ НОРМАЛИЗАЦИИ")
    print("="*60)
    print(f"✅ Обработано: {processed_count}")
    print(f"⏭️ Пропущено: {skipped_count}")
    print(f"📊 Всего: {len(images)}")
    
    if errors:
        print(f"❌ Ошибок: {len(errors)}")
        for error in errors[:5]:
            print(f"   - {error}")
    
    # Повторный анализ после нормализации
    if processed_count > 0:
        print("\n🔍 ПОВТОРНЫЙ АНАЛИЗ ПОСЛЕ НОРМАЛИЗАЦИИ")
        analyze_images_size(cards_dir)
    
    return True

def interactive_normalization():
    """Интерактивный режим нормализации"""
    print("🎨 НОРМАЛИЗАЦИЯ КАРТ (СОХРАНЯЕМ ОДНУ СТОРОНУ НЕТРОНУТОЙ)")
    print("="*60)
    
    # Анализируем текущие карты
    most_common_ratio, stats = analyze_images_size("static/cards")
    
    print("\n" + "="*60)
    print("⚙️ НАСТРОЙКИ")
    print("="*60)
    
    # Выбор метода
    print("\n📌 Метод нормализации:")
    print("1. Добавление полей (padding) - НЕ обрезает, добавляет поля")
    print("   → Одна сторона остается нетронутой")
    print("2. Обрезка (crop) - обрезает до нужного соотношения")
    print("   → Сохраняется максимальная область")
    
    method_choice = input("\nВаш выбор (1/2): ").strip()
    method = "padding" if method_choice == "1" else "crop"
    
    # Выбор соотношения
    print(f"\n📐 Целевое соотношение сторон (сейчас самое частое: {most_common_ratio:.2f}):")
    print("1. Квадрат (1:1)")
    print("2. Портрет (3:4 = 0.75)")
    print("3. Альбомный (4:3 = 1.33)")
    print(f"4. Оставить как есть ({most_common_ratio:.2f})")
    print("5. Своё значение")
    
    ratio_choice = input("\nВаш выбор (1-5): ").strip()
    
    if ratio_choice == "1":
        target_ratio = 1.0
        print(f"✅ Выбрано: квадрат (1:1)")
    elif ratio_choice == "2":
        target_ratio = 0.75
        print(f"✅ Выбрано: портрет (3:4)")
    elif ratio_choice == "3":
        target_ratio = 1.333
        print(f"✅ Выбрано: альбомный (4:3)")
    elif ratio_choice == "4":
        target_ratio = most_common_ratio
        print(f"✅ Выбрано: {target_ratio:.2f} (как у большинства карт)")
    else:
        try:
            target_ratio = float(input("Введите соотношение (ширина/высота): "))
            print(f"✅ Выбрано: {target_ratio:.2f}")
        except:
            print("❌ Некорректный ввод, использую квадрат 1:1")
            target_ratio = 1.0
    
    # Дополнительные опции
    print("\n💾 Дополнительные опции:")
    convert_to_png = input("Конвертировать все в PNG? (y/n, по умолчанию y): ").strip().lower() != 'n'
    backup = input("Создать бэкапы оригиналов? (y/n, по умолчанию y): ").strip().lower() != 'n'
    
    # Запускаем нормализацию
    print("\n" + "="*60)
    print("🚀 ЗАПУСК НОРМАЛИЗАЦИИ")
    print("="*60)
    
    normalize_card_images(
        cards_dir="static/cards",
        method=method,
        target_ratio=target_ratio,
        convert_to_png=convert_to_png,
        backup_original=backup,
        create_preview=True
    )
    
    print("\n" + "="*60)
    print("💡 СОВЕТЫ:")
    print("1. Проверьте превью в static/cards/normalization_preview/")
    print("2. Если всё хорошо, удалите бэкапы: rm -rf static/cards/backup_original")
    print("3. Затем запустите скрипт создания фрагментов")
    print("="*60)

# ============== ЗАПУСК ==============

if __name__ == "__main__":
    cards_dir = Path("static/cards")
    
    if not cards_dir.exists():
        print(f"❌ Директория {cards_dir} не найдена!")
        cards_dir.mkdir(parents=True, exist_ok=True)
        print(f"✅ Создана директория: {cards_dir}")
        print("Поместите изображения карт в эту папку и запустите скрипт снова")
        exit()
    
    interactive_normalization()