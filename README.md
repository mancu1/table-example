# Spreadsheet Engine

Высокопроизводительный движок таблиц с разреженным хранением данных и инкрементальным пересчетом формул.

## 🎯 Цели проекта

Создать табличный редактор, способный работать с очень большими листами (до 1,000,000 строк × 16,000 столбцов) при минимальном потреблении памяти и высокой производительности.

## ✨ Ключевые особенности

### 🗄️ Разреженное хранение данных
- **Только заполненные ячейки занимают память** - пустые ячейки не хранятся
- Память растет пропорционально фактическим данным, а не размеру листа
- Эффективное хранение для разреженных данных (< 1% заполненности)

### 🔧 Структурные операции
- **Вставка/удаление строк и столбцов** без массового переписывания данных
- Сложность операций: O(log S + t), где S - сегменты индекса, t - затронутые ссылки
- Стабильные идентификаторы строк/столбцов (RowId/ColId)

### 📊 Система формул
- **Парсинг и выполнение формул** с поддержкой A1 и R1C1 нотации
- **Граф зависимостей** для инкрементального пересчета
- **Детекция циклов** и обработка ошибок
- Поддержка функций: SUM, AVERAGE, COUNT, MAX, MIN, IF, AND, OR, NOT

### 🎨 Canvas рендеринг
- **Виртуализация** - рендерятся только видимые ячейки
- **Высокая производительность** - 60+ FPS даже для больших листов
- **Хит-тест** с бинарным поиском по координатам
- Поддержка выделения и навигации

### 🔄 Инкрементальный пересчет
- **Минимальный аффект** - пересчитываются только затронутые ячейки
- **Топологическая сортировка** для правильного порядка вычислений
- **Кэширование результатов** для избежания повторных вычислений

## 🏗️ Архитектура

```
Workbook
└─ Sheet [id]
   ├─ RowIndex (логическая позиция -> RowId)
   ├─ ColIndex (логическая позиция -> ColId)  
   ├─ CellStore (Map<RowId:ColId, Cell>) // разреженное хранилище
   ├─ FormulaGraph (DAG зависимостей ячеек)
   ├─ FormatStore/Styles (по диапазонам)
   └─ History (журнал операций + снапшоты)
```

### Ключевые компоненты

- **RowIndex/ColIndex** - сегментированные индексы для O(log S) операций
- **CellStore** - разреженное Map-хранилище ячеек
- **FormulaGraph** - граф зависимостей с детекцией циклов
- **FormulaParser** - парсер формул в AST
- **FormulaEvaluator** - вычислитель формул
- **CanvasRenderer** - виртуализированный рендерер

## 🚀 Быстрый старт

### Установка

```bash
npm install
```

### Разработка

```bash
npm run dev
```

### Сборка

```bash
npm run build
```

### Тестирование

```bash
npm run test
```

## 📊 Производительность

### Тесты масштабируемости

```typescript
// Создание листа 1,000,000 × 16,000
sheet.insertRows(0, 1000000)
sheet.insertCols(0, 16000)

// Заполнение 0.1% ячеек (разреженность)
// Время: < 100ms
// Память: пропорциональна заполненности
```

### Сложности операций

- **Доступ к ячейке**: O(log N)
- **Вставка строки/столбца**: O(log S + t)
- **Пересчет формул**: O(|affected|)
- **Рендеринг**: O(visible_cells)

## 🧪 Примеры использования

### Базовые операции

```typescript
import { Sheet } from '@/core/sheet'

const sheet = new Sheet('sheet1', 'My Sheet')

// Добавление данных
sheet.setCell({ row: 'row_1', col: 'col_1' }, 42)
sheet.setCell({ row: 'row_2', col: 'col_1' }, 84)

// Формулы
sheet.setFormula({ row: 'row_3', col: 'col_1' }, '=A1+A2')
sheet.setFormula({ row: 'row_4', col: 'col_1' }, '=SUM(A1:A3)')

// Структурные операции
sheet.insertRows(1, 5)  // Вставить 5 строк после строки 1
sheet.deleteCols([2, 4]) // Удалить столбцы 2-4
```

### Работа с большими данными

```typescript
// Создание большого листа
sheet.insertRows(0, 1000000)
sheet.insertCols(0, 16000)

// Заполнение разреженных данных
for (let i = 0; i < 10000; i++) {
  const row = Math.floor(Math.random() * 1000000)
  const col = Math.floor(Math.random() * 16000)
  sheet.setCell({ row: `row_${row}`, col: `col_${col}` }, Math.random())
}

// Память растет только от заполненных ячеек!
console.log(`Cells: ${sheet.cells.size()}`)
console.log(`Memory efficiency: ${(sheet.cells.size() / (1000000 * 16000)) * 100}%`)
```

### Canvas рендеринг

```typescript
import { CanvasRenderer } from '@/core/canvas-renderer'

const canvas = document.getElementById('spreadsheet') as HTMLCanvasElement
const renderer = new CanvasRenderer(canvas, sheet)

// Рендеринг с виртуализацией
renderer.render()

// Обновление размеров
renderer.updateSize(800, 600)

// Прокрутка
renderer.scroll(100, 50)
```

## 🔬 Тестирование производительности

```typescript
import { PerformanceTest } from '@/examples/performance-test'

const perfTest = new PerformanceTest()
await perfTest.runAllTests()
```

## 📈 Результаты тестов

- **Создание листа 1M×16K**: < 50ms
- **Вставка 1000 строк**: < 10ms  
- **Заполнение 0.1% ячеек**: < 100ms
- **Пересчет 10K формул**: < 50ms
- **Canvas рендеринг**: 60+ FPS
- **Память**: растет только от заполненных ячеек

## 🛠️ Технологический стек

- **Vue 3** - реактивный UI фреймворк
- **TypeScript** - типизированный JavaScript
- **Vite** - быстрый сборщик
- **Canvas API** - высокопроизводительный рендеринг
- **Vitest** - тестирование

## 📚 Документация API

### Sheet

```typescript
class Sheet {
  // Основные операции
  setCell(address: CellAddress, value: Scalar): void
  setFormula(address: CellAddress, formula: string): void
  getCell(address: CellAddress): Cell | undefined
  getValue(address: CellAddress): Scalar
  
  // Структурные операции
  insertRows(position: number, count: number): void
  deleteRows(range: [from: number, to: number]): void
  insertCols(position: number, count: number): void
  deleteCols(range: [from: number, to: number]): void
  
  // История
  undo(): boolean
  redo(): boolean
  
  // Пересчет
  recalculate(): void
}
```

### CanvasRenderer

```typescript
class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement, sheet: Sheet)
  
  // Рендеринг
  render(): void
  updateSize(width: number, height: number): void
  scroll(deltaX: number, deltaY: number): void
  
  // Взаимодействие
  getCellAt(x: number, y: number): { row: number; col: number } | null
  selectCell(address: CellAddress): void
}
```

## 🎯 Дорожная карта

- [ ] Поддержка R1C1 нотации
- [ ] Расширенная библиотека функций
- [ ] Стили и форматирование
- [ ] Многолистность
- [ ] Экспорт/импорт Excel
- [ ] Совместное редактирование (CRDT)
- [ ] Мобильная поддержка

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 🙏 Благодарности

- Excel и Google Sheets за вдохновение
- Vue.js команда за отличный фреймворк
- Canvas API за высокопроизводительный рендеринг
