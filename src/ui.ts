// UI для табличного редактора

import { Table } from './sheet';
import { colToLetter, formatFormula } from './parser';
import { addressKey, parseAddressKey } from './types';

const  visibleRows = 15;
const visibleCols = 10;

export class TableUI {
  private table: Table;
  private container: HTMLElement;
  private selectedCell: { r: number; c: number } | null = null;

  constructor(container: HTMLElement) {
    this.table = new Table(visibleRows, visibleCols);
    this.container = container;
    this.render();
  }

  // Сериализация внутреннего состояния для отладки
  private getDebugState(): any {
    const state: any = {
      cells: {},
      dependencies: {},
      rangeWatchers: {},
      stats: {
        totalCells: this.table.sheet.cells.size(),
        rowSegments: this.table.sheet.rows.segmentCount(),
        colSegments: this.table.sheet.cols.segmentCount(),
        totalRowIds: this.table.sheet.rows.totalIds(),
        totalColIds: this.table.sheet.cols.totalIds(),
        maxRow: this.table.sheet.rows.maxPos(),
        maxCol: this.table.sheet.cols.maxPos(),
      },
      axisIndexes: {
        rows: this.table.sheet.rows.getSegmentsInfo(),
        cols: this.table.sheet.cols.getSegmentsInfo(),
      },
      table: this.table
    };

    // Собираем ячейки
    for (const [key, cell] of this.table.sheet.cells.entries()) {
      const addr = parseAddressKey(key);
      const pos = this.table.sheet.addrToPos(addr);
      if (!pos) continue;

      const cellRef = `${colToLetter(pos.c)}${pos.r}`;
      
      if (cell.kind === 'value') {
        state.cells[cellRef] = {
          type: 'value',
          value: cell.value,
          rowId: addr.row,
          colId: addr.col,
        };
      } else {
        const formulaText = formatFormula(cell.ast, this.table.sheet.rows, this.table.sheet.cols);
        state.cells[cellRef] = {
          type: 'formula',
          formula: formulaText,
          ast: cell.ast,
          cached: cell.cached,
          rowId: addr.row,
          colId: addr.col,
        };
      }
    }

    // Собираем зависимости
    for (const [key, cell] of this.table.sheet.cells.entries()) {
      const addr = parseAddressKey(key);
      const pos = this.table.sheet.addrToPos(addr);
      if (!pos) continue;

      const cellRef = `${colToLetter(pos.c)}${pos.r}`;
      const deps = this.table.sheet.deps.getDependencies(addr);
      const dependents = this.table.sheet.deps.getDependents(addr);

      if (deps.size > 0 || dependents.size > 0) {
        state.dependencies[cellRef] = {
          dependsOn: Array.from(deps).map(k => {
            const a = parseAddressKey(k);
            const p = this.table.sheet.addrToPos(a);
            return p ? `${colToLetter(p.c)}${p.r}` : k;
          }),
          dependents: Array.from(dependents).map(k => {
            const a = parseAddressKey(k);
            const p = this.table.sheet.addrToPos(a);
            return p ? `${colToLetter(p.c)}${p.r}` : k;
          }),
        };
      }
    }

    return state;
  }

  render(): void {
    this.container.innerHTML = '';

    // Контейнер для управления
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <div class="control-group">
        <h3>Управление строками</h3>
        <button id="insertRowBefore">Вставить строку перед</button>
        <button id="insertRowAfter">Вставить строку после</button>
        <button id="deleteRow">Удалить строку</button>
      </div>
      <div class="control-group">
        <h3>Управление столбцами</h3>
        <button id="insertColBefore">Вставить столбец перед</button>
        <button id="insertColAfter">Вставить столбец после</button>
        <button id="deleteCol">Удалить столбец</button>
      </div>
      <div class="control-group">
        <h3>Текущая ячейка</h3>
        <div id="cellInfo">Не выбрана</div>
        <input type="text" id="cellInput" placeholder="Введите значение или формулу" />
        <button id="setCellValue">Установить</button>
      </div>
      <div class="control-group">
        <h3>Примеры</h3>
        <button id="example1">Пример 1: Простые значения</button>
        <button id="example2">Пример 2: Формулы</button>
        <button id="example3">Пример 3: SUM</button>
      </div>
    `;
    this.container.appendChild(controls);

    // Контейнер для таблицы
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    const tableEl = document.createElement('table');
    tableEl.className = 'spreadsheet';

    // Заголовок с буквами столбцов
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th')); // угол
    
    for (let c = 1; c <= this.table.sheet.cols.maxPos(); c++) {
      const th = document.createElement('th');
      th.textContent = colToLetter(c);
      th.dataset.col = String(c);
      th.className = 'col-header';
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    tableEl.appendChild(thead);

    // Тело таблицы
    const tbody = document.createElement('tbody');
    
    for (let r = 1; r <= this.table.sheet.rows.maxPos(); r++) {
      const tr = document.createElement('tr');
      
      // Заголовок строки
      const th = document.createElement('th');
      th.textContent = String(r);
      th.dataset.row = String(r);
      th.className = 'row-header';
      tr.appendChild(th);

      // Ячейки
      for (let c = 1; c <= this.table.sheet.cols.maxPos(); c++) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.row = String(r);
        input.dataset.col = String(c);
        input.className = 'cell-input';
        
        const value = this.table.getValue({ r, c });
        if (value !== undefined) {
          input.value = typeof value === 'number' ? String(value) : value;
        }

        input.addEventListener('focus', () => {
          this.selectedCell = { r, c };
          this.updateCellInfo();
          this.highlightSelection();
          
          // При фокусе показываем исходник формулы
          const source = this.table.getSource({ r, c });
          input.value = source;
        });

        input.addEventListener('blur', () => {
          // При потере фокуса показываем значение
          const value = this.table.getValue({ r, c });
          if (value !== undefined) {
            input.value = typeof value === 'number' ? String(value) : value;
          }
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.setCellFromInput(input);
            input.blur();
          }
        });

        td.appendChild(input);
        tr.appendChild(td);
      }
      
      tbody.appendChild(tr);
    }
    
    tableEl.appendChild(tbody);
    tableContainer.appendChild(tableEl);
    this.container.appendChild(tableContainer);

    // Панель отладки внутреннего состояния
    const debugPanel = document.createElement('div');
    debugPanel.className = 'debug-panel';
    debugPanel.innerHTML = '<h2>🔍 Внутреннее состояние (разреженное хранение)</h2>';
    
    const debugState = this.getDebugState();
    
    // Статистика
    const statsDiv = document.createElement('div');
    statsDiv.className = 'debug-section';
    statsDiv.innerHTML = `
      <h3>📊 Статистика</h3>
      <div class="debug-stats">
        <div class="stat-item">
          <span class="stat-label">Заполнено ячеек:</span>
          <span class="stat-value">${debugState.stats.totalCells}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Доступно позиций:</span>
          <span class="stat-value">${debugState.stats.maxRow} × ${debugState.stats.maxCol} = ${debugState.stats.maxRow * debugState.stats.maxCol}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Коэффициент заполнения:</span>
          <span class="stat-value">${((debugState.stats.totalCells / (debugState.stats.maxRow * debugState.stats.maxCol)) * 100).toFixed(3)}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Строки (ID / сегментов):</span>
          <span class="stat-value">${debugState.stats.totalRowIds} / ${debugState.stats.rowSegments}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Столбцы (ID / сегментов):</span>
          <span class="stat-value">${debugState.stats.totalColIds} / ${debugState.stats.colSegments}</span>
        </div>
      </div>
    `;
    debugPanel.appendChild(statsDiv);

    // Ячейки
    const cellsDiv = document.createElement('div');
    cellsDiv.className = 'debug-section';
    cellsDiv.innerHTML = '<h3>📦 Хранилище ячеек (CellStore)</h3>';
    const cellsContent = document.createElement('pre');
    cellsContent.className = 'debug-json';
    cellsContent.textContent = JSON.stringify(debugState.cells, null, 2);
    cellsDiv.appendChild(cellsContent);
    debugPanel.appendChild(cellsDiv);

    // Зависимости
    const depsDiv = document.createElement('div');
    depsDiv.className = 'debug-section';
    depsDiv.innerHTML = '<h3>🔗 Граф зависимостей (DepGraph)</h3>';
    const depsContent = document.createElement('pre');
    depsContent.className = 'debug-json';
    depsContent.textContent = Object.keys(debugState.dependencies).length > 0 
      ? JSON.stringify(debugState.dependencies, null, 2)
      : '{}  // Нет зависимостей';
    depsDiv.appendChild(depsContent);
    debugPanel.appendChild(depsDiv);

    // AxisIndex (сегменты)
    const axisDiv = document.createElement('div');
    axisDiv.className = 'debug-section';
    axisDiv.innerHTML = '<h3>🗂️ Индексы позиций (AxisIndex)</h3>';
    const axisContent = document.createElement('pre');
    axisContent.className = 'debug-json';
    axisContent.textContent = JSON.stringify(debugState.axisIndexes, null, 2);
    axisDiv.appendChild(axisContent);
    debugPanel.appendChild(axisDiv);

    // Таблица (для самых любопытных)
    const tableDiv = document.createElement('div');
    tableDiv.className = 'debug-section';
    tableDiv.innerHTML = '<h3>🔬 Raw Table (полный дамп объекта)</h3>';
    const rawJSONContent = document.createElement('pre');
    rawJSONContent.className = 'debug-json';
    try {
      // Убираем циклические ссылки
      const seen = new WeakSet();
      const tableClone = JSON.parse(JSON.stringify(debugState.table, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      }));
      rawJSONContent.textContent = JSON.stringify(tableClone, null, 2);
    } catch (e) {
      rawJSONContent.textContent = '// Не удалось сериализовать: ' + (e as Error).message;
    }
    tableDiv.appendChild(rawJSONContent);
    debugPanel.appendChild(tableDiv);

    this.container.appendChild(debugPanel);

    // Обработчики событий
    this.attachEventHandlers();
  }

  private attachEventHandlers(): void {
    document.getElementById('insertRowBefore')?.addEventListener('click', () => {
      if (this.selectedCell) {
        this.table.insertRows(this.selectedCell.r, 1);
        this.render();
      }
    });

    document.getElementById('insertRowAfter')?.addEventListener('click', () => {
      if (this.selectedCell) {
        this.table.insertRows(this.selectedCell.r + 1, 1);
        this.render();
      }
    });

    document.getElementById('deleteRow')?.addEventListener('click', () => {
      if (this.selectedCell) {
        this.table.deleteRows(this.selectedCell.r, this.selectedCell.r);
        this.render();
      }
    });

    document.getElementById('insertColBefore')?.addEventListener('click', () => {
      if (this.selectedCell) {
        this.table.insertCols(this.selectedCell.c, 1);
        this.render();
      }
    });

    document.getElementById('insertColAfter')?.addEventListener('click', () => {
      if (this.selectedCell) {
        this.table.insertCols(this.selectedCell.c + 1, 1);
        this.render();
      }
    });

    document.getElementById('deleteCol')?.addEventListener('click', () => {
      if (this.selectedCell) {
        this.table.deleteCols(this.selectedCell.c, this.selectedCell.c);
        this.render();
      }
    });

    document.getElementById('setCellValue')?.addEventListener('click', () => {
      const input = document.getElementById('cellInput') as HTMLInputElement;
      if (this.selectedCell && input.value) {
        this.setCellValue(this.selectedCell.r, this.selectedCell.c, input.value);
        input.value = '';
        this.render();
      }
    });

    document.getElementById('example1')?.addEventListener('click', () => {
      this.table.setValue({ r: 1, c: 1 }, 10);
      this.table.setValue({ r: 1, c: 2 }, 20);
      this.table.setValue({ r: 1, c: 3 }, 30);
      this.render();
    });

    document.getElementById('example2')?.addEventListener('click', () => {
      this.table.setValue({ r: 2, c: 1 }, 5);
      this.table.setFormula({ r: 2, c: 2 }, '=A2');
      this.table.setFormula({ r: 2, c: 3 }, '=$A$2');
      this.render();
    });

    document.getElementById('example3')?.addEventListener('click', () => {
      this.table.setValue({ r: 3, c: 1 }, 1);
      this.table.setValue({ r: 3, c: 2 }, 2);
      this.table.setValue({ r: 3, c: 3 }, 3);
      this.table.setValue({ r: 4, c: 1 }, 4);
      this.table.setValue({ r: 4, c: 2 }, 5);
      this.table.setValue({ r: 4, c: 3 }, 6);
      this.table.setFormula({ r: 5, c: 1 }, '=SUM(A3:C4)');
      this.render();
    });
  }

  private updateCellInfo(): void {
    const info = document.getElementById('cellInfo');
    if (!info || !this.selectedCell) return;

    const { r, c } = this.selectedCell;
    const value = this.table.getValue({ r, c });
    const source = this.table.getSource({ r, c });
    
    info.textContent = `${colToLetter(c)}${r}: ${source || '(пусто)'} = ${value ?? '(пусто)'}`;
  }

  private highlightSelection(): void {
    // Убираем старое выделение
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.selected-row').forEach(el => el.classList.remove('selected-row'));
    document.querySelectorAll('.selected-col').forEach(el => el.classList.remove('selected-col'));

    if (!this.selectedCell) return;

    const { r, c } = this.selectedCell;

    // Выделяем ячейку
    const input = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
    input?.classList.add('selected');

    // Выделяем заголовки
    const rowHeader = document.querySelector(`th.row-header[data-row="${r}"]`);
    rowHeader?.classList.add('selected-row');

    const colHeader = document.querySelector(`th.col-header[data-col="${c}"]`);
    colHeader?.classList.add('selected-col');
  }

  private setCellFromInput(input: HTMLInputElement): void {
    const r = parseInt(input.dataset.row || '0');
    const c = parseInt(input.dataset.col || '0');
    const value = input.value.trim();

    this.setCellValue(r, c, value);
    this.render();
  }

  private setCellValue(r: number, c: number, value: string): void {
    if (!value) {
      // Очистка ячейки - можно добавить отдельный метод
      return;
    }

    if (value.startsWith('=')) {
      this.table.setFormula({ r, c }, value);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        this.table.setValue({ r, c }, num);
      }
    }
  }
}

