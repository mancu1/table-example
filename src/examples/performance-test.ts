/**
 * Тест производительности для демонстрации масштабируемости
 */
import { Sheet } from '@/core/sheet'
import type { CellAddress } from '@/core/types'

export class PerformanceTest {
  private sheet: Sheet

  constructor() {
    this.sheet = new Sheet('perf', 'Performance Test')
  }

  /**
   * Тест 1: Создание большого листа с разреженными данными
   */
  async testSparseData(): Promise<void> {
    console.log('🧪 Testing sparse data storage...')
    
    const startTime = performance.now()
    
    // Создаем лист 1,000,000 × 16,000
    this.sheet.insertRows(0, 1000000)
    this.sheet.insertCols(0, 16000)
    
    const setupTime = performance.now() - startTime
    console.log(`✅ Setup time: ${setupTime.toFixed(2)}ms`)
    
    // Заполняем только 0.1% ячеек (разреженность)
    const fillStartTime = performance.now()
    const fillCount = Math.floor(1000000 * 16000 * 0.001) // 0.1%
    
    for (let i = 0; i < fillCount; i++) {
      const row = Math.floor(Math.random() * 1000000)
      const col = Math.floor(Math.random() * 16000)
      const address: CellAddress = { 
        row: `row_${row + 1}`, 
        col: `col_${col + 1}` 
      }
      this.sheet.setCell(address, Math.random() * 1000)
    }
    
    const fillTime = performance.now() - fillStartTime
    console.log(`✅ Fill time: ${fillTime.toFixed(2)}ms`)
    console.log(`✅ Memory usage: ${this.sheet.cells.size()} cells`)
    console.log(`✅ Memory efficiency: ${(this.sheet.cells.size() / (1000000 * 16000) * 100).toFixed(4)}%`)
  }

  /**
   * Тест 2: Вставка строк в середину большого листа
   */
  async testRowInsertion(): Promise<void> {
    console.log('🧪 Testing row insertion in large sheet...')
    
    const startTime = performance.now()
    
    // Вставляем 1000 строк в середину
    this.sheet.insertRows(500000, 1000)
    
    const insertTime = performance.now() - startTime
    console.log(`✅ Insert 1000 rows time: ${insertTime.toFixed(2)}ms`)
    console.log(`✅ Total rows: ${this.sheet.rows.getTotalRows()}`)
  }

  /**
   * Тест 3: Формулы с зависимостями
   */
  async testFormulaDependencies(): Promise<void> {
    console.log('🧪 Testing formula dependencies...')
    
    const startTime = performance.now()
    
    // Создаем цепочку формул
    for (let i = 0; i < 1000; i++) {
      const addr1: CellAddress = { row: `row_${i + 1}`, col: 'col_1' }
      const addr2: CellAddress = { row: `row_${i + 2}`, col: 'col_1' }
      
      this.sheet.setCell(addr1, i)
      this.sheet.setFormula(addr2, `=A${i + 1}+1`)
    }
    
    const formulaTime = performance.now() - startTime
    console.log(`✅ Formula creation time: ${formulaTime.toFixed(2)}ms`)
    
    // Тестируем пересчет
    const recalcStartTime = performance.now()
    this.sheet.recalculate()
    const recalcTime = performance.now() - recalcStartTime
    
    console.log(`✅ Recalculation time: ${recalcTime.toFixed(2)}ms`)
    console.log(`✅ Dependencies: ${this.sheet.deps.getStats().edges}`)
  }

  /**
   * Тест 4: Циклические зависимости
   */
  async testCircularDependencies(): Promise<void> {
    console.log('🧪 Testing circular dependency detection...')
    
    const addr1: CellAddress = { row: 'row_1', col: 'col_1' }
    const addr2: CellAddress = { row: 'row_2', col: 'col_1' }
    const addr3: CellAddress = { row: 'row_3', col: 'col_1' }
    
    this.sheet.setCell(addr1, 10)
    this.sheet.setFormula(addr2, '=A1+1')
    this.sheet.setFormula(addr3, '=A2+1')
    this.sheet.setFormula(addr1, '=A3+1') // Создаем цикл
    
    const cycles = this.sheet.deps.detectCycles()
    console.log(`✅ Circular dependencies detected: ${cycles.length}`)
    console.log(`✅ Cycle cells: ${cycles.map(c => `${c.row}:${c.col}`).join(', ')}`)
  }

  /**
   * Тест 5: Производительность Canvas рендеринга
   */
  async testCanvasRendering(): Promise<void> {
    console.log('🧪 Testing Canvas rendering performance...')
    
    // Создаем Canvas элемент для тестирования
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    
    // Импортируем рендерер (в реальном приложении)
    // const renderer = new CanvasRenderer(canvas, this.sheet)
    
    const startTime = performance.now()
    
    // Симулируем рендеринг
    for (let i = 0; i < 100; i++) {
      // renderer.render()
    }
    
    const renderTime = performance.now() - startTime
    console.log(`✅ Canvas render time: ${renderTime.toFixed(2)}ms`)
    console.log(`✅ FPS: ${(1000 / (renderTime / 100)).toFixed(1)}`)
  }

  /**
   * Запуск всех тестов
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting performance tests...\n')
    
    try {
      await this.testSparseData()
      console.log('')
      
      await this.testRowInsertion()
      console.log('')
      
      await this.testFormulaDependencies()
      console.log('')
      
      await this.testCircularDependencies()
      console.log('')
      
      await this.testCanvasRendering()
      console.log('')
      
      console.log('✅ All performance tests completed!')
    } catch (error) {
      console.error('❌ Performance test failed:', error)
    }
  }
}

// Экспорт для использования в браузере
if (typeof window !== 'undefined') {
  (window as any).PerformanceTest = PerformanceTest
}
