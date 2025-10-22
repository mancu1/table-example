import type { FormulaAst, FormulaNode, CellAddress, Anchor, RangeRef } from './types'

/**
 * Парсер формул - преобразует строку в AST
 */
export class FormulaParser {
  private tokens: string[] = []
  private position = 0

  /**
   * Парсить формулу в AST
   */
  parse(formula: string): FormulaAst {
    // Убираем знак равенства в начале
    const cleanFormula = formula.startsWith('=') ? formula.slice(1) : formula
    
    this.tokens = this.tokenize(cleanFormula)
    this.position = 0

    const root = this.parseExpression()
    return { root }
  }

  /**
   * Токенизация формулы
   */
  private tokenize(formula: string): string[] {
    const tokens: string[] = []
    let current = ''
    let inQuotes = false
    let inReference = false

    for (let i = 0; i < formula.length; i++) {
      const char = formula[i]
      const nextChar = formula[i + 1]

      if (char === '"' && !inQuotes) {
        inQuotes = true
        if (current) {
          tokens.push(current)
          current = ''
        }
        current += char
      } else if (char === '"' && inQuotes) {
        inQuotes = false
        current += char
        tokens.push(current)
        current = ''
      } else if (inQuotes) {
        current += char
      } else if (this.isOperator(char)) {
        if (current) {
          tokens.push(current)
          current = ''
        }
        tokens.push(char)
      } else if (char === '(' || char === ')') {
        if (current) {
          tokens.push(current)
          current = ''
        }
        tokens.push(char)
      } else if (char === ',') {
        if (current) {
          tokens.push(current)
          current = ''
        }
        tokens.push(char)
      } else if (char === ':' && inReference) {
        current += char
      } else if (this.isReferenceChar(char)) {
        inReference = true
        current += char
      } else if (char === ' ' && !inReference) {
        if (current) {
          tokens.push(current)
          current = ''
        }
        // Пропускаем пробелы
      } else {
        if (inReference && !this.isReferenceChar(char)) {
          inReference = false
          if (current) {
            tokens.push(current)
            current = ''
          }
        }
        current += char
      }
    }

    if (current) {
      tokens.push(current)
    }

    return tokens.filter(token => token.trim() !== '')
  }

  /**
   * Парсить выражение
   */
  private parseExpression(): FormulaNode {
    return this.parseBinaryExpression(0)
  }

  /**
   * Парсить бинарное выражение с учетом приоритетов
   */
  private parseBinaryExpression(precedence: number): FormulaNode {
    let left = this.parseUnaryExpression()

    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position]
      const opPrecedence = this.getOperatorPrecedence(token)

      if (opPrecedence <= precedence) break

      this.position++
      const right = this.parseBinaryExpression(opPrecedence)

      left = {
        type: 'binary',
        operator: token,
        children: [left, right]
      }
    }

    return left
  }

  /**
   * Парсить унарное выражение
   */
  private parseUnaryExpression(): FormulaNode {
    const token = this.tokens[this.position]

    if (token === '-' || token === '+') {
      this.position++
      return {
        type: 'unary',
        operator: token,
        children: [this.parsePrimaryExpression()]
      }
    }

    return this.parsePrimaryExpression()
  }

  /**
   * Парсить первичное выражение
   */
  private parsePrimaryExpression(): FormulaNode {
    const token = this.tokens[this.position]

    if (token === '(') {
      this.position++ // consume '('
      const expr = this.parseExpression()
      this.position++ // consume ')'
      return expr
    }

    if (this.isFunction(token)) {
      return this.parseFunction()
    }

    if (this.isReference(token)) {
      return this.parseReference()
    }

    if (this.isLiteral(token)) {
      this.position++
      return {
        type: 'literal',
        value: this.parseLiteral(token)
      }
    }

    throw new Error(`Unexpected token: ${token}`)
  }

  /**
   * Парсить функцию
   */
  private parseFunction(): FormulaNode {
    const name = this.tokens[this.position]
    this.position++ // consume function name
    this.position++ // consume '('

    const args: FormulaNode[] = []

    if (this.tokens[this.position] !== ')') {
      args.push(this.parseExpression())

      while (this.tokens[this.position] === ',') {
        this.position++ // consume ','
        args.push(this.parseExpression())
      }
    }

    this.position++ // consume ')'

    return {
      type: 'function',
      name,
      children: args
    }
  }

  /**
   * Парсить ссылку на ячейку или диапазон
   */
  private parseReference(): FormulaNode {
    const token = this.tokens[this.position]
    this.position++

    if (token.includes(':')) {
      // Диапазон
      const [start, end] = token.split(':')
      return {
        type: 'range',
        value: {
          start: this.parseCellReference(start),
          end: this.parseCellReference(end)
        }
      }
    } else {
      // Одиночная ячейка
      return {
        type: 'reference',
        value: this.parseCellReference(token)
      }
    }
  }

  /**
   * Парсить ссылку на ячейку (A1, $A$1, A$1, $A1)
   */
  private parseCellReference(ref: string): Anchor {
    const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/)
    if (!match) {
      throw new Error(`Invalid cell reference: ${ref}`)
    }

    const [, colAbs, col, rowAbs, row] = match

    return {
      base: { row: `row_${row}`, col: `col_${this.columnToNumber(col)}` },
      rowMode: rowAbs === '$' ? 'absolute' : 'relative',
      colMode: colAbs === '$' ? 'absolute' : 'relative',
      dRow: 0,
      dCol: 0
    }
  }

  /**
   * Преобразовать буквенное обозначение столбца в число
   */
  private columnToNumber(col: string): number {
    let result = 0
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1)
    }
    return result
  }

  /**
   * Преобразовать число в буквенное обозначение столбца
   */
  private numberToColumn(num: number): string {
    let result = ''
    while (num > 0) {
      num--
      result = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + result
      num = Math.floor(num / 26)
    }
    return result
  }

  /**
   * Парсить литерал
   */
  private parseLiteral(token: string): any {
    if (token.startsWith('"') && token.endsWith('"')) {
      return token.slice(1, -1) // Убираем кавычки
    }

    if (token === 'TRUE') return true
    if (token === 'FALSE') return false
    if (token === 'NULL' || token === '') return null

    const num = parseFloat(token)
    if (!isNaN(num)) return num

    return token
  }

  private isOperator(char: string): boolean {
    return ['+', '-', '*', '/', '^', '=', '<', '>', '&'].includes(char)
  }

  private isReferenceChar(char: string): boolean {
    return /[A-Z0-9$:]/.test(char)
  }

  private isFunction(token: string): boolean {
    const functions = ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF', 'AND', 'OR', 'NOT']
    return functions.includes(token.toUpperCase())
  }

  private isReference(token: string): boolean {
    return /^[A-Z]+\d+$/.test(token) || /^[A-Z]+\d+:[A-Z]+\d+$/.test(token)
  }

  private isLiteral(token: string): boolean {
    return !this.isFunction(token) && !this.isReference(token) && 
           (token.startsWith('"') || !isNaN(parseFloat(token)) || 
            ['TRUE', 'FALSE', 'NULL'].includes(token))
  }

  private getOperatorPrecedence(operator: string): number {
    const precedences: Record<string, number> = {
      '^': 4,
      '*': 3, '/': 3,
      '+': 2, '-': 2,
      '=': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '<>': 1,
      '&': 0
    }
    return precedences[operator] || 0
  }
}
