import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {path: '/', component: () => import('../views/dashboard.vue')},
    {path: '/create_scan', component: () => import('../views/createscan.vue')},
    {path: '/task/:taskid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', component: () => import('../views/routertest.vue')},
    {path: '/task', component: () => import('../views/task.vue')},
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound-404.vue')}
  ],
})

export default router
