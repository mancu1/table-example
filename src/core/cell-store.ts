import type { Cell, CellAddress, Scalar, RangeRef, SheetState } from './types'

/**
 * Разреженное хранилище ячеек - только заполненные ячейки занимают память
 */
export class CellStore {
  private cells = new Map<string, Cell>()

  /**
   * Получить ячейку по адресу
   */
  get(addr: CellAddress): Cell | undefined {
    const key = this.addressToKey(addr)
    return this.cells.get(key)
  }

  /**
   * Установить ячейку
   */
  set(addr: CellAddress, cell: Cell): void {
    const key = this.addressToKey(addr)
    this.cells.set(key, cell)
  }

  /**
   * Удалить ячейку
   */
  delete(addr: CellAddress): void {
    const key = this.addressToKey(addr)
    this.cells.delete(key)
  }

  /**
   * Проверить существование ячейки
   */
  has(addr: CellAddress): boolean {
    const key = this.addressToKey(addr)
    return this.cells.has(key)
  }

  /**
   * Получить все ячейки в диапазоне
   */
  *iterRange(range: RangeRef, sheet: SheetState): IterableIterator<[CellAddress, Cell]> {
    const startRow = this.anchorToAddress(range.start, sheet).row
    const endRow = this.anchorToAddress(range.end, sheet).row
    const startCol = this.anchorToAddress(range.start, sheet).col
    const endCol = this.anchorToAddress(range.end, sheet).col

    // Получаем все RowId и ColId в диапазоне
    const rowIds = this.getRowIdsInRange(startRow, endRow, sheet)
    const colIds = this.getColIdsInRange(startCol, endCol, sheet)

    for (const rowId of rowIds) {
      for (const colId of colIds) {
        const addr: CellAddress = { row: rowId, col: colId }
        const cell = this.get(addr)
        if (cell) {
          yield [addr, cell]
        }
      }
    }
  }

  /**
   * Получить все ячейки
   */
  *iterAll(): IterableIterator<[CellAddress, Cell]> {
    for (const [key, cell] of this.cells) {
      const addr = this.keyToAddress(key)
      yield [addr, cell]
    }
  }

  /**
   * Очистить все ячейки
   */
  clear(): void {
    this.cells.clear()
  }

  /**
   * Получить количество заполненных ячеек
   */
  size(): number {
    return this.cells.size
  }

  /**
   * Удалить ячейки в диапазоне строк
   */
  removeRows(rowIds: string[]): void {
    const keysToDelete: string[] = []
    
    for (const [key, cell] of this.cells) {
      const addr = this.keyToAddress(key)
      if (rowIds.includes(addr.row)) {
        keysToDelete.push(key)
      }
    }
    
    for (const key of keysToDelete) {
      this.cells.delete(key)
    }
  }

  /**
   * Удалить ячейки в диапазоне столбцов
   */
  removeCols(colIds: string[]): void {
    const keysToDelete: string[] = []
    
    for (const [key, cell] of this.cells) {
      const addr = this.keyToAddress(key)
      if (colIds.includes(addr.col)) {
        keysToDelete.push(key)
      }
    }
    
    for (const key of keysToDelete) {
      this.cells.delete(key)
    }
  }

  private addressToKey(addr: CellAddress): string {
    return `${addr.row}:${addr.col}`
  }

  private keyToAddress(key: string): CellAddress {
    const [row, col] = key.split(':')
    return { row, col }
  }

  private anchorToAddress(anchor: any, sheet: SheetState): CellAddress {
    // Упрощенная реализация - в реальности нужно учитывать относительность
    return {
      row: anchor.base.row,
      col: anchor.base.col
    }
  }

  private getRowIdsInRange(startRow: string, endRow: string, sheet: SheetState): string[] {
    // Упрощенная реализация - в реальности нужно учитывать порядок
    const allRowIds = sheet.rows.getAllRowIds()
    const startIndex = allRowIds.indexOf(startRow)
    const endIndex = allRowIds.indexOf(endRow)
    
    if (startIndex === -1 || endIndex === -1) return []
    
    return allRowIds.slice(
      Math.min(startIndex, endIndex),
      Math.max(startIndex, endIndex) + 1
    )
  }

  private getColIdsInRange(startCol: string, endCol: string, sheet: SheetState): string[] {
    // Упрощенная реализация - в реальности нужно учитывать порядок
    const allColIds = sheet.cols.getAllColIds()
    const startIndex = allColIds.indexOf(startCol)
    const endIndex = allColIds.indexOf(endCol)
    
    if (startIndex === -1 || endIndex === -1) return []
    
    return allColIds.slice(
      Math.min(startIndex, endIndex),
      Math.max(startIndex, endIndex) + 1
    )
  }
}
