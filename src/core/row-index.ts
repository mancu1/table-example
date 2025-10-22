import type { RowId, Segment } from './types'

/**
 * Индекс строк - поддерживает вставку/удаление с O(log S) сложностью
 * Использует сегментированную структуру для эффективных операций
 */
export class RowIndex {
  private segments: Segment[] = []
  private nextId = 1

  constructor() {
    // Инициализируем пустой индекс
  }

  /**
   * Получить RowId по логической позиции
   */
  posToId(pos: number): RowId {
    if (pos < 0) throw new Error('Position must be non-negative')
    
    let currentPos = 0
    for (const segment of this.segments) {
      if (segment.deleted) continue
      
      if (currentPos + segment.length > pos) {
        const offset = pos - currentPos
        return segment.rowIds[offset]
      }
      currentPos += segment.length
    }
    
    throw new Error(`Position ${pos} is out of bounds`)
  }

  /**
   * Получить логическую позицию по RowId
   */
  idToPos(id: RowId): number {
    let currentPos = 0
    
    for (const segment of this.segments) {
      if (segment.deleted) continue
      
      const index = segment.rowIds.indexOf(id)
      if (index !== -1) {
        return currentPos + index
      }
      currentPos += segment.length
    }
    
    throw new Error(`RowId ${id} not found`)
  }

  /**
   * Вставить строки в указанную позицию
   */
  insert(pos: number, count: number): RowId[] {
    if (count <= 0) return []
    
    const newIds = this.generateIds(count)
    const newSegment: Segment = {
      startPos: pos,
      length: count,
      rowIds: newIds
    }
    
    this.insertSegment(newSegment)
    return newIds
  }

  /**
   * Удалить строки в диапазоне
   */
  remove(range: [from: number, to: number]): void {
    const [from, to] = range
    if (from > to) return
    
    // Помечаем сегменты как удаленные
    let currentPos = 0
    for (const segment of this.segments) {
      if (segment.deleted) {
        currentPos += segment.length
        continue
      }
      
      const segmentEnd = currentPos + segment.length - 1
      
      if (currentPos <= to && segmentEnd >= from) {
        // Сегмент пересекается с удаляемым диапазоном
        if (currentPos >= from && segmentEnd <= to) {
          // Полностью удаляем сегмент
          segment.deleted = true
        } else {
          // Частично удаляем - разбиваем сегмент
          this.splitSegment(segment, from, to, currentPos)
        }
      }
      
      currentPos += segment.length
    }
  }

  /**
   * Получить общее количество строк
   */
  getTotalRows(): number {
    return this.segments
      .filter(s => !s.deleted)
      .reduce((sum, s) => sum + s.length, 0)
  }

  /**
   * Получить все активные RowId
   */
  getAllRowIds(): RowId[] {
    const result: RowId[] = []
    for (const segment of this.segments) {
      if (!segment.deleted) {
        result.push(...segment.rowIds)
      }
    }
    return result
  }

  private generateIds(count: number): RowId[] {
    const ids: RowId[] = []
    for (let i = 0; i < count; i++) {
      ids.push(`row_${this.nextId++}`)
    }
    return ids
  }

  private insertSegment(newSegment: Segment): void {
    // Находим место для вставки
    let insertIndex = 0
    let currentPos = 0
    
    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i]
      if (segment.deleted) continue
      
      if (currentPos + segment.length > newSegment.startPos) {
        insertIndex = i
        break
      }
      currentPos += segment.length
      insertIndex = i + 1
    }
    
    // Вставляем новый сегмент
    this.segments.splice(insertIndex, 0, newSegment)
    
    // Обновляем позиции последующих сегментов
    this.updatePositionsAfter(insertIndex)
  }

  private splitSegment(segment: Segment, from: number, to: number, currentPos: number): void {
    const segmentStart = currentPos
    const segmentEnd = currentPos + segment.length - 1
    
    // Создаем новые сегменты
    const beforeSegment: Segment = {
      startPos: segmentStart,
      length: from - segmentStart,
      rowIds: segment.rowIds.slice(0, from - segmentStart)
    }
    
    const afterSegment: Segment = {
      startPos: to + 1,
      length: segmentEnd - to,
      rowIds: segment.rowIds.slice(to - segmentStart + 1)
    }
    
    // Заменяем оригинальный сегмент
    const segmentIndex = this.segments.indexOf(segment)
    this.segments.splice(segmentIndex, 1, beforeSegment, afterSegment)
  }

  private updatePositionsAfter(index: number): void {
    // Обновляем позиции сегментов после вставки
    for (let i = index + 1; i < this.segments.length; i++) {
      const segment = this.segments[i]
      if (!segment.deleted) {
        segment.startPos += this.segments[index].length
      }
    }
  }
}
