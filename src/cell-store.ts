// Разреженное хранилище ячеек

import { Address, Cell, addressKey } from './types';

export class CellStore {
  private cells = new Map<string, Cell>();

  get(addr: Address): Cell | undefined {
    return this.cells.get(addressKey(addr));
  }

  set(addr: Address, cell: Cell): void {
    this.cells.set(addressKey(addr), cell);
  }

  del(addr: Address): void {
    this.cells.delete(addressKey(addr));
  }

  has(addr: Address): boolean {
    return this.cells.has(addressKey(addr));
  }

  entries(): IterableIterator<[string, Cell]> {
    return this.cells.entries();
  }

  size(): number {
    return this.cells.size;
  }
}

