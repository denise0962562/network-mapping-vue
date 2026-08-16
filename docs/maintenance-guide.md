# network-mapping-vue 维护与扩展指南

> 更新日期：2026-08-16

## 目录

1. [技术栈与依赖](#1-技术栈与依赖)
2. [项目入口与认证](#2-项目入口与认证)
3. [路由表](#3-路由表)
4. [布局与导航](#4-布局与导航)
5. [通用组件](#5-通用组件)
6. [HTTP 层](#6-http-层)
7. [页面说明](#7-页面说明)
8. [骨架屏约定](#8-骨架屏约定)
9. [新增功能推荐流程](#9-新增功能推荐流程)
10. [维护检查清单](#10-维护检查清单)

---

## 1. 技术栈与依赖

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Vue 3 (Composition API) | ^3.5.29 |
| 构建工具 | Vite | ^7.3.1 |
| 路由 | Vue Router | ^5.0.3 |
| 样式 | Tailwind CSS + daisyUI | ^4.2.1 / ^5.5.19 |
| 图表 | ApexCharts (vue3-apexcharts) | ^5.6.0 |
| HTTP | Axios | ^1.15.1 |
| 二维码 | vue-qrcode | ^2.2.2 |
| 图标 | @lucide/vue | ^1.17.0 |
| 地图 | Leaflet | ^1.9.4 |

关键文件：
- `src/main.js` — 应用入口
- `src/App.vue` — 全局布局（导航栏 + 侧边抽屉 + `<router-view />`）
- `src/router/index.js` — 路由配置
- `src/style.css` — 全局样式（含 `.big_card`、`.scan_status` 等自定义类）
- `vite.config.js` — Vite 配置

---

## 2. 项目入口与认证

### 2.1 启动流程 (`src/main.js`)

```
创建 Vue 应用 → 检查 CSRF token → 无则跳转 /login → 有则挂载 app
```

- 仪表盘和分析页通过 `defineAsyncComponent` 懒加载 `vue3-apexcharts`，入口不注册全局图表组件
- 引入 `src/utils/http.js` 以激活 Axios 拦截器

### 2.2 CSRF 保护 (`src/utils/csrf.js`)

- `getCookieValue('csrf_token')` — 读取 CSRF cookie
- `expireCookie('csrf_token')` — 使 cookie 过期（登出时调用）
- 所有 `/api` 请求自动附带 `X-CSRF-Token` 请求头（由 http.js 拦截器处理）

### 2.3 登出流程

`App.vue` 中的 `handleLogout()`:
1. 调用 `GET /logout`
2. 清除 CSRF cookie
3. 跳转到 `/login`

---

## 3. 路由表

| 路径 | 文件 | 标题 | 说明 |
|------|------|------|------|
| `/` | `src/views/dashboard.vue` | Dashboard | 仪表盘首页 |
| `/create_scan` | `src/views/createscan.vue` | 创建扫描 | 创建扫描任务 |
| `/task` | `src/views/task.vue` | 任务 | 任务列表、筛选、分页 |
| `/task/:taskid` | `src/views/taskdetail.vue` | 任务详情 | 单个任务详情（UUID 路由参数） |
| `/scanner` | `src/views/Scanner.vue` | 扫描器 | 扫描器列表 |
| `/scanner/:id` | `src/views/ScannerDetail.vue` | 扫描器详情 | 单个扫描器详情 |
| `/analysis` | `src/views/analysis.vue` | 数据分析 | Pie 图 + Heatmap |
| `/open-source` | `src/views/open-source.vue` | 开源项目 | 依赖声明列表 |
| `/setting` | `src/views/setting.vue` | 设置 | 监听/安全/通知配置 |
| `/user/info` | `src/views/PersonalInfo.vue` | 个人信息 | 用户资料编辑 |
| `/user/security` | `src/views/UserSecurity.vue` | 用户安全 | 2FA 设置 |
| `/testpage` | `src/views/TestPage.vue` | Alert 测试 | 组件测试页 |
| `/:pathMatch(.*)*` | `src/views/NotFound-404.vue` | 404 | 未匹配路由 |

> **注意**：任务与新建扫描器均使用 UUIDv7。任务路由显式限制版本位为 7；扫描器路由为兼容已有数据接受任意标准 UUID 版本格式。

---

## 4. 布局与导航

### 4.1 整体结构 (`src/App.vue`)

```
┌──────────────────────────────────────────┐
│  Navbar (页面标题 + GitHub 链接)           │
├────────────┬─────────────────────────────┤
│  Sidebar   │                             │
│  (抽屉式)   │  <router-view />            │
│            │                             │
│  ┌──────┐  │                             │
│  │系统设置│  │                             │
│  │用户设置│  │                             │
│  └──────┘  │                             │
│  退出登录   │                             │
├────────────┴─────────────────────────────┤
```

- 侧边栏使用 daisyUI `drawer` 组件，支持 lg 以上常开、以下折叠
- 侧边栏底部有 `tabs` 切换："系统设置"与"用户设置"
  - **系统设置标签**：仪表盘、创建扫描、搜索、扫描器、任务、数据分析、开源项目、Alert 测试、设置
  - **用户设置标签**：个人信息、安全设置
- 导航栏标题由 `route.meta.title` 自动生成
- 底部"退出登录"按钮

### 4.2 自定义 CSS 类 (`src/style.css`)

- `.big_card` — 卡片容器：`card bg-base-100 card-border border-base-300 w-full p-2.5`
- `.task_input_items` — 表单输入：`input validator mt-2.5 w-full`
- `.scan_open` / `.scan_success` / `.scan_wait` / `.scan_faild` — 任务状态标签样式

---

## 5. 通用组件

### 5.1 AppAlert (`src/components/AppAlert.vue`)

浮层通知提示，支持四种类型。

**Props：**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | String | `'info'` | `'info'` / `'success'` / `'warning'` / `'error'` |
| `title` | String | (必填) | 标题文字 |
| `description` | String | `''` | 描述文字 |
| `closable` | Boolean | `true` | 是否可手动关闭 |
| `timeout` | Number | `7000` | 自动消失时间（ms），`<=0` 不自动消失 |

**Events：** `@close` — 关闭时触发

**特性：** 鼠标悬停或聚焦时暂停计时；页面使用固定定位（`fixed top-20`）置于右上角。

**使用示例：**
```js
// 在页面 script 中
const alerts = ref([])

function pushAlert(type, title, description = '', timeout = 7000) {
  alerts.value.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    description,
    timeout
  })
}

function closeAlert(id) {
  alerts.value = alerts.value.filter(a => a.id !== id)
}
```

```html
<!-- 在页面 template 顶部固定区域 -->
<div class="pointer-events-none fixed top-20 ...">
  <AppAlert
    v-for="alert in alerts"
    :key="alert.id"
    :type="alert.type"
    :title="alert.title"
    :description="alert.description"
    :timeout="alert.timeout"
    @close="closeAlert(alert.id)"
  />
</div>
```

### 5.2 EmptyState (`src/components/EmptyState.vue`)

空状态/错误状态占位组件。

**Props：**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | String | `'info'` | `'info'` / `'error'` |
| `title` | String | (必填) | 主标题 |
| `message` | String | `''` | 详细描述（支持 `\n` 换行） |

居中显示，最小高度 `min-h-80`，带对应类型图标。

---

## 6. HTTP 层

### 6.1 Axios 实例 (`src/utils/http.js`)

```js
import http from '@/utils/http'
```

- 配置 `withCredentials: true`
- **请求拦截器**：对同源 `/api` 路径和 `/logout` 自动附加 `X-CSRF-Token` 请求头（`/api/login` 除外）
- **响应拦截器**：401 状态码时清除 CSRF cookie 并跳转 `/login`（防重复跳转）

### 6.2 推荐 API 调用模式

```js
async function fetchData() {
  try {
    isLoading.value = true
    const response = await http.get('/api/xxx', { params: { ... } })
    // 处理 response.data
  } catch (error) {
    console.error('fetch failed', error)
    pushAlert('error', '加载失败', '请检查网络连接。')
  } finally {
    isLoading.value = false
  }
}
```

---

## 7. 页面说明

### 7.1 仪表盘 (`dashboard.vue`)

首次进入时显示骨架屏（`isFirstLoad`），后续每 5 秒轮询刷新不显示骨架。

**区域：**
- 服务器资源利用状态（CPU / RAM / Disk 堆叠柱状图）
- 最近 7 天扫描情况（按扫描器堆叠柱状图）
- 历史趋势卡片：可在“服务器资源”和“数据库容量”标签间切换；只挂载当前标签对应的大型折线图
  - 服务器资源：CPU / RAM / Disk，默认最近 30 分钟，支持时间范围、粒度和自定义区间
  - 数据库容量：默认展示最新快照中最大的 6 张用户表，可按测绘、任务、日志、网络情报、系统配置等类别快捷选择，也可逐表切换；支持时间范围和粒度，表名按名称稳定排序
- 系统详细信息（运行状态、Uptime、主机名、操作系统、内核、架构、CPU、内存、磁盘，以及按网口名排序的累计收发量）
- 当前任务列表（最多 10 行，带状态标签）

**数据来源：**
- `GET /api/data/system-data`：当前资源快照及实时 `system_info` 主机信息，每 5 秒轮询
- `GET /api/data/system-resource-history`：历史资源趋势，预设范围每 60 秒刷新
- `GET /api/data/database-size-history`：数据库、连接数及全部用户表容量历史，预设范围每 60 秒刷新

### 7.2 任务页 (`task.vue`)

**功能：**
- 搜索栏：任务ID、目标、状态、操作者（点击"搜索"提交）
- 高级筛选（折叠面板）：开始/结束时间、扫描器、每页条目
- 任务表格：显示 IPv4/IPv6 地址族，点击行展开备注和创建时间
- 任务ID 为链接，可跳转到 `/task/:taskid`
- 底部分页：上一页/下一页

**Loading：** `isLoadingData` 期间筛选控件全部禁用，表格区显示简单骨架屏（整块 + 底部分页信息条）

**数据来源：** `GET /api/task/all?start=&count=` — 基于游标分页

**核心状态：**
| 变量 | 说明 |
|------|------|
| `draftFilters` / `appliedFilters` | 筛选条件（未提交 / 已生效） |
| `taskItems` | 原始任务数据 |
| `filteredTaskItems` | 前端筛选后的数据 |
| `currentPage` / `totalPages` | 分页 |
| `expandedRow` | 当前展开行 ID |

**状态映射：**
| statusKey | 文本 | CSS 类 |
|-----------|------|--------|
| `pending` | 待扫描 | `scan_wait` |
| `running` | 扫描中 | `scan_open` |
| `finished` | 扫描完成 | `scan_success` |

### 7.3 任务详情 (`taskdetail.vue`)

通过 `GET /api/task/:taskid` 展示单个任务及各扫描器执行实例的完整信息。

**区域：**
- 任务 UUID（可复制）+ 操作按钮（重新打开 / 导出 / 删除）
- 摘要统计卡片（存活IP、端口、漏洞数、扫描耗时）
- 任务细节（目标IP、IPv4/IPv6 地址族、端口、扫描类型、时间、发起人、扫描器）
- 结果展示（按 IP 展示端口和漏洞）
- 执行状态 Timeline（竖向时间线）
- ASN & ISP 表格

### 7.4 创建扫描 (`createscan.vue`)

**功能：**
- 表单字段：目标 IP（必填，支持 IPv4/IPv6 和 CIDR）、端口（可选，逗号分隔）、扫描等级（1-5）、备注
- 支持自动分配、指定扫描器和全部扫描器三种调度模式
- 根据目标自动识别地址族；混合 IPv4/IPv6 时要求拆分任务
- 指定扫描器模式会根据 `supports_ipv4/6` 和 `ipv4/6_ready` 禁用不兼容设备
- 提交：`POST /api/task/create`，成功后清空表单
- 提交期间按钮显示 loading 状态（`submitting`）
- 通知使用 `AppAlert`

前端通过目标是否包含 `:` 提供即时地址族提示，这不是安全校验。服务端会使用 IP/CIDR
解析器重新验证每个目标、拒绝混合地址族，并再次检查所选扫描器能力。

### 7.5 扫描器列表 (`Scanner.vue`)

**功能：**
- 表格显示名称、地区、连接 IP、在线状态、IPv4/IPv6 就绪 badge、创建者和当前任务
- 分页：每页 7 条，支持翻页
- 点击卡片可跳转到 `/scanner/:id`
- 右侧表单创建扫描器并一次性展示注册 ID 和 token
- 数据来源：`GET /api/scanner/list`

### 7.6 扫描器详情 (`ScannerDetail.vue`)

单个扫描器的详情页面，展示基本信息、运行环境、管理操作和网络协议探测状态。

网络协议区域使用以下字段：

| 字段 | 用途 |
|---|---|
| `supports_ipv4` / `supports_ipv6` | 扫描端是否启用协议 |
| `ipv4_ready` / `ipv6_ready` | 最近一次公网探测是否成功 |
| `public_ipv4` / `public_ipv6` | 检测到的出口地址 |
| `network_status_reason` | 两种协议的不可用原因 |
| `network_capabilities_updated_at` | 最近一次心跳更新时间 |

公网地址属于部署信息。新增截图、诊断导出或前端日志时，不要无意公开这些字段。

### 7.7 数据分析 (`analysis.vue`)

页面使用真实扫描结果，支持时间范围、扫描器、任务来源、分布维度和 Top N 筛选。

**Pie 图（常见服务或开放端口分布）：**
- 数据来源：`GET /api/analysis/distribution`
- 按唯一执行、IP 和端口去重，Top N 之外合并为“其他”
- 当前扫描协议没有独立产品与版本字段，因此不展示不可靠的版本聚合

**Heatmap（发现 IP 热力图）：**
- 数据来源：`GET /api/analysis/discovery-heatmap`
- Y 轴为周一至周日，X 轴为最近 4、8 或 12 周
- 按自然日统计去重 IP，无发现显示 0，未来日期留空
- 两张图拥有独立的 Loading、首次失败和保留旧数据状态

### 7.8 开源项目 (`open-source.vue`)

静态表格展示项目依赖的名称、版本、License 和用途。进入页面显示 3 秒骨架屏后展示数据。

### 7.9 设置页 (`setting.vue`)

三张卡片，各有独立骨架屏和保存按钮。

**监听配置：** 主机 + 端口，保存按钮在值变更时显示
**系统安全：** 登录错误次数限制（1-4）、锁定时间（分钟）、API/页面速率限制
  - 输入时自动 clamp / normalize
**通知：** 登录通知、任务通知（错误时/完成时）、报告通知（日/周/月报）
  - 邮件配置：收件人、SMTP 服务器、端口、发件人、密钥（可切换明文）
  - "测试邮件服务器"按钮

### 7.10 个人信息 (`PersonalInfo.vue`)

- 数据来源：`GET /api/userinfo/get`
- 保存：`POST /api/userinfo/update`
- 可编辑：用户名、邮箱
- 只读：用户类型、登录限制、创建时间、更新时间、最后登录时间/IP
- 最近操作日志表格（带"显示无数据"切换）
- Loading 期间显示骨架屏，卡片标题保持可见

### 7.11 用户安全 (`UserSecurity.vue`)

- 2FA 总开关（toggle）
- 绑定状态徽章（已绑定 / 未绑定 / 关闭）
- 未绑定时显示二维码（vue-qrcode）+ 可复制 OTP 内容
- 进入页面显示 3 秒骨架屏

---

## 8. 骨架屏约定

项目使用 daisyUI `skeleton` class 替代旧的 `Loading` spinner 组件。

### 8.1 基本原则

1. **卡片标题和副标题始终可见**，仅内容区显示骨架屏
2. 有真实 API 加载逻辑的页面，骨架屏跟随 `isLoading` 状态
3. 暂无后端逻辑的静态页面，`onMounted` 中 `setTimeout(() => isLoading = false, 3000)` 模拟加载

### 8.2 各页面骨架屏一览

| 页面 | 触发条件 | 骨架形式 |
|------|----------|----------|
| dashboard | 首次加载 (`isFirstLoad`) | 图表区 `skeleton h-64`、系统信息 `skeleton h-36`、任务表 `skeleton h-56` |
| task | `isLoadingData` | 表格区 `skeleton h-72` + 底部分页条 `skeleton h-4 w-52` |
| analysis (pie) | `isPieLoading` (450ms) | `skeleton h-80` |
| analysis (heatmap) | `isHeatmapLoading` (650ms) | `skeleton h-96` |
| open-source | 3 秒定时器 | `skeleton h-64` |
| setting | 3 秒定时器 | 三张卡片各独立骨架 |
| PersonalInfo | `loadingUserInfo` (API) | 标题 + 8 个表单字段骨架 |
| UserSecurity | 3 秒定时器 | `skeleton h-40` |

### 8.3 代码示例

```html
<!-- 卡片骨架屏：标题可见，内容区用骨架 -->
<div class="card bg-base-100 card-border border-base-300 p-4">
  <div class="mb-3">
    <h3 class="font-semibold">卡片标题</h3>
    <p class="text-xs opacity-60">副标题说明</p>
  </div>
  <div v-if="isLoading" class="skeleton h-64 w-full rounded-box"></div>
  <div v-else>
    <!-- 真实内容 -->
  </div>
</div>
```

---

## 9. 新增功能推荐流程

1. 在 `src/router/index.js` 注册路由和 `meta.title`
2. 在 `src/views/` 创建页面 `.vue` 文件
3. 如需侧边栏入口，在 `App.vue` 对应标签的 `<ul class="menu">` 中添加 `<router-link>`
4. 在 script setup 中定义状态（`ref` / `computed`），然后编写交互函数
5. 加载状态使用 `ref(true)` + daisyUI `skeleton` class
6. 有 API 调用的页面参考 [HTTP 层](#6-http-层) 的推荐模式
7. 错误/成功提示使用 `AppAlert` 组件的 `pushAlert` 模式
8. 图表页面：先确定数据结构 → `computed` 处理 → 配置 `options`

---

## 10. 维护检查清单

- [ ] 新路由是否已在 `src/router/index.js` 注册
- [ ] 侧边栏是否需要添加入口（注意"系统设置"/"用户设置"标签归属）
- [ ] 新字段是否有默认值（避免 `undefined` 导致渲染异常）
- [ ] 异步操作的 loading 是否在 `finally` 中关闭
- [ ] 异常路径是否给了用户提示（`pushAlert('error', ...)`）
- [ ] 401 响应是否由 http.js 拦截器统一处理
- [ ] 分页操作是否禁用按钮防止重复请求
- [ ] 卡片骨架屏是否保持了标题/副标题可见
- [ ] 图表数据为空数组时是否能安全渲染
- [ ] 是否移除了对 `src/views/loading.vue` 的引用（已废弃，统一使用 daisyUI skeleton）
