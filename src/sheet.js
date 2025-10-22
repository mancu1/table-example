"use strict";
// Основная логика таблицы: Sheet и Table
Object.defineProperty(exports, "__esModule", { value: true });
exports.Table = exports.Sheet = void 0;
const types_1 = require("./types");
const cell_store_1 = require("./cell-store");
const axis_index_1 = require("./axis-index");
const dep_graph_1 = require("./dep-graph");
const range_watchers_1 = require("./range-watchers");
const parser_1 = require("./parser");
const transform_1 = require("./transform");
class Sheet {
    constructor(initialRows = 100, initialCols = 26) {
        this.rows = new axis_index_1.AxisIndex(initialRows);
        this.cols = new axis_index_1.AxisIndex(initialCols);
        this.cells = new cell_store_1.CellStore();
        this.deps = new dep_graph_1.DepGraph();
        this.ranges = new range_watchers_1.RangeWatchers();
    }
    // Преобразование позиции в адрес
    posToAddr(pos) {
        const rowId = this.rows.posToId(pos.r);
        const colId = this.cols.posToId(pos.c);
        if (!rowId || !colId)
            return undefined;
        return { row: rowId, col: colId };
    }
    // Преобразование адреса в позицию
    addrToPos(addr) {
        const r = this.rows.idToPos(addr.row);
        const c = this.cols.idToPos(addr.col);
        if (r === undefined || c === undefined)
            return undefined;
        return { r, c };
    }
}
exports.Sheet = Sheet;
class Table {
    constructor(initialRows = 100, initialCols = 26) {
        this.sheet = new Sheet(initialRows, initialCols);
    }
    setValue(pos, value) {
        const addr = this.sheet.posToAddr(pos);
        if (!addr)
            return;
        // Удаляем старую ячейку если была формула
        const oldCell = this.sheet.cells.get(addr);
        if (oldCell?.kind === 'formula') {
            this.sheet.deps.removeAll(addr);
            this.sheet.ranges.removeWatches(addr);
        }
        // Устанавливаем значение
        this.sheet.cells.set(addr, { kind: 'value', value });
        // Пересчитываем зависимые
        const dirty = new Set([(0, types_1.addressKey)(addr)]);
        this.recalc(dirty);
    }
    setFormula(pos, src) {
        const addr = this.sheet.posToAddr(pos);
        if (!addr)
            return;
        // Парсим формулу
        const formula = (0, parser_1.parseFormula)(src, pos, this.sheet.rows, this.sheet.cols);
        if (formula === '#REF!') {
            this.sheet.cells.set(addr, { kind: 'value', value: '#REF!' });
            return;
        }
        // Удаляем старые зависимости
        this.sheet.deps.removeAll(addr);
        this.sheet.ranges.removeWatches(addr);
        // Проверяем на циклы и добавляем новые зависимости
        const deps = this.collectDependencies(formula);
        for (const dep of deps) {
            if (this.sheet.deps.wouldCreateCycle(dep, addr)) {
                this.sheet.cells.set(addr, { kind: 'formula', ast: formula, cached: '#CYCLE!' });
                return;
            }
        }
        // Добавляем зависимости
        for (const dep of deps) {
            this.sheet.deps.addEdge(dep, addr);
        }
        // Для SUM регистрируем диапазон
        if (formula.t === 'Sum') {
            this.sheet.ranges.addWatch(formula.range, addr);
        }
        // Сохраняем формулу
        this.sheet.cells.set(addr, { kind: 'formula', ast: formula });
        // Пересчитываем
        const dirty = new Set([(0, types_1.addressKey)(addr)]);
        this.recalc(dirty);
    }
    getValue(pos) {
        const addr = this.sheet.posToAddr(pos);
        if (!addr)
            return undefined;
        const cell = this.sheet.cells.get(addr);
        if (!cell)
            return undefined;
        if (cell.kind === 'value') {
            return cell.value;
        }
        else {
            return cell.cached;
        }
    }
    // Получить исходный текст ячейки (для UI)
    getSource(pos) {
        const addr = this.sheet.posToAddr(pos);
        if (!addr)
            return '';
        const cell = this.sheet.cells.get(addr);
        if (!cell)
            return '';
        if (cell.kind === 'value') {
            return typeof cell.value === 'number' ? String(cell.value) : cell.value;
        }
        else {
            // Форматируем формулу
            const { formatFormula } = require('./parser');
            return formatFormula(cell.ast, this.sheet.rows, this.sheet.cols);
        }
    }
    insertRows(atPos, count) {
        this.applySplice({ axis: 'row', atPos, del: 0, ins: count });
    }
    deleteRows(from, to) {
        const count = to - from + 1;
        this.applySplice({ axis: 'row', atPos: from, del: count, ins: 0 });
    }
    insertCols(atPos, count) {
        this.applySplice({ axis: 'col', atPos, del: 0, ins: count });
    }
    deleteCols(from, to) {
        const count = to - from + 1;
        this.applySplice({ axis: 'col', atPos: from, del: count, ins: 0 });
    }
    applySplice(splice) {
        // СНАЧАЛА трансформируем формулы (ДО обновления индексов!)
        const dirty = new Set();
        for (const [key, cell] of this.sheet.cells.entries()) {
            if (cell.kind !== 'formula')
                continue;
            const addr = (0, types_1.parseAddressKey)(key);
            const formula = cell.ast;
            let changed = false;
            let newFormula = formula;
            if (formula.t === 'Ref') {
                const newRef = (0, transform_1.transformAnchor)(formula.ref, splice, this.sheet.rows, this.sheet.cols);
                if (newRef === '#REF!') {
                    this.sheet.cells.set(addr, { kind: 'value', value: '#REF!' });
                    this.sheet.deps.removeAll(addr);
                    dirty.add(key);
                    continue;
                }
                newFormula = { t: 'Ref', ref: newRef };
                changed = true;
            }
            else {
                const newRange = (0, transform_1.transformRange)(formula.range, splice, this.sheet.rows, this.sheet.cols);
                if (newRange === '#REF!') {
                    this.sheet.cells.set(addr, { kind: 'value', value: '#REF!' });
                    this.sheet.deps.removeAll(addr);
                    dirty.add(key);
                    continue;
                }
                newFormula = { t: 'Sum', range: newRange };
                changed = true;
            }
            if (changed) {
                this.sheet.cells.set(addr, { kind: 'formula', ast: newFormula, cached: cell.cached });
                dirty.add(key);
            }
        }
        // ПОТОМ обновляем индексы
        if (splice.axis === 'row') {
            if (splice.ins > 0) {
                this.sheet.rows.insert(splice.atPos, splice.ins);
            }
            if (splice.del > 0) {
                this.sheet.rows.remove({ from: splice.atPos, to: splice.atPos + splice.del - 1 });
            }
        }
        else {
            if (splice.ins > 0) {
                this.sheet.cols.insert(splice.atPos, splice.ins);
            }
            if (splice.del > 0) {
                this.sheet.cols.remove({ from: splice.atPos, to: splice.atPos + splice.del - 1 });
            }
        }
        // Пересчитываем затронутые
        this.recalc(dirty);
    }
    collectDependencies(formula) {
        const deps = [];
        if (formula.t === 'Ref') {
            const addr = (0, parser_1.anchorToAddress)(formula.ref, this.sheet.rows, this.sheet.cols);
            if (addr !== '#REF!') {
                deps.push(addr);
            }
        }
        else {
            // SUM - собираем все ячейки в диапазоне
            const cells = this.expandRange(formula.range);
            deps.push(...cells);
        }
        return deps;
    }
    expandRange(range) {
        const startAddr = (0, parser_1.anchorToAddress)(range.start, this.sheet.rows, this.sheet.cols);
        const endAddr = (0, parser_1.anchorToAddress)(range.end, this.sheet.rows, this.sheet.cols);
        if (startAddr === '#REF!' || endAddr === '#REF!')
            return [];
        const startPos = this.sheet.addrToPos(startAddr);
        const endPos = this.sheet.addrToPos(endAddr);
        if (!startPos || !endPos)
            return [];
        const cells = [];
        for (let r = Math.min(startPos.r, endPos.r); r <= Math.max(startPos.r, endPos.r); r++) {
            for (let c = Math.min(startPos.c, endPos.c); c <= Math.max(startPos.c, endPos.c); c++) {
                const addr = this.sheet.posToAddr({ r, c });
                if (addr)
                    cells.push(addr);
            }
        }
        return cells;
    }
    recalc(dirty) {
        // Расширяем до всех затронутых
        const affected = this.sheet.deps.affectedFrom(dirty);
        // Топологическая сортировка затронутых
        const sorted = this.topologicalSort(affected);
        // Пересчитываем в порядке зависимостей
        for (const key of sorted) {
            const addr = (0, types_1.parseAddressKey)(key);
            const cell = this.sheet.cells.get(addr);
            if (!cell || cell.kind !== 'formula')
                continue;
            const value = this.evalFormula(cell.ast, addr);
            cell.cached = value;
        }
    }
    topologicalSort(nodes) {
        const sorted = [];
        const visited = new Set();
        const temp = new Set();
        const visit = (key) => {
            if (visited.has(key))
                return;
            if (temp.has(key))
                return; // цикл
            temp.add(key);
            const addr = (0, types_1.parseAddressKey)(key);
            const deps = this.sheet.deps.getDependencies(addr);
            for (const depKey of deps) {
                if (nodes.has(depKey)) {
                    visit(depKey);
                }
            }
            temp.delete(key);
            visited.add(key);
            sorted.push(key);
        };
        for (const key of nodes) {
            visit(key);
        }
        return sorted;
    }
    evalFormula(formula, formulaAddr) {
        if (formula.t === 'Ref') {
            const targetAddr = (0, parser_1.anchorToAddress)(formula.ref, this.sheet.rows, this.sheet.cols);
            if (targetAddr === '#REF!')
                return '#REF!';
            const cell = this.sheet.cells.get(targetAddr);
            if (!cell)
                return 0;
            if (cell.kind === 'value') {
                return typeof cell.value === 'number' ? cell.value : 0;
            }
            else {
                return typeof cell.cached === 'number' ? cell.cached : 0;
            }
        }
        else {
            // SUM
            const cells = this.expandRange(formula.range);
            let sum = 0;
            // Обновляем зависимости для всех ячеек диапазона
            this.sheet.deps.replaceAllInbound(formulaAddr, cells);
            // Регистрируем наблюдение
            for (const cellAddr of cells) {
                this.sheet.ranges.registerCell(cellAddr, formulaAddr);
            }
            for (const cellAddr of cells) {
                const cell = this.sheet.cells.get(cellAddr);
                if (!cell)
                    continue;
                if (cell.kind === 'value') {
                    if (typeof cell.value === 'number') {
                        sum += cell.value;
                    }
                }
                else if (cell.cached !== undefined) {
                    if (typeof cell.cached === 'number') {
                        sum += cell.cached;
                    }
                }
            }
            return sum;
        }
    }
}
exports.Table = Table;
