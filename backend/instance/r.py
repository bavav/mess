import sqlite3
import sys
from typing import List, Tuple

def get_all_tables(cursor: sqlite3.Cursor) -> List[str]:
    """Получить список всех таблиц в базе данных (исключая системные таблицы sqlite_)"""
    cursor.execute("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)
    return [row[0] for row in cursor.fetchall()]

def get_table_info(cursor: sqlite3.Cursor, table_name: str) -> List[Tuple[str, str]]:
    """Получить информацию о столбцах таблицы"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [(col[1], col[2]) for col in cursor.fetchall()]

def get_table_data(cursor: sqlite3.Cursor, table_name: str) -> List[Tuple]:
    """Получить все данные из таблицы"""
    cursor.execute(f"SELECT * FROM {table_name}")
    return cursor.fetchall()

def display_table_data(cursor: sqlite3.Cursor, table_name: str):
    """Отобразить данные таблицы в удобном формате"""
    print(f"\n{'='*80}")
    print(f"Таблица: {table_name}")
    print(f"{'='*80}")
    
    # Получаем информацию о столбцах и данные
    columns = get_table_info(cursor, table_name)
    data = get_table_data(cursor, table_name)
    
    if not columns:
        print("Нет информации о столбцах")
        return
    
    column_names = [col[0] for col in columns]
    column_types = [col[1] for col in columns]
    
    # Выводим заголовки
    print(f"\nСтруктура таблицы:")
    for col_name, col_type in zip(column_names, column_types):
        print(f"  • {col_name} ({col_type})")
    
    # Выводим данные
    print(f"\nДанные (всего записей: {len(data)}):")
    
    if not data:
        print("  Таблица пуста")
        return
    
    # Определяем максимальную ширину для каждого столбца
    col_widths = []
    for i, col_name in enumerate(column_names):
        max_width = len(col_name)
        for row in data:
            cell_value = str(row[i]) if row[i] is not None else "NULL"
            max_width = max(max_width, len(cell_value))
        col_widths.append(min(max_width, 50))  # Ограничиваем ширину 50 символов
    
    # Создаем горизонтальную линию
    separator = "+" + "+".join(["-" * (width + 2) for width in col_widths]) + "+"
    
    # Выводим заголовки
    print(separator)
    header = "|"
    for i, col_name in enumerate(column_names):
        # Обрезаем длинные имена
        display_name = col_name[:col_widths[i]]
        header += f" {display_name:<{col_widths[i]}} |"
    print(header)
    print(separator)
    
    # Выводим строки данных
    for row in data:
        row_str = "|"
        for i, value in enumerate(row):
            if value is None:
                display_value = "NULL"
            else:
                display_value = str(value)
                if len(display_value) > col_widths[i]:
                    display_value = display_value[:col_widths[i]-3] + "..."
            row_str += f" {display_value:<{col_widths[i]}} |"
        print(row_str)
    
    print(separator)

def main():
    """Основная функция"""
    # Запрашиваем путь к файлу базы данных
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = input("Введите путь к SQLite файлу базы данных: ").strip()
    
    if not db_path:
        print("Ошибка: путь к базе данных не указан")
        sys.exit(1)
    
    try:
        # Подключаемся к базе данных
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print(f"\nБаза данных: {db_path}")
        print(f"SQLite версия: {sqlite3.sqlite_version}")
        
        # Получаем все таблицы
        tables = get_all_tables(cursor)
        
        if not tables:
            print("\nВ базе данных нет пользовательских таблиц")
            conn.close()
            return
        
        print(f"\nНайдено таблиц: {len(tables)}")
        
        # Отображаем данные для каждой таблицы
        for table in tables:
            try:
                display_table_data(cursor, table)
            except Exception as e:
                print(f"\nОшибка при отображении таблицы '{table}': {e}")
        
        conn.close()
        
    except sqlite3.Error as e:
        print(f"Ошибка SQLite: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print(f"Ошибка: файл '{db_path}' не найден")
        sys.exit(1)
    except Exception as e:
        print(f"Непредвиденная ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()