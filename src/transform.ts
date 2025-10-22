// Трансформация якорей и диапазонов при вставке/удалении

import { Anchor, RangeRef, Splice } from './types';
import { AxisIndex } from './axis-index';

// Трансформация якоря при сплайсе
export function transformAnchor(
  anchor: Anchor,
  splice: Splice,
  rowAxis: AxisIndex,
  colAxis: AxisIndex
): Anchor | '#REF!' {
  const isRowSplice = splice.axis === 'row';

  // Получаем текущие позиции
  const basePos = isRowSplice
    ? rowAxis.idToPos(anchor.base.row)
    : colAxis.idToPos(anchor.base.col);

  if (basePos === undefined) return '#REF!';

  const mode = isRowSplice ? anchor.rowMode : anchor.colMode;
  const dOffset = isRowSplice ? anchor.dRow : anchor.dCol;
  
  // Целевая позиция ДО сплайса
  const targetPos = basePos + dOffset;

  // Применяем сплайс к позициям
  function applySpliceToPos(pos: number): number | '#REF!' {
    if (splice.del > 0) {
      // Удаление
      if (pos >= splice.atPos && pos < splice.atPos + splice.del) {
        return '#REF!'; // Позиция удалена
      } else if (pos >= splice.atPos + splice.del) {
        return pos - splice.del + splice.ins;
      }
    } else if (splice.ins > 0) {
      // Только вставка
      if (pos >= splice.atPos) {
        return pos + splice.ins;
      }
    }
    return pos;
  }

  const newBasePos = applySpliceToPos(basePos);
  const newTargetPos = mode === 'rel' 
    ? applySpliceToPos(targetPos)  // Относительная - цель тоже сдвигается
    : targetPos;                    // Абсолютная - цель не сдвигается

  if (newBasePos === '#REF!' || newTargetPos === '#REF!') {
    return '#REF!';
  }

  // Новое смещение
  const newDOffset = newTargetPos - newBasePos;

  // Создаем новый якорь
  const result = { ...anchor };
  
  if (isRowSplice) {
    result.dRow = newDOffset;
  } else {
    result.dCol = newDOffset;
  }

  return result;
}

// Трансформация диапазона
export function transformRange(
  range: RangeRef,
  splice: Splice,
  rowAxis: AxisIndex,
  colAxis: AxisIndex
): RangeRef | '#REF!' {
  // Просто трансформируем оба якоря
  // Для относительных ссылок они автоматически "прилипнут" к своим ячейкам
  const newStart = transformAnchor(range.start, splice, rowAxis, colAxis);
  const newEnd = transformAnchor(range.end, splice, rowAxis, colAxis);

  if (newStart === '#REF!' || newEnd === '#REF!') {
    return '#REF!';
  }

  // Проверяем корректность диапазона после трансформации
  const isRowSplice = splice.axis === 'row';
  
  const startBasePos = isRowSplice
    ? rowAxis.idToPos(newStart.base.row)
    : colAxis.idToPos(newStart.base.col);
  const endBasePos = isRowSplice
    ? rowAxis.idToPos(newEnd.base.row)
    : colAxis.idToPos(newEnd.base.col);

  if (startBasePos === undefined || endBasePos === undefined) return '#REF!';

  const startOffset = isRowSplice ? newStart.dRow : newStart.dCol;
  const endOffset = isRowSplice ? newEnd.dRow : newEnd.dCol;

  const finalStartPos = startBasePos + startOffset;
  const finalEndPos = endBasePos + endOffset;

  // Проверяем инверсию диапазона
  if (finalStartPos > finalEndPos) {
    return '#REF!';
  }

  return { start: newStart, end: newEnd };
}

