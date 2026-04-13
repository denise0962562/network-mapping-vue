import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {path: '/', component: () => import('../views/dashboard.vue'), meta: { title: 'Dashboard' }},
    {path: '/create_scan', component: () => import('../views/createscan.vue'), meta: { title: '创建扫描' }},
    {path: '/task/:taskid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', component: () => import('../views/routertest.vue'), meta: { title: '任务详情' }},
    {path: '/task', component: () => import('../views/task.vue'), meta: { title: '任务' }},
    {path: '/analysis', component: () => import('../views/analysis.vue'), meta: { title: '数据分析' }},
    {path: '/setting', component: () => import('../views/setting.vue'), meta: { title: '设置' }},
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound-404.vue'), meta: { title: '404' }}
  ],
})

export default router
