import type { FormulaAst, FormulaNode, CellAddress, Scalar, ErrorRef } from './types'
import type { SheetState } from './types'

/**
 * Вычислитель формул - выполняет AST и возвращает результат
 */
export class FormulaEvaluator {
  private sheet: SheetState
  private visited = new Set<string>()

  constructor(sheet: SheetState) {
    this.sheet = sheet
  }

  /**
   * Вычислить формулу
   */
  evaluate(ast: FormulaAst, baseAddress: CellAddress): Scalar {
    this.visited.clear()
    return this.evaluateNode(ast.root, baseAddress)
  }

  /**
   * Вычислить узел AST
   */
  private evaluateNode(node: FormulaNode, baseAddress: CellAddress): Scalar {
    switch (node.type) {
      case 'literal':
        return node.value

      case 'reference':
        return this.evaluateReference(node.value, baseAddress)

      case 'range':
        return this.evaluateRange(node.value, baseAddress)

      case 'function':
        return this.evaluateFunction(node.name!, node.children || [], baseAddress)

      case 'binary':
        return this.evaluateBinary(node.operator!, node.children || [], baseAddress)

      case 'unary':
        return this.evaluateUnary(node.operator!, node.children || [], baseAddress)

      default:
        return this.createError('VALUE', `Unknown node type: ${(node as any).type}`)
    }
  }

  /**
   * Вычислить ссылку на ячейку
   */
  private evaluateReference(anchor: any, baseAddress: CellAddress): Scalar {
    const address = this.resolveAnchor(anchor, baseAddress)
    const key = this.addressToKey(address)

    if (this.visited.has(key)) {
      return this.createError('CYCLE', 'Circular reference detected')
    }

    this.visited.add(key)
    const cell = this.sheet.cells.get(address)
    
    if (!cell) {
      return null
    }

    if (cell.kind === 'scalar') {
      return cell.value || null
    }

    if (cell.kind === 'formula') {
      if (cell.cached !== undefined) {
        return cell.cached
      }

      const result = this.evaluate(cell.ast!, address)
      // Кэшируем результат
      cell.cached = result
      return result
    }

    return null
  }

  /**
   * Вычислить диапазон
   */
  private evaluateRange(range: any, baseAddress: CellAddress): Scalar {
    const startAddr = this.resolveAnchor(range.start, baseAddress)
    const endAddr = this.resolveAnchor(range.end, baseAddress)

    // Для диапазонов возвращаем массив значений
    const values: Scalar[] = []
    
    // Упрощенная реализация - в реальности нужно итерировать по диапазону
    const startCell = this.sheet.cells.get(startAddr)
    const endCell = this.sheet.cells.get(endAddr)
    
    if (startCell && startCell.kind === 'scalar') {
      values.push(startCell.value || null)
    }
    
    if (endCell && endCell.kind === 'scalar') {
      values.push(endCell.value || null)
    }

    return values
  }

  /**
   * Вычислить функцию
   */
  private evaluateFunction(name: string, args: FormulaNode[], baseAddress: CellAddress): Scalar {
    const values = args.map(arg => this.evaluateNode(arg, baseAddress))

    switch (name.toUpperCase()) {
      case 'SUM':
        return this.sum(values)
      case 'AVERAGE':
        return this.average(values)
      case 'COUNT':
        return this.count(values)
      case 'MAX':
        return this.max(values)
      case 'MIN':
        return this.min(values)
      case 'IF':
        return this.ifFunction(values)
      case 'AND':
        return this.andFunction(values)
      case 'OR':
        return this.orFunction(values)
      case 'NOT':
        return this.notFunction(values[0])
      default:
        return this.createError('NAME', `Unknown function: ${name}`)
    }
  }

  /**
   * Вычислить бинарную операцию
   */
  private evaluateBinary(operator: string, children: FormulaNode[], baseAddress: CellAddress): Scalar {
    if (children.length !== 2) {
      return this.createError('VALUE', 'Binary operation requires exactly 2 operands')
    }

    const left = this.evaluateNode(children[0], baseAddress)
    const right = this.evaluateNode(children[1], baseAddress)

    if (this.isError(left) || this.isError(right)) {
      return left
    }

    switch (operator) {
      case '+':
        return this.add(left, right)
      case '-':
        return this.subtract(left, right)
      case '*':
        return this.multiply(left, right)
      case '/':
        return this.divide(left, right)
      case '^':
        return this.power(left, right)
      case '=':
        return left === right
      case '<':
        return this.compare(left, right) < 0
      case '>':
        return this.compare(left, right) > 0
      case '<=':
        return this.compare(left, right) <= 0
      case '>=':
        return this.compare(left, right) >= 0
      case '<>':
        return left !== right
      case '&':
        return this.concatenate(left, right)
      default:
        return this.createError('VALUE', `Unknown operator: ${operator}`)
    }
  }

  /**
   * Вычислить унарную операцию
   */
  private evaluateUnary(operator: string, children: FormulaNode[], baseAddress: CellAddress): Scalar {
    if (children.length !== 1) {
      return this.createError('VALUE', 'Unary operation requires exactly 1 operand')
    }

    const value = this.evaluateNode(children[0], baseAddress)

    if (this.isError(value)) {
      return value
    }

    switch (operator) {
      case '+':
        return this.toNumber(value)
      case '-':
        return -this.toNumber(value)
      default:
        return this.createError('VALUE', `Unknown unary operator: ${operator}`)
    }
  }

  /**
   * Разрешить якорь в адрес ячейки
   */
  private resolveAnchor(anchor: any, baseAddress: CellAddress): CellAddress {
    // Упрощенная реализация - в реальности нужно учитывать относительность
    return {
      row: anchor.base.row,
      col: anchor.base.col
    }
  }

  // Математические функции
  private sum(values: Scalar[]): number {
    return values.reduce((sum, val) => sum + this.toNumber(val), 0)
  }

  private average(values: Scalar[]): number {
    const numbers = values.map(v => this.toNumber(v)).filter(n => !isNaN(n))
    return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0
  }

  private count(values: Scalar[]): number {
    return values.filter(v => v !== null && v !== undefined).length
  }

  private max(values: Scalar[]): number {
    const numbers = values.map(v => this.toNumber(v)).filter(n => !isNaN(n))
    return numbers.length > 0 ? Math.max(...numbers) : 0
  }

  private min(values: Scalar[]): number {
    const numbers = values.map(v => this.toNumber(v)).filter(n => !isNaN(n))
    return numbers.length > 0 ? Math.min(...numbers) : 0
  }

  private ifFunction(values: Scalar[]): Scalar {
    if (values.length < 2) return this.createError('VALUE', 'IF requires at least 2 arguments')
    
    const condition = this.toBoolean(values[0])
    return condition ? values[1] : (values[2] || false)
  }

  private andFunction(values: Scalar[]): boolean {
    return values.every(v => this.toBoolean(v))
  }

  private orFunction(values: Scalar[]): boolean {
    return values.some(v => this.toBoolean(v))
  }

  private notFunction(value: Scalar): boolean {
    return !this.toBoolean(value)
  }

  // Базовые операции
  private add(left: Scalar, right: Scalar): number {
    return this.toNumber(left) + this.toNumber(right)
  }

  private subtract(left: Scalar, right: Scalar): number {
    return this.toNumber(left) - this.toNumber(right)
  }

  private multiply(left: Scalar, right: Scalar): number {
    return this.toNumber(left) * this.toNumber(right)
  }

  private divide(left: Scalar, right: Scalar): number {
    const rightNum = this.toNumber(right)
    if (rightNum === 0) {
      return this.createError('DIV0', 'Division by zero') as any
    }
    return this.toNumber(left) / rightNum
  }

  private power(left: Scalar, right: Scalar): number {
    return Math.pow(this.toNumber(left), this.toNumber(right))
  }

  private compare(left: Scalar, right: Scalar): number {
    const leftNum = this.toNumber(left)
    const rightNum = this.toNumber(right)
    
    if (isNaN(leftNum) || isNaN(rightNum)) {
      return left.toString().localeCompare(right.toString())
    }
    
    return leftNum - rightNum
  }

  private concatenate(left: Scalar, right: Scalar): string {
    return left.toString() + right.toString()
  }

  // Утилиты
  private toNumber(value: Scalar): number {
    if (typeof value === 'number') return value
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'string') {
      const num = parseFloat(value)
      return isNaN(num) ? 0 : num
    }
    return 0
  }

  private toBoolean(value: Scalar): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') return value.toLowerCase() === 'true'
    return false
  }

  private isError(value: Scalar): value is ErrorRef {
    return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ERROR'
  }

  private createError(code: string, message: string): ErrorRef {
    return {
      type: 'ERROR',
      code: code as any,
      message
    }
  }

  private addressToKey(addr: CellAddress): string {
    return `${addr.row}:${addr.col}`
  }
}
