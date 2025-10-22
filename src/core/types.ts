// Базовые типы для системы таблиц

export type RowId = string
export type ColId = string

export interface CellAddress {
  row: RowId
  col: ColId
}

export type Scalar = string | number | boolean | null | ErrorRef

export interface ErrorRef {
  type: 'ERROR'
  code: 'CYCLE' | 'REF' | 'VALUE' | 'DIV0' | 'NAME' | 'NUM'
  message: string
}

// AST для формул
export interface FormulaNode {
  type: 'literal' | 'reference' | 'range' | 'function' | 'binary' | 'unary'
  value?: any
  children?: FormulaNode[]
  name?: string
  operator?: string
}

export interface FormulaAst {
  root: FormulaNode
}

// Якоря для относительных ссылок
export interface Anchor {
  base: CellAddress
  rowMode: 'relative' | 'absolute'
  colMode: 'relative' | 'absolute'
  dRow: number
  dCol: number
}

export interface RangeRef {
  start: Anchor
  end: Anchor
}

// Ячейка
export interface Cell {
  kind: 'scalar' | 'formula'
  value?: Scalar
  ast?: FormulaAst
  cached?: Scalar
  volatile?: boolean
}

// Сегмент для индексации строк/столбцов
export interface Segment {
  startPos: number
  length: number
  rowIds: RowId[]
  deleted?: boolean
}

// Операция структурного изменения
export interface Splice {
  axis: 'row' | 'col'
  at: number
  del: number
  ins: number
}

// Операция для истории
export interface Operation {
  type: 'setCell' | 'setFormula' | 'insertRows' | 'deleteRows' | 'insertCols' | 'deleteCols'
  address?: CellAddress
  value?: Scalar
  formula?: FormulaAst
  position?: number
  count?: number
  range?: [number, number]
  timestamp: number
}

// Состояние листа
export interface SheetState {
  id: string
  name: string
  rows: RowIndex
  cols: ColIndex
  cells: CellStore
  deps: FormulaGraph
  history: Operation[]
  historyIndex: number
}

// Состояние книги
export interface WorkbookState {
  sheets: Map<string, SheetState>
  activeSheet: string
}
