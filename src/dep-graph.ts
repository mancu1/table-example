// Граф зависимостей для инкрементального пересчета

import { Address, addressKey } from './types';

export class DepGraph {
  // from -> set of to (кто зависит от from)
  private outgoing = new Map<string, Set<string>>();
  // to -> set of from (от кого зависит to)
  private incoming = new Map<string, Set<string>>();

  addEdge(from: Address, to: Address): void {
    const fromKey = addressKey(from);
    const toKey = addressKey(to);

    if (!this.outgoing.has(fromKey)) {
      this.outgoing.set(fromKey, new Set());
    }
    this.outgoing.get(fromKey)!.add(toKey);

    if (!this.incoming.has(toKey)) {
      this.incoming.set(toKey, new Set());
    }
    this.incoming.get(toKey)!.add(fromKey);
  }

  // Заменить все входящие зависимости для узла
  replaceAllInbound(of: Address, newFrom: Address[]): void {
    const ofKey = addressKey(of);
    
    // Удаляем старые входящие
    const oldIncoming = this.incoming.get(ofKey);
    if (oldIncoming) {
      for (const fromKey of oldIncoming) {
        const outSet = this.outgoing.get(fromKey);
        if (outSet) {
          outSet.delete(ofKey);
          if (outSet.size === 0) {
            this.outgoing.delete(fromKey);
          }
        }
      }
    }

    // Устанавливаем новые
    this.incoming.set(ofKey, new Set());
    for (const from of newFrom) {
      this.addEdge(from, of);
    }
  }

  // Удалить все зависимости узла (входящие и исходящие)
  removeAll(of: Address): void {
    const ofKey = addressKey(of);

    // Удаляем исходящие
    const outSet = this.outgoing.get(ofKey);
    if (outSet) {
      for (const toKey of outSet) {
        const inSet = this.incoming.get(toKey);
        if (inSet) {
          inSet.delete(ofKey);
          if (inSet.size === 0) {
            this.incoming.delete(toKey);
          }
        }
      }
      this.outgoing.delete(ofKey);
    }

    // Удаляем входящие
    const inSet = this.incoming.get(ofKey);
    if (inSet) {
      for (const fromKey of inSet) {
        const outSet = this.outgoing.get(fromKey);
        if (outSet) {
          outSet.delete(ofKey);
          if (outSet.size === 0) {
            this.outgoing.delete(fromKey);
          }
        }
      }
      this.incoming.delete(ofKey);
    }
  }

  // Найти все затронутые узлы от изменившихся
  affectedFrom(changed: Set<string>): Set<string> {
    const affected = new Set<string>();
    const queue = Array.from(changed);

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (affected.has(key)) continue;
      
      affected.add(key);
      
      const dependents = this.outgoing.get(key);
      if (dependents) {
        for (const dep of dependents) {
          if (!affected.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    return affected;
  }

  // Проверка на цикл: можно ли добавить ребро from -> to?
  wouldCreateCycle(from: Address, to: Address): boolean {
    const fromKey = addressKey(from);
    const toKey = addressKey(to);

    // Если from зависит от to (прямо или транзитивно), то добавление to->from создаст цикл
    const visited = new Set<string>();
    const queue = [toKey];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === fromKey) return true;
      if (visited.has(current)) continue;
      
      visited.add(current);
      
      const deps = this.outgoing.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    return false;
  }

  // Получить все зависимости узла
  getDependencies(of: Address): Set<string> {
    return this.incoming.get(addressKey(of)) || new Set();
  }

  // Получить всех зависимых от узла
  getDependents(of: Address): Set<string> {
    return this.outgoing.get(addressKey(of)) || new Set();
  }
}

