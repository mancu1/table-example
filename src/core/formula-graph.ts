import type { CellAddress, Cell, ErrorRef } from './types'

/**
 * Граф зависимостей для инкрементального пересчета формул
 */
export class FormulaGraph {
  private dependencies = new Map<string, Set<string>>() // to -> from
  private dependents = new Map<string, Set<string>>() // from -> to
  private volatile = new Set<string>() // волатильные ячейки

  /**
   * Добавить зависимость
   */
  addEdge(from: CellAddress, to: CellAddress): void {
    const fromKey = this.addressToKey(from)
    const toKey = this.addressToKey(to)

    // Добавляем в граф зависимостей
    if (!this.dependencies.has(toKey)) {
      this.dependencies.set(toKey, new Set())
    }
    this.dependencies.get(toKey)!.add(fromKey)

    // Добавляем в граф зависимых
    if (!this.dependents.has(fromKey)) {
      this.dependents.set(fromKey, new Set())
    }
    this.dependents.get(fromKey)!.add(toKey)
  }

  /**
   * Удалить зависимость
   */
  removeEdge(from: CellAddress, to: CellAddress): void {
    const fromKey = this.addressToKey(from)
    const toKey = this.addressToKey(to)

    this.dependencies.get(toKey)?.delete(fromKey)
    this.dependents.get(fromKey)?.delete(toKey)
  }

  /**
   * Удалить все зависимости ячейки
   */
  removeEdges(of: CellAddress): void {
    const ofKey = this.addressToKey(of)

    // Удаляем все исходящие зависимости
    const dependents = this.dependents.get(ofKey)
    if (dependents) {
      for (const dependent of dependents) {
        this.dependencies.get(dependent)?.delete(ofKey)
      }
      this.dependents.delete(ofKey)
    }

    // Удаляем все входящие зависимости
    const dependencies = this.dependencies.get(ofKey)
    if (dependencies) {
      for (const dependency of dependencies) {
        this.dependents.get(dependency)?.delete(ofKey)
      }
      this.dependencies.delete(ofKey)
    }
  }

  /**
   * Получить все ячейки, которые зависят от измененных
   */
  affectedBy(changed: Set<CellAddress>): Set<CellAddress> {
    const affected = new Set<CellAddress>()
    const visited = new Set<string>()
    const queue = Array.from(changed).map(addr => this.addressToKey(addr))

    // BFS для поиска всех зависимых ячеек
    while (queue.length > 0) {
      const currentKey = queue.shift()!
      if (visited.has(currentKey)) continue
      visited.add(currentKey)

      const dependents = this.dependents.get(currentKey)
      if (dependents) {
        for (const dependentKey of dependents) {
          if (!visited.has(dependentKey)) {
            queue.push(dependentKey)
            affected.add(this.keyToAddress(dependentKey))
          }
        }
      }
    }

    return affected
  }

  /**
   * Проверить наличие циклов
   */
  detectCycles(): CellAddress[] {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const cycles: CellAddress[] = []

    const dfs = (key: string, path: string[]): boolean => {
      if (recursionStack.has(key)) {
        // Найден цикл
        const cycleStart = path.indexOf(key)
        cycles.push(...path.slice(cycleStart).map(k => this.keyToAddress(k)))
        return true
      }

      if (visited.has(key)) return false

      visited.add(key)
      recursionStack.add(key)
      path.push(key)

      const dependents = this.dependents.get(key)
      if (dependents) {
        for (const dependent of dependents) {
          if (dfs(dependent, [...path])) {
            return true
          }
        }
      }

      recursionStack.delete(key)
      return false
    }

    // Проверяем все узлы
    for (const key of this.dependencies.keys()) {
      if (!visited.has(key)) {
        dfs(key, [])
      }
    }

    return cycles
  }

  /**
   * Получить топологический порядок для пересчета
   */
  getTopologicalOrder(): CellAddress[] {
    const result: CellAddress[] = []
    const visited = new Set<string>()
    const temp = new Set<string>()

    const visit = (key: string): void => {
      if (temp.has(key)) {
        // Цикл - помечаем как ошибку
        return
      }

      if (visited.has(key)) return

      temp.add(key)

      const dependencies = this.dependencies.get(key)
      if (dependencies) {
        for (const dep of dependencies) {
          visit(dep)
        }
      }

      temp.delete(key)
      visited.add(key)
      result.push(this.keyToAddress(key))
    }

    // Обрабатываем все узлы
    for (const key of this.dependencies.keys()) {
      if (!visited.has(key)) {
        visit(key)
      }
    }

    return result
  }

  /**
   * Пометить ячейку как волатильную
   */
  markVolatile(addr: CellAddress): void {
    const key = this.addressToKey(addr)
    this.volatile.add(key)
  }

  /**
   * Проверить, является ли ячейка волатильной
   */
  isVolatile(addr: CellAddress): boolean {
    const key = this.addressToKey(addr)
    return this.volatile.has(key)
  }

  /**
   * Получить все волатильные ячейки
   */
  getVolatileCells(): CellAddress[] {
    return Array.from(this.volatile).map(key => this.keyToAddress(key))
  }

  /**
   * Очистить граф
   */
  clear(): void {
    this.dependencies.clear()
    this.dependents.clear()
    this.volatile.clear()
  }

  /**
   * Получить статистику графа
   */
  getStats(): { nodes: number; edges: number; volatile: number } {
    return {
      nodes: this.dependencies.size,
      edges: Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.size, 0),
      volatile: this.volatile.size
    }
  }

  private addressToKey(addr: CellAddress): string {
    return `${addr.row}:${addr.col}`
  }

  private keyToAddress(key: string): CellAddress {
    const [row, col] = key.split(':')
    return { row, col }
  }
}
