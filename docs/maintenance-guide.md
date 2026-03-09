# network-mapping-vue 维护与扩展指南

本文档用于帮助你后续维护代码、替换真实数据、继续新增功能。内容以当前代码结构为准。

## 1. 项目入口与路由

### 1.1 关键入口文件
- `src/main.js`
  - 注册 Vue 应用
  - 注册 `vue3-apexcharts` 组件：`app.component('apexchart', ApexCharts)`
- `src/App.vue`
  - 页面整体布局（顶部导航 + 侧边栏 + `<router-view />`）
- `src/router/index.js`
  - 页面路由配置

### 1.2 当前路由
- `/` -> `src/views/dashboard.vue`
- `/create_scan` -> `src/views/createscan.vue`
- `/task` -> `src/views/task.vue`
- `/analysis` -> `src/views/analysis.vue`
- `/setting` -> `src/views/setting.vue`

---

## 2. 通用约定

### 2.1 Loading 动画
- 组件：`src/views/loading.vue`
- 任务页、分析页已经接入区块级 loading（局部显示，不是全屏遮罩）

### 2.2 样式
- 全局样式：`src/style.css`
- UI 框架：Tailwind + DaisyUI
- 通用状态样式（任务状态）：
  - `scan_open`
  - `scan_success`
  - `scan_wait`
  - `scan_faild`

---

## 3. 任务页（task.vue）维护说明

文件：`src/views/task.vue`

### 3.1 主要状态参数
- `draftFilters`：界面输入中的筛选条件（未提交）
- `appliedFilters`：真正用于筛选的条件（点击“搜索”后更新）
- `taskItems`：任务原始数据（当前为本地 mock）
- `filteredTaskItems`：按 `appliedFilters` 过滤后的结果
- `pagedTaskItems`：分页后的结果
- `currentPage`：当前页码
- `isLoadingData`：任务表格区块 loading 状态
- `expandedRow`：当前展开备注的任务行 ID

### 3.2 筛选参数含义（`getDefaultFilters()`）
- `taskId`：任务 ID 关键字
- `target`：目标关键字
- `status`：任务状态（0/1/2/3）
- `operator`：操作者关键字
- `startTime`：开始时间下限（datetime-local）
- `endTime`：结束时间上限（datetime-local）
- `scannerId`：扫描器 ID
- `pageSize`：每页条目数

### 3.3 状态映射（`stateConfig`）
- `0` -> 扫描中（`scan_open`）
- `1` -> 成功（`scan_success`）
- `2` -> 等待（`scan_wait`）
- `3` -> 错误（`scan_faild`）

### 3.4 数据更新操作（当前逻辑）
- 首次进入页面：
  - `onMounted()` 中触发 `withLoading(...)`
  - 显示局部 loading 后渲染数据
- 点击“搜索”：
  - `applySearch()` -> `appliedFilters = draftFilters`
  - 回到第 1 页，关闭展开行
- 点击“重置条件”：
  - `resetFilters()` -> 恢复默认筛选
- 点击分页：
  - `changePage(page)` -> 切换页码

### 3.5 接后端 API 的建议改法
将 `withLoading` 内部的 `setTimeout` 替换为真实请求：

```js
async function applySearch() {
  isLoadingData.value = true
  try {
    appliedFilters.value = { ...draftFilters.value }
    const params = { ...appliedFilters.value, page: 1 }
    const res = await fetchTaskList(params)
    taskItems.value = res.items
    currentPage.value = 1
    expandedRow.value = null
  } finally {
    isLoadingData.value = false
  }
}
```

---

## 4. 分析页（analysis.vue）维护说明

文件：`src/views/analysis.vue`

### 4.1 Pie 图（常见服务 Top X）

#### 主要参数
- `topN`：Top 数量，可选 `5/7/10`
- `serviceDimension`：统计维度
  - `protocol`：网络层协议（HTTP/HTTPS 等）
  - `app`：应用层服务（nginx/django 等）
- `ignoreVersionDiff`：是否忽略版本差异（仅在 `app` 维度生效）

#### 数据源
- `protocolStats`：协议数据
- `appServiceStats`：应用服务 + 版本数据
- `pieSourceData`：根据维度/版本开关聚合后的结果
- `pieTopData`：排序后截取 Top N
- `pieSeries / pieLabels / pieOptions`：ApexCharts 渲染数据

#### Loading
- `isPieLoading`：饼图区块 loading
- 页面初次进入会触发
- 修改 `topN/serviceDimension/ignoreVersionDiff` 会重新触发

### 4.2 Heatmap 图（最近 12 周）

#### 主要参数
- `recentWeeks = 12`
- `weekdayRows`：周一到周日
- `weekStarts`：最近 12 周每周起始日（周一）
- `weekLabels`：X 轴显示标签（如 `03/04`）

#### 数据组织
- `heatmapSeries` 为 7 条序列（每条是一个周几）
- 每个格子对应“某周某天”的 1 天数据
- `y: null` 表示无数据（格子留空）

#### 颜色映射（分位数）
- `allHeatValues`：提取全部非空数值并排序
- `quantile()`：计算分位数
- 在 `heatmapOptions.plotOptions.heatmap.colorScale.ranges` 中使用：
  - `0% - 40%`：`rgb(0, 143, 251)`
  - `40% - 80%`：`rgb(0, 227, 150)`
  - `80% - 100%`：`rgb(255, 69, 96)`

#### Loading
- `isHeatmapLoading`：热力图区块 loading
- 页面初次进入时触发

### 4.3 替换为真实分析数据
- 用后端返回结果替换以下函数或计算结果：
  - `protocolStats`
  - `appServiceStats`
  - `simulateDailyScanCount()`
- 若后端返回已经聚合好的热力图矩阵，可直接构造 `heatmapSeries`：
  - 每个 `series` 表示一个周几
  - `data` 项格式为 `{ x: '周标签', y: 数值或null, dateLabel: 'YYYY-MM-DD' }`

---

## 5. 设置页（setting.vue）维护说明

文件：`src/views/setting.vue`

### 5.1 主要状态参数
- `listenConfig`
  - `host`：监听主机
  - `port`：监听端口
- `mailConfig`
  - `recipient`：收件人
  - `smtpHost`：SMTP 服务器
  - `smtpPort`：SMTP 端口
  - `sender`：发件人地址
  - `senderKey`：发件邮箱密钥
- `showSenderKey`：是否显示明文密钥

### 5.2 保存按钮显示逻辑
- `savedListenConfig` / `savedMailConfig` 记录“已保存快照”
- `showListenSave` / `showMailSave` 比较当前值与快照
- 有改动时才显示对应区块右上角“保存”按钮

### 5.3 接后端 API 的建议
- 在 `saveListenConfig()` / `saveMailConfig()` 中先调用 API，成功后再更新 `saved*`
- 建议增加失败提示（toast）

---

## 6. 新增功能时的推荐流程

1. 明确功能属于哪个页面（task/analysis/setting）
2. 先定义状态参数（`ref/computed`）
3. 再补交互函数（搜索、保存、分页、切换等）
4. 最后接入 loading（局部区块，不阻塞整个页面）
5. 如涉及图表：
   - 先确定数据结构，再配置 `options`
   - 避免在模板里直接做复杂计算，放到 `computed`

---

## 7. 常见维护检查清单

- 路由是否已注册（`src/router/index.js`）
- 新增字段是否有默认值（避免 `undefined`）
- loading 是否能在异常时关闭（`try/finally`）
- 分页边界是否正确（页码不能越界）
- 筛选重置后是否回到第一页
- 图表数据为空时是否能安全渲染

---

## 8. 建议的下一步优化

- 抽离 API 层（`src/api/*.js`），页面只负责状态与渲染
- 抽离通用 loading 包装函数（避免重复）
- 给 `task`、`analysis` 增加错误态（加载失败提示）
- 将文本统一为 UTF-8 中文，修复当前部分文件存在的乱码文本

