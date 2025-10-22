// Индексация позиций: позиции -> ID и обратно
// Простая реализация через массив сегментов

export type AxisId = string;

interface Segment {
  startPos: number;  // 1-based, inclusive
  ids: AxisId[];     // последовательные ID
}

export class AxisIndex {
  private segments: Segment[] = [];
  private nextId = 0;

  constructor(initialCount: number = 100) {
    // Инициализируем начальными позициями
    const ids: AxisId[] = [];
    for (let i = 0; i < initialCount; i++) {
      ids.push(this.generateId());
    }
    this.segments.push({ startPos: 1, ids });
  }

  private generateId(): AxisId {
    return `id${this.nextId++}`;
  }

  // O(log S + offset в сегменте)
  posToId(pos: number): AxisId | undefined {
    for (const seg of this.segments) {
      const endPos = seg.startPos + seg.ids.length - 1;
      if (pos >= seg.startPos && pos <= endPos) {
        const offset = pos - seg.startPos;
        return seg.ids[offset];
      }
    }
    return undefined;
  }

  // O(S * ids.length) - можно оптимизировать с обратным индексом
  idToPos(id: AxisId): number | undefined {
    let currentPos = 1;
    for (const seg of this.segments) {
      const idx = seg.ids.indexOf(id);
      if (idx !== -1) {
        return seg.startPos + idx;
      }
      currentPos = seg.startPos + seg.ids.length;
    }
    return undefined;
  }

  // Вставка count позиций на позиции atPos
  insert(atPos: number, count: number): AxisId[] {
    const newIds: AxisId[] = [];
    for (let i = 0; i < count; i++) {
      newIds.push(this.generateId());
    }

    // Находим сегмент, куда вставляем
    let inserted = false;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const segEnd = seg.startPos + seg.ids.length - 1;

      if (atPos >= seg.startPos && atPos <= segEnd + 1) {
        // Вставка внутри или сразу после этого сегмента
        const offset = atPos - seg.startPos;
        seg.ids.splice(offset, 0, ...newIds);
        inserted = true;

        // Сдвигаем последующие сегменты
        for (let j = i + 1; j < this.segments.length; j++) {
          this.segments[j].startPos += count;
        }
        break;
      }
    }

    if (!inserted) {
      // Вставка в конец
      const lastSeg = this.segments[this.segments.length - 1];
      const nextPos = lastSeg ? lastSeg.startPos + lastSeg.ids.length : 1;
      this.segments.push({ startPos: nextPos, ids: newIds });
    }

    return newIds;
  }

  // Удаление диапазона [from, to] включительно
  remove(range: { from: number; to: number }): void {
    const { from, to } = range;
    const count = to - from + 1;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const segEnd = seg.startPos + seg.ids.length - 1;

      if (to < seg.startPos) {
        // Удаление до этого сегмента - только сдвигаем
        seg.startPos -= count;
        continue;
      }

      if (from > segEnd) {
        // Удаление после этого сегмента - не трогаем
        continue;
      }

      // Есть пересечение
      const delStart = Math.max(from, seg.startPos);
      const delEnd = Math.min(to, segEnd);
      const delOffset = delStart - seg.startPos;
      const delCount = delEnd - delStart + 1;

      seg.ids.splice(delOffset, delCount);

      // Сдвигаем последующие сегменты
      for (let j = i + 1; j < this.segments.length; j++) {
        this.segments[j].startPos -= count;
      }

      // Если сегмент стал пустым, удаляем его
      if (seg.ids.length === 0) {
        this.segments.splice(i, 1);
        i--;
      }
    }
  }

  segmentCount(): number {
    return this.segments.length;
  }

  maxPos(): number {
    if (this.segments.length === 0) return 0;
    const last = this.segments[this.segments.length - 1];
    return last.startPos + last.ids.length - 1;
  }

  // Общее количество ID во всех сегментах
  totalIds(): number {
    return this.segments.reduce((sum, seg) => sum + seg.ids.length, 0);
  }

  // Информация о сегментах для отладки
  getSegmentsInfo(): Array<{ startPos: number; count: number; ids: string[] }> {
    return this.segments.map(seg => ({
      startPos: seg.startPos,
      count: seg.ids.length,
      ids: seg.ids.slice(0, 5).concat(seg.ids.length > 5 ? ['...'] : []) // первые 5 ID
    }));
  }
}

