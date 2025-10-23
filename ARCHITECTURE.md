# Архитектура табличного редактора

## Оглавление
- [Общая концепция](#общая-концепция)
- [Компоненты системы](#компоненты-системы)
- [Модель данных](#модель-данных)
- [Хранение данных](#хранение-данных)
- [Система якорей (Anchors)](#система-якорей-anchors)
- [Граф зависимостей](#граф-зависимостей)
- [Жизненный цикл операций](#жизненный-цикл-операций)
- [Алгоритмы и сложность](#алгоритмы-и-сложность)

---

## Общая концепция

### Проблема

Создать табличный редактор, который может работать с очень большими листами (до 1 000 000 × 16 000 ячеек), но при этом:
- Не тратить память на пустые ячейки
- Быстро вставлять/удалять строки и столбцы
- Корректно обрабатывать формулы при структурных изменениях
- Пересчитывать только изменившиеся формулы

### Решение

**Ключевая идея:** разделение **логических позиций** (что видит пользователь) и **физических идентификаторов** (что хранится внутри).

```
Позиции (1...N)  ←→  Стабильные ID (id0, id1, ...)
     ↓                        ↓
Что видит                Что хранит
пользователь             система
```

При вставке/удалении меняются только **маппинги позиция↔ID**, сами ячейки остаются неизменными.

---

## Компоненты системы

### 1. **CellStore** - хранилище ячеек

**Что делает:** хранит только заполненные ячейки в разреженной структуре.

**Структура:**
```typescript
class CellStore {
  private cells: Map<string, Cell>
  //              ↑           ↑
  //         "rowId:colId"  ячейка
}
```

**Ключ:** строка вида `"id5:id12"` - комбинация стабильных ID строки и столбца.

**Значение:** ячейка, которая может быть:
- **Value** - простое значение (число)
- **Formula** - формула с AST и кешированным результатом

**Пример:**
```javascript
{
  "id0:id0": { kind: "value", value: 10 },
  "id0:id1": { kind: "formula", ast: {...}, cached: 10 }
}
```

**Преимущества:**
- O(1) доступ к ячейке по ID
- Память растет только от заполненных ячеек
- Легко итерировать только по существующим ячейкам

### 2. **AxisIndex** - индексация позиций

**Что делает:** преобразует **позиции** (что видит пользователь) в **ID** (что хранится) и обратно.

**Структура:**
```typescript
interface Segment {
  startPos: number;   // С какой позиции начинается
  ids: AxisId[];      // Массив ID для этих позиций
}

class AxisIndex {
  private segments: Segment[] = [];
  private nextId = 0;
}
```

**Как работает:**

```
Инициализация: new AxisIndex(100)

segments = [
  {
    startPos: 1,
    ids: ["id0", "id1", "id2", ..., "id99"]
  }
]

Позиция 1 → id0
Позиция 2 → id1
...
Позиция 100 → id99
```

**При вставке:**
```typescript
// Вставить 2 строки на позицию 50
rows.insert(50, 2);

// Генерируются новые ID: id100, id101
// Вставляются в массив на нужную позицию
segments[0].ids.splice(49, 0, "id100", "id101");

// Теперь:
// Позиция 50 → id100 (новая)
// Позиция 51 → id101 (новая)
// Позиция 52 → id49 (была позиция 50)
```

**При удалении:**
```typescript
// Удалить строки 50-51
rows.remove({ from: 50, to: 51 });

// Удаляются из массива
segments[0].ids.splice(49, 2);

// ID сохраняются, но больше не маппятся на позиции
```

**Преимущества:**
- Вставка/удаление не перезаписывает ячейки
- O(log S) на поиск (где S - число сегментов, обычно 1)
- Стабильные ID не меняются

### 3. **DepGraph** - граф зависимостей

**Что делает:** отслеживает, какие формулы от каких ячеек зависят.

**Структура:**
```typescript
class DepGraph {
  // from -> set of to (кто зависит от from)
  private outgoing: Map<string, Set<string>>;
  
  // to -> set of from (от кого зависит to)
  private incoming: Map<string, Set<string>>;
}
```

**Пример:**
```
A1: 10
B1: =A1
C1: =SUM(A1:B1)

Граф:
outgoing = {
  "id0:id0": Set["id0:id1", "id0:id2"],  // A1 → B1, C1
  "id0:id1": Set["id0:id2"]              // B1 → C1
}

incoming = {
  "id0:id1": Set["id0:id0"],             // B1 ← A1
  "id0:id2": Set["id0:id0", "id0:id1"]   // C1 ← A1, B1
}
```

**Алгоритм пересчета:**
1. Изменилась ячейка A1
2. Находим всех зависимых: `affectedFrom({"id0:id0"})` → `{"id0:id0", "id0:id1", "id0:id2"}`
3. Топологически сортируем: A1 → B1 → C1
4. Пересчитываем в этом порядке

**Преимущества:**
- Пересчитываются только затронутые формулы
- O(affected + edges) - пропорционально числу реально изменившихся
- Автоматическая детекция циклов

### 4. **RangeWatchers** - наблюдатели диапазонов

**Что делает:** отслеживает, какие формулы наблюдают за диапазонами.

**Проблема:** `=SUM(A1:C3)` должна пересчитаться, если:
- Изменилась любая ячейка внутри A1:C3
- Появилась новая ячейка внутри диапазона

**Структура:**
```typescript
class RangeWatchers {
  // Ячейка → формулы, которые её наблюдают
  private watchers: Map<string, Set<string>>;
  
  // Формула → диапазоны, которые она наблюдает
  private formulaRanges: Map<string, RangeRef[]>;
}
```

**Пример:**
```
A5: =SUM(A1:C3)

При вычислении SUM:
1. Развернуть диапазон в список ячеек: A1, B1, C1, A2, B2, C2, A3, B3, C3
2. Добавить зависимости в DepGraph: A1→A5, B1→A5, ..., C3→A5
3. Зарегистрировать в watchers:
   watchers["id0:id0"] = Set["id4:id0"]  // A1 → A5
   watchers["id0:id1"] = Set["id4:id0"]  // B1 → A5
   ...
```

**При изменении B2:**
1. Смотрим `watchers.get("id1:id1")` → Set["id4:id0"]
2. Добавляем A5 в список на пересчет

**Преимущества:**
- Автоматическое отслеживание изменений в диапазонах
- Работает даже с новыми ячейками

---

## Модель данных

### Иерархия

```
Table
  └── Sheet
      ├── CellStore (cells)
      ├── AxisIndex (rows)
      ├── AxisIndex (cols)
      ├── DepGraph (deps)
      └── RangeWatchers (ranges)
```

### Типы данных

#### Address - физический адрес
```typescript
type Address = {
  row: RowId;  // "id5"
  col: ColId;  // "id12"
}
```
**Это стабильный адрес**, который не меняется при вставках/удалениях.

#### Position - логическая позиция
```typescript
type Position = {
  r: number;  // 1-based: 1, 2, 3, ...
  c: number;  // 1-based: 1, 2, 3, ...
}
```
**Это то, что видит пользователь**, может меняться при вставках/удалениях.

#### Cell - ячейка
```typescript
type Cell = 
  | { kind: 'value'; value: Scalar }
  | { kind: 'formula'; ast: Formula; cached?: Scalar }
```

#### Formula - формула
```typescript
type Formula =
  | { t: 'Ref'; ref: Anchor }          // =A1
  | { t: 'Sum'; range: RangeRef }      // =SUM(A1:C3)
```

#### Anchor - якорь ссылки
```typescript
type Anchor = {
  base: Address;           // Где стоит формула
  rowMode: 'rel' | 'abs';  // Относительная/абсолютная строка
  colMode: 'rel' | 'abs';  // Относительный/абсолютный столбец
  dRow: number;            // Смещение по строке
  dCol: number;            // Смещение по столбцу
}
```

**Ключевая концепция:** ссылка не хранит абсолютные координаты, а хранит **смещение от базы** и **режим**.

---

## Система якорей (Anchors)

### Зачем нужны якоря?

**Проблема:** при вставке строки формулы должны "сдвигаться" правильно.

```
ДО:
A1: 10
A2: =A1  ← ссылается на A1

Вставка строки на позицию 2

ПОСЛЕ:
A1: 10
A2: (пусто)
A3: =A1  ← должна по-прежнему ссылаться на A1!
```

**Наивное решение (не работает):**
```typescript
// Хранить абсолютную позицию
formula = { target: { row: 1, col: 1 } }

// При вставке нужно:
// 1. Найти ВСЕ формулы
// 2. Проверить, попадает ли цель после вставки
// 3. Скорректировать каждую
// = O(N) на каждую вставку, где N - число формул
```

**Решение через якоря:**
```typescript
// Хранить СМЕЩЕНИЕ от базы
anchor = {
  base: { row: "id1", col: "id0" },  // Где стоит формула (A2)
  rowMode: 'rel',                     // Относительная
  colMode: 'rel',
  dRow: -1,                           // На 1 строку выше
  dCol: 0                             // Тот же столбец
}
```

### Как работает якорь

#### Преобразование якоря в адрес
```typescript
function anchorToAddress(anchor: Anchor): Address {
  // 1. Узнаем текущую позицию базы
  const baseRowPos = rowAxis.idToPos(anchor.base.row);  // 2
  const baseColPos = colAxis.idToPos(anchor.base.col);  // 1
  
  // 2. Прибавляем смещение
  const targetRowPos = baseRowPos + anchor.dRow;  // 2 + (-1) = 1
  const targetColPos = baseColPos + anchor.dCol;  // 1 + 0 = 1
  
  // 3. Получаем ID целевой позиции
  const targetRowId = rowAxis.posToId(targetRowPos);  // "id0"
  const targetColId = colAxis.posToId(targetColPos);  // "id0"
  
  return { row: targetRowId, col: targetColId };  // A1
}
```

**Магия:** даже если база (формула) сдвинулась на новую позицию, смещение `dRow=-1` всё равно указывает на правильную ячейку!

### Трансформация якоря при вставке

```typescript
function transformAnchor(anchor: Anchor, splice: Splice): Anchor {
  // Splice: { axis: 'row', atPos: 2, ins: 1, del: 0 }
  // Вставить 1 строку на позицию 2
  
  const basePos = rowAxis.idToPos(anchor.base.row);  // 2 (формула в A2)
  const targetPos = basePos + anchor.dRow;           // 2 + (-1) = 1 (цель A1)
  
  if (anchor.rowMode === 'rel') {
    // Относительная ссылка
    
    // База сдвигается?
    if (basePos >= splice.atPos) {  // 2 >= 2 → да
      newBasePos = basePos + splice.ins;  // 2 + 1 = 3
    }
    
    // Цель сдвигается?
    if (targetPos >= splice.atPos) {  // 1 >= 2 → нет
      newTargetPos = targetPos;  // остается 1
    }
    
    // Новое смещение
    newDRow = newTargetPos - newBasePos;  // 1 - 3 = -2
    
    return {
      ...anchor,
      base: { row: "id2", col: "id0" },  // новая позиция базы
      dRow: -2                            // новое смещение
    };
  }
}
```

**Результат:**
```
ДО:
A2: =A1  (base=id1, dRow=-1)

Вставка строки 2

ПОСЛЕ:
A3: =A1  (base=id2, dRow=-2)
         ↑         ↑
    база сдвинулась, смещение скорректировалось
```

### Относительные vs Абсолютные

#### Относительная ссылка: `=A1`
```typescript
anchor = {
  rowMode: 'rel',
  colMode: 'rel',
  dRow: -1,
  dCol: 0
}
```
**Поведение:** и база, и цель сдвигаются при вставке → смещение корректируется, чтобы по-прежнему указывать на ту же ячейку.

#### Абсолютная ссылка: `=$A$1`
```typescript
anchor = {
  rowMode: 'abs',
  colMode: 'abs',
  dRow: -1,
  dCol: 0
}
```
**Поведение:** база сдвигается, но цель остается на месте → смещение корректируется так, чтобы указывать на фиксированную позицию 1.

#### Смешанная: `=$A1`
```typescript
anchor = {
  rowMode: 'rel',   // строка относительная
  colMode: 'abs',   // столбец абсолютный
  dRow: -1,
  dCol: 0
}
```
**Поведение:** при вставке строки - относительная, при вставке столбца - абсолютная.

---

## Граф зависимостей

### Построение графа

#### При установке формулы `=A1` в B1:

```typescript
// 1. Парсим формулу
const formula = parseFormula("=A1", { r: 1, c: 2 });
// → { t: 'Ref', ref: { base: {row:"id0",col:"id1"}, dRow:0, dCol:-1, ... }}

// 2. Находим зависимости
const targetAddr = anchorToAddress(formula.ref);
// → { row: "id0", col: "id0" }  (A1)

// 3. Проверяем на цикл
if (deps.wouldCreateCycle(targetAddr, formulaAddr)) {
  // Установить #CYCLE!
  return;
}

// 4. Добавляем ребро
deps.addEdge(targetAddr, formulaAddr);
// A1 → B1
```

#### При установке `=SUM(A1:A3)` в A4:

```typescript
// 1. Парсим
const formula = parseFormula("=SUM(A1:A3)", { r: 4, c: 1 });

// 2. Разворачиваем диапазон
const cells = expandRange(formula.range);
// → [A1, A2, A3]

// 3. Добавляем зависимости для КАЖДОЙ ячейки
for (const cell of cells) {
  deps.addEdge(cell, formulaAddr);
}
// A1 → A4
// A2 → A4
// A3 → A4

// 4. Регистрируем наблюдение диапазона
ranges.addWatch(formula.range, formulaAddr);
```

### Пересчет по графу

#### Алгоритм:

```typescript
function recalc(changed: Set<Address>) {
  // 1. Найти всех затронутых (BFS/DFS по графу)
  const affected = deps.affectedFrom(changed);
  // changed: {A1}
  // affected: {A1, B1, C1, D1, ...} - все транзитивно зависящие
  
  // 2. Топологическая сортировка
  const sorted = topologicalSort(affected);
  // [A1, B1, C1, D1] - сначала те, от кого зависят другие
  
  // 3. Пересчитываем в порядке зависимостей
  for (const key of sorted) {
    const cell = cells.get(key);
    if (cell.kind === 'formula') {
      cell.cached = evalFormula(cell.ast);
    }
  }
}
```

#### Пример:

```
Граф:
A1 ──→ B1 ──→ D1
 └───→ C1 ──→ D1

Изменение A1:
1. affected = {A1, B1, C1, D1}
2. sorted = [A1, B1, C1, D1]
3. Пересчет:
   - A1 (значение уже установлено)
   - B1 = eval(=A1) → читаем A1
   - C1 = eval(=A1) → читаем A1
   - D1 = eval(=SUM(B1:C1)) → читаем B1, C1
```

### Детекция циклов

```typescript
function wouldCreateCycle(from: Address, to: Address): boolean {
  // Проверяем: может ли TO достичь FROM по графу?
  // Если да, то добавление FROM→TO создаст цикл
  
  const visited = new Set();
  const queue = [to];
  
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === from) return true;  // Нашли путь TO→FROM
    
    if (visited.has(current)) continue;
    visited.add(current);
    
    const dependents = deps.getDependents(current);
    queue.push(...dependents);
  }
  
  return false;  // Пути нет
}
```

**Пример:**
```
A1: =B1
B1: =A1  ← попытка создать

Проверка при установке B1:=A1:
wouldCreateCycle(A1, B1)
  есть ли путь B1 → ... → A1?
  B1 → A1 (да, есть прямое ребро)
  → true (цикл!)
  
Устанавливаем B1: #CYCLE!
```

---

## Хранение данных

### В памяти

```
Лист 100×26, заполнено 5 ячеек:

CellStore:
{
  "id0:id0": { kind: "value", value: 10 },
  "id0:id1": { kind: "value", value: 20 },
  "id1:id0": { kind: "formula", ast: {...}, cached: 30 },
  "id1:id1": { kind: "formula", ast: {...}, cached: 50 },
  "id2:id0": { kind: "formula", ast: {...}, cached: 80 }
}

AxisIndex (rows):
{
  segments: [
    { startPos: 1, ids: ["id0", "id1", ..., "id99"] }
  ]
}

AxisIndex (cols):
{
  segments: [
    { startPos: 1, ids: ["id0", "id1", ..., "id25"] }
  ]
}

DepGraph:
{
  outgoing: {
    "id0:id0": Set["id1:id0"],        // A1 → A2
    "id0:id1": Set["id1:id0"],        // B1 → A2
    "id1:id0": Set["id1:id1"],        // A2 → B2
    ...
  },
  incoming: { ... }
}

Память:
- CellStore: 5 ячеек × ~100 байт = ~500 байт
- AxisIndex: 126 ID × ~20 байт = ~2.5 КБ
- DepGraph: зависит от числа ребер
ИТОГО: ~3-5 КБ (вместо 2600 ячеек × 100 байт = 260 КБ)
```

### Разреженность

```
Коэффициент заполнения = 5 / (100 × 26) = 0.19%

Память растет от ЗАПОЛНЕННЫХ, а не от РАЗМЕРА!
```

---

## Жизненный цикл операций

### 1. Установка значения: `table.setValue({r:1, c:1}, 10)`

```typescript
// 1. Преобразовать позицию в адрес
const addr = sheet.posToAddr({ r: 1, c: 1 });
// → { row: "id0", col: "id0" }

// 2. Удалить старые зависимости (если была формула)
if (oldCell?.kind === 'formula') {
  deps.removeAll(addr);
  ranges.removeWatches(addr);
}

// 3. Установить новое значение
cells.set(addr, { kind: 'value', value: 10 });

// 4. Пересчитать зависимые
const dirty = new Set([addressKey(addr)]);
recalc(dirty);
```

### 2. Установка формулы: `table.setFormula({r:2, c:1}, "=A1")`

```typescript
// 1. Преобразовать позицию
const addr = sheet.posToAddr({ r: 2, c: 1 });

// 2. Парсить формулу
const formula = parseFormula("=A1", { r: 2, c: 1 });
// → { t: 'Ref', ref: { base: addr, dRow: -1, ... } }

// 3. Собрать зависимости
const deps = collectDependencies(formula);
// → [{ row: "id0", col: "id0" }]  (A1)

// 4. Проверить циклы
for (const dep of deps) {
  if (wouldCreateCycle(dep, addr)) {
    cells.set(addr, { kind: 'formula', ast: formula, cached: '#CYCLE!' });
    return;
  }
}

// 5. Добавить зависимости
for (const dep of deps) {
  deps.addEdge(dep, addr);
}

// 6. Сохранить формулу
cells.set(addr, { kind: 'formula', ast: formula });

// 7. Вычислить
const dirty = new Set([addressKey(addr)]);
recalc(dirty);
```

### 3. Вставка строки: `table.insertRows(2, 1)`

```typescript
// КРИТИЧНО: порядок операций!

// 1. СНАЧАЛА трансформируем формулы (ДО обновления индексов!)
for (const [key, cell] of cells.entries()) {
  if (cell.kind !== 'formula') continue;
  
  const newAst = transformFormula(
    cell.ast,
    { axis: 'row', atPos: 2, ins: 1, del: 0 }
  );
  
  cells.set(addr, { ...cell, ast: newAst });
}

// 2. ПОТОМ обновляем индексы
rows.insert(2, 1);  // Создает новый ID: "id100"

// Теперь:
// Позиция 1 → id0
// Позиция 2 → id100 (новая!)
// Позиция 3 → id1 (была позиция 2)

// 3. Пересчитываем затронутые
const dirty = ... // формулы, которые трансформировались
recalc(dirty);
```

**Почему порядок важен:**
- `transformAnchor` использует `idToPos()` для получения текущих позиций
- Если сначала обновить индексы, `idToPos()` вернет новые позиции
- Трансформация применится дважды (двойное смещение)!

### 4. Получение значения: `table.getValue({r:1, c:1})`

```typescript
// 1. Преобразовать позицию в адрес
const addr = sheet.posToAddr({ r: 1, c: 1 });

// 2. Получить ячейку
const cell = cells.get(addr);

// 3. Вернуть значение
if (cell.kind === 'value') {
  return cell.value;
} else {
  return cell.cached;  // Кешированный результат формулы
}
```

---

## Алгоритмы и сложность

### Доступ к ячейке

```typescript
getValue(pos: Position): Scalar
```

**Сложность:**
1. `posToAddr(pos)`: O(log S) где S - число сегментов
   - В нашем случае S=1, поэтому O(1)
2. `cells.get(addr)`: O(1) - Map lookup

**Итого: O(1)** в типичном случае

### Установка значения

```typescript
setValue(pos: Position, value: number): void
```

**Сложность:**
1. `posToAddr(pos)`: O(1)
2. `cells.set(addr, cell)`: O(1)
3. `recalc(dirty)`: O(|affected| + |edges|)
   - Пропорционально числу формул, зависящих от этой ячейки

**Итого: O(1 + affected formulas)**

### Вставка строк/столбцов

```typescript
insertRows(atPos: number, count: number): void
```

**Сложность:**
1. Трансформация формул: O(F) где F - число формул
   - Каждая формула трансформируется один раз
   - O(1) на формулу
2. Обновление индекса: O(log S + N) где N - число ID в сегменте
   - В нашем случае S=1, N=100, поэтому O(100)
3. Пересчет: O(|affected| + |edges|)

**Итого: O(F + affected formulas)**

**Важно:** НЕ O(total cells)! Трансформируются только формулы, не все ячейки.

### Пересчет формул

```typescript
recalc(dirty: Set<Address>): void
```

**Сложность:**
1. `affectedFrom(dirty)`: O(V + E) BFS/DFS по графу
   - V = число затронутых узлов
   - E = число ребер между ними
2. `topologicalSort(affected)`: O(V + E)
3. Вычисление каждой формулы:
   - Ref: O(1)
   - Sum: O(R) где R - число ячеек в диапазоне
     - Но только заполненных! Пустые не итерируются

**Итого: O(V + E + ΣR)** где ΣR - сумма размеров диапазонов

### Память

```
Пустая таблица 1M × 16K:
- CellStore: 0 (нет ячеек)
- AxisIndex (rows): 1M ID × 20 байт = 20 МБ
- AxisIndex (cols): 16K ID × 20 байт = 320 КБ
ИТОГО: ~20 МБ

Заполненная на 1% таблица:
- CellStore: 160K ячеек × 100 байт = 16 МБ
- AxisIndex: 20 МБ (не меняется)
- DepGraph: ~зависит от формул, ~5-10 МБ
ИТОГО: ~40-50 МБ

Рост памяти = O(filled cells + formulas)
```

---

## Оптимизации

### Текущие

1. **Разреженное хранение** - Map вместо массива
2. **Стабильные ID** - вставка без перезаписи
3. **Якоря** - ленивая трансформация ссылок
4. **Инкрементальный пересчет** - только измененные
5. **Кеширование** - результаты формул сохраняются

### Возможные улучшения

1. **Обратный индекс ID→Pos**
   - Сейчас: O(N) где N - число ID в сегменте
   - С индексом: O(1)
   - Компромисс: память vs скорость

2. **B-дерево для AxisIndex**
   - Сейчас: линейный массив сегментов
   - С B-деревом: O(log N) для больших листов
   - Полезно для реально больших листов

3. **Dirty regions вместо dirty cells**
   - Сейчас: отслеживаем каждую ячейку
   - С регионами: отслеживаем диапазоны
   - Полезно при массовых изменениях

4. **Виртуализация для UI**
   - Сейчас: рендерим все видимые ячейки
   - С виртуализацией: рендерим только то, что на экране
   - Критично для больших таблиц

5. **Web Workers для пересчета**
   - Сейчас: синхронный пересчет
   - С Workers: параллельный пересчет
   - Полезно для сложных формул

---

## Заключение

### Ключевые принципы

1. **Разделение concern**: позиции ≠ идентификаторы
2. **Immutability ID**: ID не меняются, меняются только маппинги
3. **Lazy evaluation**: трансформация якорей "на лету"
4. **Incremental computation**: пересчет только измененных
5. **Sparse is fast**: память только для реальных данных

### Что делает систему масштабируемой

✅ **O(filled)** память, а не O(rows × cols)  
✅ **O(log S)** доступ к ячейке, где S обычно 1  
✅ **O(affected)** пересчет, а не O(all formulas)  
✅ **O(formulas)** трансформация при вставке, а не O(all cells)  

### Что можно масштабировать дальше

📈 Больше типов формул (IF, VLOOKUP, ...)  
📈 Поддержка строк, дат, форматирования  
📈 Мульти-листы со ссылками между листами  
📈 Undo/Redo через command pattern  
📈 Persistence через сериализацию  

---

**Эта архитектура доказывает: правильная абстракция важнее оптимизации!**

Система якорей позволила поддержать все комбинации относительных/абсолютных ссылок без единой строки дополнительного кода. Разделение ID и позиций сделало вставки/удаления тривиальными. Граф зависимостей обеспечил инкрементальность автоматически.

**Сложность не в коде, а в модели данных.**

