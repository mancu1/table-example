"use strict";
// Наблюдатели диапазонов для SUM и подобных функций
Object.defineProperty(exports, "__esModule", { value: true });
exports.RangeWatchers = void 0;
const types_1 = require("./types");
class RangeWatchers {
    constructor() {
        // Каждая ячейка -> формулы, которые её наблюдают
        this.watchers = new Map();
        // Каждая формула -> диапазоны, которые она наблюдает (для быстрого удаления)
        this.formulaRanges = new Map();
    }
    addWatch(range, formulaAt) {
        const formulaKey = (0, types_1.addressKey)(formulaAt);
        // Сохраняем диапазон для формулы
        if (!this.formulaRanges.has(formulaKey)) {
            this.formulaRanges.set(formulaKey, []);
        }
        this.formulaRanges.get(formulaKey).push(range);
    }
    removeWatches(formulaAt) {
        const formulaKey = (0, types_1.addressKey)(formulaAt);
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
    registerCell(cellAddr, formulaAt) {
        const cellKey = (0, types_1.addressKey)(cellAddr);
        const formulaKey = (0, types_1.addressKey)(formulaAt);
        if (!this.watchers.has(cellKey)) {
            this.watchers.set(cellKey, new Set());
        }
        this.watchers.get(cellKey).add(formulaKey);
    }
    watchersOf(addr) {
        return this.watchers.get((0, types_1.addressKey)(addr)) || new Set();
    }
    // Получить диапазоны формулы
    getRanges(formulaAt) {
        return this.formulaRanges.get((0, types_1.addressKey)(formulaAt)) || [];
    }
}
exports.RangeWatchers = RangeWatchers;
