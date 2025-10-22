import { createRouter, createWebHistory } from 'vue-router'
import SpreadsheetView from '@/views/SpreadsheetView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'spreadsheet',
      component: SpreadsheetView,
    },
  ],
})

export default router
