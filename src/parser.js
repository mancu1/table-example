"use strict";
// Парсер формул: =A1, =$B$2, =SUM(A1:C3)
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFormula = exports.formatAnchor = exports.anchorToAddress = exports.parseFormula = exports.parseReference = exports.letterToCol = exports.colToLetter = void 0;
// Преобразование позиции в букву колонки (A, B, ..., Z, AA, AB, ...)
function colToLetter(col) {
    let letter = '';
    while (col > 0) {
        const remainder = (col - 1) % 26;
        letter = String.fromCharCode(65 + remainder) + letter;
        col = Math.floor((col - 1) / 26);
    }
    return letter;
}
exports.colToLetter = colToLetter;
// Преобразование буквы колонки в позицию
function letterToCol(letter) {
    let col = 0;
    for (let i = 0; i < letter.length; i++) {
        col = col * 26 + (letter.charCodeAt(i) - 65 + 1);
    }
    return col;
}
exports.letterToCol = letterToCol;
// Парсинг ссылки A1 или $A$1
function parseReference(ref, basePos, rowAxis, colAxis) {
    const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match)
        return null;
    const colAbs = match[1] === '$';
    const colLetter = match[2];
    const rowAbs = match[3] === '$';
    const rowNum = parseInt(match[4], 10);
    const colPos = letterToCol(colLetter);
    const baseRowId = rowAxis.posToId(basePos.r);
    const baseColId = colAxis.posToId(basePos.c);
    if (!baseRowId || !baseColId)
        return null;
    const anchor = {
        base: { row: baseRowId, col: baseColId },
        rowMode: rowAbs ? 'abs' : 'rel',
        colMode: colAbs ? 'abs' : 'rel',
        dRow: rowNum - basePos.r,
        dCol: colPos - basePos.c,
    };
    return anchor;
}
exports.parseReference = parseReference;
// Парсинг формулы
function parseFormula(src, basePos, rowAxis, colAxis) {
    src = src.trim();
    if (!src.startsWith('=')) {
        return '#REF!';
    }
    const expr = src.substring(1).trim();
    // SUM(A1:B2)
    const sumMatch = expr.match(/^SUM\(([^:]+):([^)]+)\)$/i);
    if (sumMatch) {
        const start = parseReference(sumMatch[1].trim(), basePos, rowAxis, colAxis);
        const end = parseReference(sumMatch[2].trim(), basePos, rowAxis, colAxis);
        if (!start || !end)
            return '#REF!';
        return {
            t: 'Sum',
            range: { start, end },
        };
    }
    // Простая ссылка
    const anchor = parseReference(expr, basePos, rowAxis, colAxis);
    if (anchor) {
        return { t: 'Ref', ref: anchor };
    }
    return '#REF!';
}
exports.parseFormula = parseFormula;
// Преобразование якоря обратно в адрес
function anchorToAddress(anchor, rowAxis, colAxis) {
    const baseRowPos = rowAxis.idToPos(anchor.base.row);
    const baseColPos = colAxis.idToPos(anchor.base.col);
    if (baseRowPos === undefined || baseColPos === undefined) {
        return '#REF!';
    }
    const targetRowPos = anchor.rowMode === 'abs'
        ? baseRowPos + anchor.dRow
        : baseRowPos + anchor.dRow;
    const targetColPos = anchor.colMode === 'abs'
        ? baseColPos + anchor.dCol
        : baseColPos + anchor.dCol;
    const targetRowId = rowAxis.posToId(targetRowPos);
    const targetColId = colAxis.posToId(targetColPos);
    if (!targetRowId || !targetColId) {
        return '#REF!';
    }
    return { row: targetRowId, col: targetColId };
}
exports.anchorToAddress = anchorToAddress;
// Форматирование якоря в текст (для отладки)
function formatAnchor(anchor, rowAxis, colAxis) {
    const addr = anchorToAddress(anchor, rowAxis, colAxis);
    if (addr === '#REF!')
        return '#REF!';
    const rowPos = rowAxis.idToPos(addr.row);
    const colPos = colAxis.idToPos(addr.col);
    if (rowPos === undefined || colPos === undefined)
        return '#REF!';
    const colPrefix = anchor.colMode === 'abs' ? '$' : '';
    const rowPrefix = anchor.rowMode === 'abs' ? '$' : '';
    return `${colPrefix}${colToLetter(colPos)}${rowPrefix}${rowPos}`;
}
exports.formatAnchor = formatAnchor;
// Форматирование формулы в текст
function formatFormula(formula, rowAxis, colAxis) {
    if (formula.t === 'Ref') {
        return '=' + formatAnchor(formula.ref, rowAxis, colAxis);
    }
    else {
        const start = formatAnchor(formula.range.start, rowAxis, colAxis);
        const end = formatAnchor(formula.range.end, rowAxis, colAxis);
        return `=SUM(${start}:${end})`;
    }
}
exports.formatFormula = formatFormula;
