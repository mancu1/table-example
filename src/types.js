"use strict";
// Базовые типы для табличного редактора
Object.defineProperty(exports, "__esModule", { value: true });
exports.addressEquals = exports.parseAddressKey = exports.addressKey = void 0;
// Вспомогательные функции для работы с адресами
function addressKey(addr) {
    return `${addr.row}:${addr.col}`;
}
exports.addressKey = addressKey;
function parseAddressKey(key) {
    const [row, col] = key.split(':');
    return { row, col };
}
exports.parseAddressKey = parseAddressKey;
function addressEquals(a, b) {
    return a.row === b.row && a.col === b.col;
}
exports.addressEquals = addressEquals;
