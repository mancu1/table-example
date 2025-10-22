<template>
  <div class="spreadsheet-container">
    <div class="toolbar">
      <div class="toolbar-group">
        <button @click="undo" :disabled="!canUndo" class="btn">
          ↶ Undo
        </button>
        <button @click="redo" :disabled="!canRedo" class="btn">
          ↷ Redo
        </button>
      </div>
      
      <div class="toolbar-group">
        <button @click="insertRow" class="btn">
          + Row
        </button>
        <button @click="insertCol" class="btn">
          + Col
        </button>
        <button @click="deleteRow" class="btn">
          - Row
        </button>
        <button @click="deleteCol" class="btn">
          - Col
        </button>
      </div>
      
      <div class="toolbar-group">
        <span class="cell-info">
          {{ selectedCellInfo }}
        </span>
      </div>
    </div>
    
    <div class="spreadsheet-wrapper">
      <div class="formula-bar">
        <input
          v-model="formulaInput"
          @keydown.enter="applyFormula"
          @keydown.escape="cancelEdit"
          class="formula-input"
          placeholder="Enter formula or value..."
        />
      </div>
      
      <div class="canvas-container" ref="canvasContainer">
        <canvas ref="canvas" @click="onCanvasClick"></canvas>
      </div>
    </div>
    
    <div class="status-bar">
      <span>Rows: {{ sheet.rows.getTotalRows() }}</span>
      <span>Cols: {{ sheet.cols.getTotalCols() }}</span>
      <span>Cells: {{ sheet.cells.size() }}</span>
      <span>Dependencies: {{ sheet.deps.getStats().edges }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { Sheet } from '@/core/sheet'
import { CanvasRenderer } from '@/core/canvas-renderer'
import type { CellAddress } from '@/core/types'

// Состояние
const sheet = new Sheet('sheet1', 'Sheet 1')
const renderer = ref<CanvasRenderer | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const canvasContainer = ref<HTMLDivElement | null>(null)
const formulaInput = ref('')
const selectedCell = ref<CellAddress | null>(null)

// Вычисляемые свойства
const canUndo = computed(() => sheet.historyIndex >= 0)
const canRedo = computed(() => sheet.historyIndex < sheet.history.length - 1)

const selectedCellInfo = computed(() => {
  if (!selectedCell.value) return 'No cell selected'
  
  const row = getRowFromAddress(selectedCell.value)
  const col = getColFromAddress(selectedCell.value)
  const colName = numberToColumn(col)
  
  return `${colName}${row + 1}`
})

// Инициализация
onMounted(async () => {
  await nextTick()
  
  if (canvas.value && canvasContainer.value) {
    // Инициализируем рендерер
    renderer.value = new CanvasRenderer(canvas.value, sheet)
    
    // Устанавливаем размеры
    const container = canvasContainer.value
    const width = container.clientWidth
    const height = container.clientHeight
    
    renderer.value.updateSize(width, height)
    
    // Добавляем обработчики изменения размера
    window.addEventListener('resize', handleResize)
    
    // Загружаем пример данных
    loadExampleData()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Обработчики событий
const handleResize = () => {
  if (renderer.value && canvasContainer.value) {
    const container = canvasContainer.value
    const width = container.clientWidth
    const height = container.clientHeight
    
    renderer.value.updateSize(width, height)
  }
}

const onCanvasClick = (event: MouseEvent) => {
  if (!renderer.value) return
  
  const rect = canvas.value!.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  const cell = renderer.value.getCellAt(x, y)
  if (cell) {
    const address = getCellAddress(cell.row, cell.col)
    selectedCell.value = address
    renderer.value.selectCell(address)
    
    // Загружаем содержимое ячейки в формульную строку
    const cellData = sheet.getCell(address)
    if (cellData) {
      if (cellData.kind === 'formula') {
        formulaInput.value = '=' + formatFormula(cellData.ast!)
      } else {
        formulaInput.value = String(cellData.value || '')
      }
    } else {
      formulaInput.value = ''
    }
  }
}

const applyFormula = () => {
  if (!selectedCell.value) return
  
  const input = formulaInput.value.trim()
  if (!input) return
  
  if (input.startsWith('=')) {
    // Формула
    sheet.setFormula(selectedCell.value, input)
  } else {
    // Простое значение
    const value = parseValue(input)
    sheet.setCell(selectedCell.value, value)
  }
  
  // Обновляем рендер
  renderer.value?.render()
}

const cancelEdit = () => {
  formulaInput.value = ''
}

// Операции с листом
const insertRow = () => {
  if (!selectedCell.value) return
  
  const row = getRowFromAddress(selectedCell.value)
  sheet.insertRows(row, 1)
  renderer.value?.render()
}

const insertCol = () => {
  if (!selectedCell.value) return
  
  const col = getColFromAddress(selectedCell.value)
  sheet.insertCols(col, 1)
  renderer.value?.render()
}

const deleteRow = () => {
  if (!selectedCell.value) return
  
  const row = getRowFromAddress(selectedCell.value)
  sheet.deleteRows([row, row])
  renderer.value?.render()
}

const deleteCol = () => {
  if (!selectedCell.value) return
  
  const col = getColFromAddress(selectedCell.value)
  sheet.deleteCols([col, col])
  renderer.value?.render()
}

const undo = () => {
  if (sheet.undo()) {
    renderer.value?.render()
  }
}

const redo = () => {
  if (sheet.redo()) {
    renderer.value?.render()
  }
}

// Утилиты
const getCellAddress = (row: number, col: number): CellAddress => {
  try {
    const rowId = sheet.rows.posToId(row)
    const colId = sheet.cols.posToId(col)
    return { row: rowId, col: colId }
  } catch {
    return { row: `row_${row + 1}`, col: `col_${col + 1}` }
  }
}

const getRowFromAddress = (address: CellAddress): number => {
  try {
    return sheet.rows.idToPos(address.row)
  } catch {
    return 0
  }
}

const getColFromAddress = (address: CellAddress): number => {
  try {
    return sheet.cols.idToPos(address.col)
  } catch {
    return 0
  }
}

const numberToColumn = (num: number): string => {
  let result = ''
  while (num >= 0) {
    result = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + result
    num = Math.floor(num / 26) - 1
  }
  return result
}

const parseValue = (input: string): any => {
  // Пытаемся распарсить как число
  const num = parseFloat(input)
  if (!isNaN(num)) return num
  
  // Булевы значения
  if (input.toLowerCase() === 'true') return true
  if (input.toLowerCase() === 'false') return false
  
  // Строка
  return input
}

const formatFormula = (ast: any): string => {
  // Упрощенная реализация - в реальности нужно обходить AST
  return 'formula'
}

// Загрузка примеров
const loadExampleData = () => {
  // Добавляем несколько строк и столбцов
  sheet.insertRows(0, 10)
  sheet.insertCols(0, 10)
  
  // Заполняем данными
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const address = getCellAddress(row, col)
      sheet.setCell(address, row * 5 + col + 1)
    }
  }
  
  // Добавляем формулу
  const sumAddress = getCellAddress(5, 0)
  sheet.setFormula(sumAddress, '=SUM(A1:E1)')
  
  // Обновляем рендер
  renderer.value?.render()
}
</script>

<style scoped>
.spreadsheet-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid #d0d0d0;
  background: #f5f5f5;
  gap: 16px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cell-info {
  font-family: monospace;
  font-weight: bold;
  color: #333;
}

.spreadsheet-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.formula-bar {
  padding: 8px 16px;
  border-bottom: 1px solid #d0d0d0;
  background: #fafafa;
}

.formula-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
}

.formula-input:focus {
  outline: none;
  border-color: #1976d2;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
}

.canvas-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

canvas {
  display: block;
  cursor: cell;
}

.status-bar {
  display: flex;
  align-items: center;
  padding: 4px 16px;
  border-top: 1px solid #d0d0d0;
  background: #f5f5f5;
  font-size: 12px;
  color: #666;
  gap: 16px;
}
</style>
