// Базовые типы для табличного редактора

export type RowId = string;
export type ColId = string;

export interface Address {
  row: RowId;
  col: ColId;
}

export type Scalar = number | '#REF!' | '#CYCLE!';

export type RowColMode = 'rel' | 'abs';

// Якорь ссылки: как из "базы" получить фактический адрес
export interface Anchor {
  base: Address;           // где стоит формула
  rowMode: RowColMode;
  colMode: RowColMode;
  dRow: number;            // смещение от base по строке
  dCol: number;            // смещение от base по столбцу
}

export interface RangeRef {
  start: Anchor;
  end: Anchor;
}

export type Cell =
  | { kind: 'value'; value: Scalar }
  | { kind: 'formula'; ast: Formula; cached?: Scalar };

export type Formula =
  | { t: 'Ref'; ref: Anchor }
  | { t: 'Sum'; range: RangeRef };

export interface Splice {
  axis: 'row' | 'col';
  atPos: number;
  del: number;
  ins: number;
}

export interface Position {
  r: number;  // 1-based
  c: number;  // 1-based
}

// Вспомогательные функции для работы с адресами
export function addressKey(addr: Address): string {
  return `${addr.row}:${addr.col}`;
}

export function parseAddressKey(key: string): Address {
  const [row, col] = key.split(':');
  return { row, col };
}

export function addressEquals(a: Address, b: Address): boolean {
  return a.row === b.row && a.col === b.col;
}

