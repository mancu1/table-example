import type { CellAddress, Scalar } from './types'
import type { Sheet } from './sheet'

/**
 * Canvas рендерер с виртуализацией для больших таблиц
 */
export class CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sheet: Sheet
  
  // Размеры и позиции
  private cellWidth = 80
  private cellHeight = 24
  private headerHeight = 24
  private headerWidth = 40
  
  // Виртуализация
  private viewportX = 0
  private viewportY = 0
  private viewportWidth = 0
  private viewportHeight = 0
  
  // Видимые ячейки
  private visibleRows: number[] = []
  private visibleCols: number[] = []
  
  // Кэш размеров
  private rowHeights: number[] = []
  private colWidths: number[] = []
  private prefixRowHeights: number[] = []
  private prefixColWidths: number[] = []
  
  // Выделение
  private selectedCell: CellAddress | null = null
  private selectionRange: { start: CellAddress; end: CellAddress } | null = null
  
  // Стили
  private styles = {
    cellPadding: 4,
    borderColor: '#d0d0d0',
    borderWidth: 1,
    headerBg: '#f5f5f5',
    selectedBg: '#e3f2fd',
    textColor: '#333',
    fontSize: 12,
    fontFamily: 'Arial, sans-serif'
  }

  constructor(canvas: HTMLCanvasElement, sheet: Sheet) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.sheet = sheet
    
    this.setupCanvas()
    this.calculateViewport()
    this.updateVisibleCells()
  }

  /**
   * Настроить Canvas
   */
  private setupCanvas(): void {
    this.canvas.style.cursor = 'cell'
    
    // Обработчики событий
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this))
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this))
    this.canvas.addEventListener('wheel', this.onWheel.bind(this))
    this.canvas.addEventListener('keydown', this.onKeyDown.bind(this))
    
    // Фокус для клавиатуры
    this.canvas.tabIndex = 0
  }

  /**
   * Рендер таблицы
   */
  render(): void {
    this.clearCanvas()
    this.renderHeaders()
    this.renderCells()
    this.renderSelection()
  }

  /**
   * Очистить Canvas
   */
  private clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * Рендер заголовков
   */
  private renderHeaders(): void {
    // Заголовки строк (слева)
    this.ctx.fillStyle = this.styles.headerBg
    this.ctx.fillRect(0, 0, this.headerWidth, this.viewportHeight)
    
    // Заголовки столбцов (сверху)
    this.ctx.fillStyle = this.styles.headerBg
    this.ctx.fillRect(0, 0, this.viewportWidth, this.headerHeight)
    
    // Рендер номеров строк
    this.ctx.fillStyle = this.styles.textColor
    this.ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    
    for (const row of this.visibleRows) {
      const y = this.getRowY(row) + this.cellHeight / 2
      this.ctx.fillText(
        (row + 1).toString(),
        this.headerWidth / 2,
        y
      )
    }
    
    // Рендер букв столбцов
    this.ctx.textAlign = 'center'
    for (const col of this.visibleCols) {
      const x = this.getColX(col) + this.cellWidth / 2
      this.ctx.fillText(
        this.numberToColumn(col),
        x,
        this.headerHeight / 2
      )
    }
    
    // Границы заголовков
    this.renderGrid()
  }

  /**
   * Рендер ячеек
   */
  private renderCells(): void {
    this.ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'middle'
    
    for (const row of this.visibleRows) {
      for (const col of this.visibleCols) {
        this.renderCell(row, col)
      }
    }
  }

  /**
   * Рендер отдельной ячейки
   */
  private renderCell(row: number, col: number): void {
    const x = this.getColX(col)
    const y = this.getRowY(row)
    const width = this.getColWidth(col)
    const height = this.getRowHeight(row)
    
    // Фон ячейки
    this.ctx.fillStyle = this.isCellSelected(row, col) ? this.styles.selectedBg : '#fff'
    this.ctx.fillRect(x, y, width, height)
    
    // Содержимое ячейки
    const cellAddr = this.getCellAddress(row, col)
    const cell = this.sheet.getCell(cellAddr)
    
    if (cell) {
      const value = this.sheet.getValue(cellAddr)
      const text = this.formatCellValue(value)
      
      this.ctx.fillStyle = this.styles.textColor
      this.ctx.fillText(
        text,
        x + this.styles.cellPadding,
        y + height / 2,
        width - this.styles.cellPadding * 2
      )
    }
    
    // Граница ячейки
    this.ctx.strokeStyle = this.styles.borderColor
    this.ctx.lineWidth = this.styles.borderWidth
    this.ctx.strokeRect(x, y, width, height)
  }

  /**
   * Рендер выделения
   */
  private renderSelection(): void {
    if (!this.selectedCell) return
    
    const row = this.getRowFromAddress(this.selectedCell)
    const col = this.getColFromAddress(this.selectedCell)
    
    if (this.visibleRows.includes(row) && this.visibleCols.includes(col)) {
      const x = this.getColX(col)
      const y = this.getRowY(row)
      const width = this.getColWidth(col)
      const height = this.getRowHeight(row)
      
      this.ctx.strokeStyle = '#1976d2'
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(x, y, width, height)
    }
  }

  /**
   * Рендер сетки
   */
  private renderGrid(): void {
    this.ctx.strokeStyle = this.styles.borderColor
    this.ctx.lineWidth = this.styles.borderWidth
    
    // Вертикальные линии
    for (const col of this.visibleCols) {
      const x = this.getColX(col)
      this.ctx.beginPath()
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, this.viewportHeight)
      this.ctx.stroke()
    }
    
    // Горизонтальные линии
    for (const row of this.visibleRows) {
      const y = this.getRowY(row)
      this.ctx.beginPath()
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(this.viewportWidth, y)
      this.ctx.stroke()
    }
  }

  /**
   * Обновить размеры Canvas
   */
  updateSize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    
    this.viewportWidth = width - this.headerWidth
    this.viewportHeight = height - this.headerHeight
    
    this.updateVisibleCells()
    this.render()
  }

  /**
   * Прокрутка
   */
  scroll(deltaX: number, deltaY: number): void {
    this.viewportX = Math.max(0, this.viewportX + deltaX)
    this.viewportY = Math.max(0, this.viewportY + deltaY)
    
    this.updateVisibleCells()
    this.render()
  }

  /**
   * Получить ячейку по координатам мыши
   */
  getCellAt(x: number, y: number): { row: number; col: number } | null {
    if (x < this.headerWidth || y < this.headerHeight) {
      return null
    }
    
    const cellX = x - this.headerWidth
    const cellY = y - this.headerHeight
    
    // Бинарный поиск по столбцам
    let col = -1
    for (let i = 0; i < this.visibleCols.length; i++) {
      const colX = this.getColX(this.visibleCols[i])
      if (cellX >= colX && cellX < colX + this.getColWidth(this.visibleCols[i])) {
        col = this.visibleCols[i]
        break
      }
    }
    
    // Бинарный поиск по строкам
    let row = -1
    for (let i = 0; i < this.visibleRows.length; i++) {
      const rowY = this.getRowY(this.visibleRows[i])
      if (cellY >= rowY && cellY < rowY + this.getRowHeight(this.visibleRows[i])) {
        row = this.visibleRows[i]
        break
      }
    }
    
    return col >= 0 && row >= 0 ? { row, col } : null
  }

  /**
   * Выделить ячейку
   */
  selectCell(address: CellAddress): void {
    this.selectedCell = address
    this.render()
  }

  /**
   * Обработчики событий
   */
  private onMouseDown(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    
    const cell = this.getCellAt(x, y)
    if (cell) {
      const address = this.getCellAddress(cell.row, cell.col)
      this.selectCell(address)
    }
  }

  private onMouseMove(event: MouseEvent): void {
    // Обработка перетаскивания выделения
  }

  private onMouseUp(event: MouseEvent): void {
    // Завершение выделения
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault()
    this.scroll(event.deltaX, event.deltaY)
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.selectedCell) return
    
    const row = this.getRowFromAddress(this.selectedCell)
    const col = this.getColFromAddress(this.selectedCell)
    
    switch (event.key) {
      case 'ArrowUp':
        if (row > 0) {
          this.selectCell(this.getCellAddress(row - 1, col))
        }
        break
      case 'ArrowDown':
        this.selectCell(this.getCellAddress(row + 1, col))
        break
      case 'ArrowLeft':
        if (col > 0) {
          this.selectCell(this.getCellAddress(row, col - 1))
        }
        break
      case 'ArrowRight':
        this.selectCell(this.getCellAddress(row, col + 1))
        break
    }
  }

  // Утилиты
  private calculateViewport(): void {
    this.viewportWidth = this.canvas.width - this.headerWidth
    this.viewportHeight = this.canvas.height - this.headerHeight
  }

  private updateVisibleCells(): void {
    // Вычисляем видимые строки и столбцы
    this.visibleRows = []
    this.visibleCols = []
    
    let currentY = 0
    for (let row = 0; row < this.sheet.rows.getTotalRows(); row++) {
      if (currentY >= this.viewportY && currentY < this.viewportY + this.viewportHeight) {
        this.visibleRows.push(row)
      }
      currentY += this.getRowHeight(row)
    }
    
    let currentX = 0
    for (let col = 0; col < this.sheet.cols.getTotalCols(); col++) {
      if (currentX >= this.viewportX && currentX < this.viewportX + this.viewportWidth) {
        this.visibleCols.push(col)
      }
      currentX += this.getColWidth(col)
    }
  }

  private getRowY(row: number): number {
    return this.headerHeight + (row * this.cellHeight) - this.viewportY
  }

  private getColX(col: number): number {
    return this.headerWidth + (col * this.cellWidth) - this.viewportX
  }

  private getRowHeight(row: number): number {
    return this.cellHeight
  }

  private getColWidth(col: number): number {
    return this.cellWidth
  }

  private getCellAddress(row: number, col: number): CellAddress {
    try {
      const rowId = this.sheet.rows.posToId(row)
      const colId = this.sheet.cols.posToId(col)
      return { row: rowId, col: colId }
    } catch {
      // Создаем временный адрес для несуществующих ячеек
      return { row: `row_${row + 1}`, col: `col_${col + 1}` }
    }
  }

  private getRowFromAddress(address: CellAddress): number {
    try {
      return this.sheet.rows.idToPos(address.row)
    } catch {
      return 0
    }
  }

  private getColFromAddress(address: CellAddress): number {
    try {
      return this.sheet.cols.idToPos(address.col)
    } catch {
      return 0
    }
  }

  private isCellSelected(row: number, col: number): boolean {
    if (!this.selectedCell) return false
    
    const selectedRow = this.getRowFromAddress(this.selectedCell)
    const selectedCol = this.getColFromAddress(this.selectedCell)
    
    return row === selectedRow && col === selectedCol
  }

  private formatCellValue(value: Scalar): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object' && 'type' in value && value.type === 'ERROR') {
      return `#${value.code}!`
    }
    return value.toString()
  }

  private numberToColumn(num: number): string {
    let result = ''
    while (num >= 0) {
      result = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + result
      num = Math.floor(num / 26) - 1
    }
    return result
  }
}
