import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('../views/dashboard.vue'), meta: { title: 'Dashboard' } },
    { path: '/create_scan', component: () => import('../views/createscan.vue'), meta: { title: '创建扫描' } },
    { path: '/task/:taskid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', component: () => import('../views/taskdetail.vue'), meta: { title: '任务详情' } },
    { path: '/task', component: () => import('../views/task.vue'), meta: { title: '任务' } },
    { path: '/scanner/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', component: () => import('../views/ScannerDetail.vue'), meta: { title: '扫描器详情' } },
    { path: '/scanner', component: () => import('../views/Scanner.vue'), meta: { title: '扫描器' } },
    { path: '/analysis', component: () => import('../views/analysis.vue'), meta: { title: '数据分析' } },
    { path: '/audit', component: () => import('../views/AuditLog.vue'), meta: { title: '审计日志' } },
    { path: '/admin/users', component: () => import('../views/UserManagement.vue'), meta: { title: '用户管理' } },
    { path: '/open-source', component: () => import('../views/open-source.vue'), meta: { title: '开源项目' } },
    { path: '/testpage', component: () => import('../views/TestPage.vue'), meta: { title: 'Alert 测试' } },
    { path: '/setting', component: () => import('../views/setting.vue'), meta: { title: '设置' } },
    { path: '/setting/mail-templates', component: () => import('../views/MailTemplateEditor.vue'), meta: { title: '邮件模板' } },
    { path: '/user/info', component: () => import('../views/PersonalInfo.vue'), meta: { title: '个人信息' } },
    { path: '/user/security', component: () => import('../views/UserSecurity.vue'), meta: { title: '用户安全' } },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound-404.vue'), meta: { title: '404' } }
  ]
})

export default router
