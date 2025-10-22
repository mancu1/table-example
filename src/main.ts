// Точка входа приложения

import { TableUI } from './ui';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (app) {
    new TableUI(app);
  }
});

