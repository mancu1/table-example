import { describe, it, expect, beforeEach } from 'vitest'
import { Sheet } from '../sheet'
import type { CellAddress } from '../types'

describe('Sheet', () => {
  let sheet: Sheet

  beforeEach(() => {
    sheet = new Sheet('test', 'Test Sheet')
  })

  describe('Basic Operations', () => {
    it('should create empty sheet', () => {
      expect(sheet.rows.getTotalRows()).toBe(0)
      expect(sheet.cols.getTotalCols()).toBe(0)
      expect(sheet.cells.size()).toBe(0)
    })

    it('should set and get cell values', () => {
      const address: CellAddress = { row: 'row_1', col: 'col_1' }
      
      sheet.setCell(address, 42)
      
      const cell = sheet.getCell(address)
      expect(cell).toBeDefined()
      expect(cell?.kind).toBe('scalar')
      expect(cell?.value).toBe(42)
      
      const value = sheet.getValue(address)
      expect(value).toBe(42)
    })

    it('should handle formulas', () => {
      const address: CellAddress = { row: 'row_1', col: 'col_1' }
      
      sheet.setFormula(address, '=2+3')
      
      const cell = sheet.getCell(address)
      expect(cell).toBeDefined()
      expect(cell?.kind).toBe('formula')
      expect(cell?.ast).toBeDefined()
    })
  })

  describe('Row Operations', () => {
    beforeEach(() => {
      // Добавляем начальные строки
      sheet.insertRows(0, 5)
    })

    it('should insert rows', () => {
      const initialRows = sheet.rows.getTotalRows()
      sheet.insertRows(2, 3)
      
      expect(sheet.rows.getTotalRows()).toBe(initialRows + 3)
    })

    it('should delete rows', () => {
      const initialRows = sheet.rows.getTotalRows()
      sheet.deleteRows([1, 2])
      
      expect(sheet.rows.getTotalRows()).toBe(initialRows - 2)
    })

    it('should maintain cell references after row operations', () => {
      // Добавляем данные
      const addr1: CellAddress = { row: 'row_1', col: 'col_1' }
      const addr2: CellAddress = { row: 'row_2', col: 'col_1' }
      
      sheet.setCell(addr1, 10)
      sheet.setCell(addr2, 20)
      
      // Вставляем строку между ними
      sheet.insertRows(1, 1)
      
      // Проверяем, что данные сохранились
      expect(sheet.getValue(addr1)).toBe(10)
      expect(sheet.getValue(addr2)).toBe(20)
    })
  })

  describe('Column Operations', () => {
    beforeEach(() => {
      // Добавляем начальные столбцы
      sheet.insertCols(0, 5)
    })

    it('should insert columns', () => {
      const initialCols = sheet.cols.getTotalCols()
      sheet.insertCols(2, 3)
      
      expect(sheet.cols.getTotalCols()).toBe(initialCols + 3)
    })

    it('should delete columns', () => {
      const initialCols = sheet.cols.getTotalCols()
      sheet.deleteCols([1, 2])
      
      expect(sheet.cols.getTotalCols()).toBe(initialCols - 2)
    })
  })

  describe('History Operations', () => {
    it('should support undo/redo', () => {
      const address: CellAddress = { row: 'row_1', col: 'col_1' }
      
      // Устанавливаем значение
      sheet.setCell(address, 42)
      expect(sheet.getValue(address)).toBe(42)
      
      // Отменяем
      expect(sheet.undo()).toBe(true)
      expect(sheet.getCell(address)).toBeUndefined()
      
      // Повторяем
      expect(sheet.redo()).toBe(true)
      expect(sheet.getValue(address)).toBe(42)
    })

    it('should track operation history', () => {
      const address: CellAddress = { row: 'row_1', col: 'col_1' }
      
      sheet.setCell(address, 42)
      sheet.setCell(address, 84)
      
      expect(sheet.history.length).toBe(2)
      expect(sheet.history[0].type).toBe('setCell')
      expect(sheet.history[0].value).toBe(42)
      expect(sheet.history[1].value).toBe(84)
    })
  })

  describe('Formula Dependencies', () => {
    it('should build dependency graph', () => {
      const addr1: CellAddress = { row: 'row_1', col: 'col_1' }
      const addr2: CellAddress = { row: 'row_2', col: 'col_1' }
      
      sheet.setCell(addr1, 10)
      sheet.setFormula(addr2, '=A1*2')
      
      const stats = sheet.deps.getStats()
      expect(stats.nodes).toBeGreaterThan(0)
    })

    it('should detect circular dependencies', () => {
      const addr1: CellAddress = { row: 'row_1', col: 'col_1' }
      const addr2: CellAddress = { row: 'row_2', col: 'col_1' }
      
      // Создаем циклическую зависимость
      sheet.setFormula(addr1, '=A2+1')
      sheet.setFormula(addr2, '=A1+1')
      
      const cycles = sheet.deps.detectCycles()
      expect(cycles.length).toBeGreaterThan(0)
    })
  })

  describe('Performance', () => {
    it('should handle large number of cells efficiently', () => {
      const startTime = performance.now()
      
      // Добавляем много строк и столбцов
      sheet.insertRows(0, 1000)
      sheet.insertCols(0, 100)
      
      // Заполняем каждую 10-ю ячейку
      for (let row = 0; row < 1000; row += 10) {
        for (let col = 0; col < 100; col += 10) {
          const address: CellAddress = { 
            row: `row_${row + 1}`, 
            col: `col_${col + 1}` 
          }
          sheet.setCell(address, row * col)
        }
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Проверяем, что операция выполнилась быстро (< 1 секунды)
      expect(duration).toBeLessThan(1000)
      
      // Проверяем, что память растет пропорционально заполненности
      const expectedCells = Math.floor(1000 / 10) * Math.floor(100 / 10)
      expect(sheet.cells.size()).toBeLessThanOrEqual(expectedCells)
    })
  })
})
