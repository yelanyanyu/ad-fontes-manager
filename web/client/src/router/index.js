import { createRouter, createWebHistory } from 'vue-router'

// Lazy load components
const HomeView = () => import('@/views/HomeView.vue')
const EditorView = () => import('@/views/EditorView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/words',
      redirect: '/'
    },
    {
      path: '/editor',
      name: 'editor',
      component: EditorView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    }
  ]
})

export default router
