import type { Cell, CellAddress, Scalar, FormulaAst, Operation, SheetState } from './types'
import { RowIndex } from './row-index'
import { ColIndex } from './col-index'
import { CellStore } from './cell-store'
import { FormulaGraph } from './formula-graph'
import { FormulaParser } from './formula-parser'
import { FormulaEvaluator } from './formula-evaluator'

/**
 * Основной класс листа - управляет всеми операциями
 */
export class Sheet {
  public rows: RowIndex
  public cols: ColIndex
  public cells: CellStore
  public deps: FormulaGraph
  public history: Operation[] = []
  public historyIndex = -1

  private parser: FormulaParser
  private evaluator: FormulaEvaluator
  private recalcQueue = new Set<CellAddress>()

  constructor(public id: string, public name: string) {
    this.rows = new RowIndex()
    this.cols = new ColIndex()
    this.cells = new CellStore()
    this.deps = new FormulaGraph()
    this.parser = new FormulaParser()
    this.evaluator = new FormulaEvaluator(this.getState())
  }

  /**
   * Получить состояние листа
   */
  getState(): SheetState {
    return {
      id: this.id,
      name: this.name,
      rows: this.rows,
      cols: this.cols,
      cells: this.cells,
      deps: this.deps,
      history: this.history,
      historyIndex: this.historyIndex
    }
  }

  /**
   * Установить значение ячейки
   */
  setCell(address: CellAddress, value: Scalar): void {
    const operation: Operation = {
      type: 'setCell',
      address,
      value,
      timestamp: Date.now()
    }

    this.addToHistory(operation)
    this.cells.set(address, { kind: 'scalar', value })
    this.deps.removeEdges(address)
    this.scheduleRecalc(address)
  }

  /**
   * Установить формулу в ячейку
   */
  setFormula(address: CellAddress, formula: string): void {
    try {
      const ast = this.parser.parse(formula)
      const operation: Operation = {
        type: 'setFormula',
        address,
        formula: ast,
        timestamp: Date.now()
      }

      this.addToHistory(operation)
      
      // Удаляем старые зависимости
      this.deps.removeEdges(address)
      
      // Устанавливаем новую формулу
      this.cells.set(address, { kind: 'formula', ast })
      
      // Строим новые зависимости
      this.buildDependencies(address, ast)
      
      this.scheduleRecalc(address)
    } catch (error) {
      console.error('Formula parsing error:', error)
      this.setCell(address, { type: 'ERROR', code: 'VALUE', message: 'Invalid formula' })
    }
  }

  /**
   * Получить значение ячейки
   */
  getCell(address: CellAddress): Cell | undefined {
    return this.cells.get(address)
  }

  /**
   * Получить вычисленное значение ячейки
   */
  getValue(address: CellAddress): Scalar {
    const cell = this.cells.get(address)
    if (!cell) return null

    if (cell.kind === 'scalar') {
      return cell.value || null
    }

    if (cell.kind === 'formula') {
      if (cell.cached !== undefined) {
        return cell.cached
      }

      try {
        const result = this.evaluator.evaluate(cell.ast!, address)
        cell.cached = result
        return result
      } catch (error) {
        return { type: 'ERROR', code: 'VALUE', message: 'Calculation error' }
      }
    }

    return null
  }

  /**
   * Вставить строки
   */
  insertRows(position: number, count: number): void {
    const operation: Operation = {
      type: 'insertRows',
      position,
      count,
      timestamp: Date.now()
    }

    this.addToHistory(operation)
    const newRowIds = this.rows.insert(position, count)
    this.updateReferencesAfterRowInsert(position, count)
    this.scheduleRecalc()
  }

  /**
   * Удалить строки
   */
  deleteRows(range: [from: number, to: number]): void {
    const operation: Operation = {
      type: 'deleteRows',
      range,
      timestamp: Date.now()
    }

    this.addToHistory(operation)
    
    // Получаем RowId для удаления
    const rowIdsToDelete: string[] = []
    for (let i = range[0]; i <= range[1]; i++) {
      try {
        const rowId = this.rows.posToId(i)
        rowIdsToDelete.push(rowId)
      } catch {
        // Позиция не существует
      }
    }

    // Удаляем ячейки
    this.cells.removeRows(rowIdsToDelete)
    
    // Удаляем зависимости
    for (const rowId of rowIdsToDelete) {
      // Находим все ячейки в этой строке
      for (const [addr, cell] of this.cells.iterAll()) {
        if (addr.row === rowId) {
          this.deps.removeEdges(addr)
        }
      }
    }

    this.rows.remove(range)
    this.updateReferencesAfterRowDelete(range[0], range[1] - range[0] + 1)
    this.scheduleRecalc()
  }

  /**
   * Вставить столбцы
   */
  insertCols(position: number, count: number): void {
    const operation: Operation = {
      type: 'insertCols',
      position,
      count,
      timestamp: Date.now()
    }

    this.addToHistory(operation)
    const newColIds = this.cols.insert(position, count)
    this.updateReferencesAfterColInsert(position, count)
    this.scheduleRecalc()
  }

  /**
   * Удалить столбцы
   */
  deleteCols(range: [from: number, to: number]): void {
    const operation: Operation = {
      type: 'deleteCols',
      range,
      timestamp: Date.now()
    }

    this.addToHistory(operation)
    
    // Получаем ColId для удаления
    const colIdsToDelete: string[] = []
    for (let i = range[0]; i <= range[1]; i++) {
      try {
        const colId = this.cols.posToId(i)
        colIdsToDelete.push(colId)
      } catch {
        // Позиция не существует
      }
    }

    // Удаляем ячейки
    this.cells.removeCols(colIdsToDelete)
    
    // Удаляем зависимости
    for (const colId of colIdsToDelete) {
      // Находим все ячейки в этом столбце
      for (const [addr, cell] of this.cells.iterAll()) {
        if (addr.col === colId) {
          this.deps.removeEdges(addr)
        }
      }
    }

    this.cols.remove(range)
    this.updateReferencesAfterColDelete(range[0], range[1] - range[0] + 1)
    this.scheduleRecalc()
  }

  /**
   * Выполнить пересчет
   */
  recalculate(): void {
    if (this.recalcQueue.size === 0) return

    // Очищаем кэш затронутых ячеек
    for (const addr of this.recalcQueue) {
      const cell = this.cells.get(addr)
      if (cell && cell.kind === 'formula') {
        cell.cached = undefined
      }
    }

    // Получаем все затронутые ячейки
    const affected = this.deps.affectedBy(this.recalcQueue)
    
    // Проверяем циклы
    const cycles = this.deps.detectCycles()
    if (cycles.length > 0) {
      console.warn('Circular dependencies detected:', cycles)
      // Помечаем циклические ячейки как ошибки
      for (const addr of cycles) {
        this.setCell(addr, { type: 'ERROR', code: 'CYCLE', message: 'Circular reference' })
      }
    }

    // Пересчитываем в топологическом порядке
    const order = this.deps.getTopologicalOrder()
    for (const addr of order) {
      if (affected.has(addr) || this.recalcQueue.has(addr)) {
        const cell = this.cells.get(addr)
        if (cell && cell.kind === 'formula') {
          try {
            const result = this.evaluator.evaluate(cell.ast!, addr)
            cell.cached = result
          } catch (error) {
            cell.cached = { type: 'ERROR', code: 'VALUE', message: 'Calculation error' }
          }
        }
      }
    }

    this.recalcQueue.clear()
  }

  /**
   * Отменить последнюю операцию
   */
  undo(): boolean {
    if (this.historyIndex < 0) return false

    const operation = this.history[this.historyIndex]
    this.historyIndex--

    // Упрощенная реализация undo
    switch (operation.type) {
      case 'setCell':
      case 'setFormula':
        if (operation.address) {
          this.cells.delete(operation.address)
        }
        break
      // Другие операции требуют более сложной логики
    }

    this.scheduleRecalc()
    return true
  }

  /**
   * Повторить отмененную операцию
   */
  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1) return false

    this.historyIndex++
    const operation = this.history[this.historyIndex]

    // Упрощенная реализация redo
    switch (operation.type) {
      case 'setCell':
        if (operation.address && operation.value !== undefined) {
          this.setCell(operation.address, operation.value)
        }
        break
      case 'setFormula':
        if (operation.address && operation.formula) {
          // Нужно восстановить формулу из AST
        }
        break
    }

    return true
  }

  private buildDependencies(address: CellAddress, ast: FormulaAst): void {
    // Упрощенная реализация - в реальности нужно обходить AST
    // и извлекать все ссылки на ячейки
    this.extractReferences(ast.root, address)
  }

  private extractReferences(node: any, baseAddress: CellAddress): void {
    if (node.type === 'reference') {
      const targetAddr = this.resolveReference(node.value, baseAddress)
      this.deps.addEdge(targetAddr, baseAddress)
    } else if (node.children) {
      for (const child of node.children) {
        this.extractReferences(child, baseAddress)
      }
    }
  }

  private resolveReference(anchor: any, baseAddress: CellAddress): CellAddress {
    // Упрощенная реализация
    return {
      row: anchor.base.row,
      col: anchor.base.col
    }
  }

  private scheduleRecalc(address?: CellAddress): void {
    if (address) {
      this.recalcQueue.add(address)
    }
    
    // Планируем пересчет на следующий тик
    if (this.recalcQueue.size > 0) {
      setTimeout(() => this.recalculate(), 0)
    }
  }

  private updateReferencesAfterRowInsert(position: number, count: number): void {
    // Упрощенная реализация - в реальности нужно обновлять все формулы
    // с относительными ссылками на строки >= position
  }

  private updateReferencesAfterRowDelete(position: number, count: number): void {
    // Упрощенная реализация
  }

  private updateReferencesAfterColInsert(position: number, count: number): void {
    // Упрощенная реализация
  }

  private updateReferencesAfterColDelete(position: number, count: number): void {
    // Упрощенная реализация
  }

  private addToHistory(operation: Operation): void {
    // Удаляем операции после текущего индекса (если есть)
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1)
    }

    this.history.push(operation)
    this.historyIndex = this.history.length - 1

    // Ограничиваем размер истории
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000)
      this.historyIndex = this.history.length - 1
    }
  }
}
