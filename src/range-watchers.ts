// Наблюдатели диапазонов для SUM и подобных функций

import { Address, RangeRef, addressKey } from './types';

export class RangeWatchers {
  // Каждая ячейка -> формулы, которые её наблюдают
  private watchers = new Map<string, Set<string>>();
  
  // Каждая формула -> диапазоны, которые она наблюдает (для быстрого удаления)
  private formulaRanges = new Map<string, RangeRef[]>();

  addWatch(range: RangeRef, formulaAt: Address): void {
    const formulaKey = addressKey(formulaAt);
    
    // Сохраняем диапазон для формулы
    if (!this.formulaRanges.has(formulaKey)) {
      this.formulaRanges.set(formulaKey, []);
    }
    this.formulaRanges.get(formulaKey)!.push(range);
  }

  removeWatches(formulaAt: Address): void {
    const formulaKey = addressKey(formulaAt);
    
    // Удаляем все наблюдения для этой формулы
    this.formulaRanges.delete(formulaKey);
    
    // Удаляем из watchers
    for (const [cellKey, formulas] of this.watchers.entries()) {
      formulas.delete(formulaKey);
      if (formulas.size === 0) {
        this.watchers.delete(cellKey);
      }
    }
  }

  // Регистрация конкретной ячейки как наблюдаемой формулой
  registerCell(cellAddr: Address, formulaAt: Address): void {
    const cellKey = addressKey(cellAddr);
    const formulaKey = addressKey(formulaAt);
    
    if (!this.watchers.has(cellKey)) {
      this.watchers.set(cellKey, new Set());
    }
    this.watchers.get(cellKey)!.add(formulaKey);
  }

  watchersOf(addr: Address): Set<string> {
    return this.watchers.get(addressKey(addr)) || new Set();
  }

  // Получить диапазоны формулы
  getRanges(formulaAt: Address): RangeRef[] {
    return this.formulaRanges.get(addressKey(formulaAt)) || [];
  }
}

