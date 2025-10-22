import { describe, it, expect } from 'vitest'
import { FormulaParser } from '../formula-parser'

describe('FormulaParser', () => {
  let parser: FormulaParser

  beforeEach(() => {
    parser = new FormulaParser()
  })

  describe('Basic Parsing', () => {
    it('should parse simple arithmetic', () => {
      const ast = parser.parse('=2+3')
      expect(ast.root.type).toBe('binary')
      expect(ast.root.operator).toBe('+')
      expect(ast.root.children).toHaveLength(2)
    })

    it('should parse cell references', () => {
      const ast = parser.parse('=A1')
      expect(ast.root.type).toBe('reference')
      expect(ast.root.value).toBeDefined()
    })

    it('should parse ranges', () => {
      const ast = parser.parse('=A1:B2')
      expect(ast.root.type).toBe('range')
      expect(ast.root.value).toBeDefined()
    })

    it('should parse functions', () => {
      const ast = parser.parse('=SUM(A1:A10)')
      expect(ast.root.type).toBe('function')
      expect(ast.root.name).toBe('SUM')
      expect(ast.root.children).toHaveLength(1)
    })
  })

  describe('Operator Precedence', () => {
    it('should handle multiplication before addition', () => {
      const ast = parser.parse('=2+3*4')
      // Должно парситься как 2+(3*4), а не (2+3)*4
      expect(ast.root.type).toBe('binary')
      expect(ast.root.operator).toBe('+')
    })

    it('should handle parentheses', () => {
      const ast = parser.parse('=(2+3)*4')
      expect(ast.root.type).toBe('binary')
      expect(ast.root.operator).toBe('*')
    })
  })

  describe('Complex Formulas', () => {
    it('should parse nested functions', () => {
      const ast = parser.parse('=SUM(A1:A10)+AVERAGE(B1:B5)')
      expect(ast.root.type).toBe('binary')
      expect(ast.root.operator).toBe('+')
      expect(ast.root.children).toHaveLength(2)
    })

    it('should parse conditional formulas', () => {
      const ast = parser.parse('=IF(A1>0,SUM(B1:B10),0)')
      expect(ast.root.type).toBe('function')
      expect(ast.root.name).toBe('IF')
      expect(ast.root.children).toHaveLength(3)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid syntax gracefully', () => {
      expect(() => parser.parse('=2++3')).toThrow()
    })

    it('should handle empty formulas', () => {
      expect(() => parser.parse('=')).toThrow()
    })
  })
})
