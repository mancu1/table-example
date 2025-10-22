"use strict";
// Разреженное хранилище ячеек
Object.defineProperty(exports, "__esModule", { value: true });
exports.CellStore = void 0;
const types_1 = require("./types");
class CellStore {
    constructor() {
        this.cells = new Map();
    }
    get(addr) {
        return this.cells.get((0, types_1.addressKey)(addr));
    }
    set(addr, cell) {
        this.cells.set((0, types_1.addressKey)(addr), cell);
    }
    del(addr) {
        this.cells.delete((0, types_1.addressKey)(addr));
    }
    has(addr) {
        return this.cells.has((0, types_1.addressKey)(addr));
    }
    entries() {
        return this.cells.entries();
    }
    size() {
        return this.cells.size;
    }
}
exports.CellStore = CellStore;
