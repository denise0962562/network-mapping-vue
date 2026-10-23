# 前端更新日志

[文档中心](README.md) · [服务探测分批计划](https://github.com/wshijiang/network-mapping/blob/main/docs/SERVICE_DETECTION_ROADMAP.md)

## 未发布：加密 DNS、工业与 UDP 服务识别（2026-10-23）

- 创建任务新增 DoH/DoT 和工业协议选择，以及 TLS/SNI/路径/公开 CA、Unit ID、TSAP、MQTT 版本字段，统一采用现有 daisyUI 风格。
- 新增独立 UDP 主动/被动模式；被动模式明确接收节点地址、端口和观察窗口，显示来源证据而非“端口开放”。
- 节点筛选校验协议和单端点预算，服务徽标展示转义证据及 MQTT 认证拒绝；资产历史和列表键区分 TCP/UDP 同端口。
- 配套版本与精确支持范围见[服务协议识别与部署](https://github.com/wshijiang/network-mapping/blob/main/docs/SERVICE_PROTOCOLS.md)；需 IPC 3 Worker 及服务端投影迁移。

## 未发布：DNS TCP / VNC 定向探测（2026-10-23）

- IP/CIDR 的服务识别及全部扫描模式增加可选 DNS TCP、VNC 定向探测，复用 daisyUI 表单与现有布局；选中后对开放 TCP 端点仅尝试所选协议，节点选择及分配预览核对实际能力。域名解析任务暂不提供该选项。
- 搜索、任务详情、资产详情和历史复用服务徽标；历史接口提供原始证据时可展开 DNS 响应码或 RFB 协议版本，返回文本保持转义，沿用明暗主题。
- 节点详情展示 DNS/VNC 原生探测能力；未声明能力的旧节点不显示为已支持。需配套服务端任务 API 与新版扫描器。

## 未发布：服务识别扩展规划（2026-10-23）

- 补充 [DNS、DoH、DoT 与 VNC 的前端适配规划](https://github.com/wshijiang/network-mapping/blob/main/docs/DNS_DOH_DOT_VNC_PLAN.md)：复用现有 daisyUI 表单、服务徽标、结果表格、证据详情及明暗主题，明确节点能力校验与 TCP/UDP 同端口展示。
- 本条仅记录规划文档，未新增协议配置入口或修改当前页面行为。
- 追加[工业与物联网前端适配规划](https://github.com/wshijiang/network-mapping/blob/main/docs/INDUSTRIAL_SERVICE_DETECTION_PLAN.md)：工业协议选择、节点能力校验、共享服务/证据展示，沿用现有 daisyUI、明暗主题和历史弹窗；区分主动握手、UDP 发现、被动 PubSub/I/O 与已有 MQTT/MQTTS，不提前开放未实现入口。

## 未发布：服务探测第一批（2026-10-22）

- 搜索、任务详情及资产详情共用的 Web 技术标签支持 database 类别：沿用现有字号与布局，使用 Lucide 通用数据库符号和 daisyUI outline 徽标，兼容明暗主题。
- 展示服务端提供的 Elasticsearch HTTP/HTTPS 产品及版本，继续支持版本冲突、证据不完整、过期和安全转义，CSV 仍沿用原格式。
- 本批没有 UDP 创建任务入口，也不表示已经支持 Elasticsearch 原生 Transport。后续批次先完成协议端点迁移和能力协商，再开放对应入口。
# 控制台更新日志

## 未发布

### 新增

- IOC 提取卡片新增提取／调试对话留存开关（默认关闭）；调试支持 daisyUI 历史 modal、IOC 提取／调试标签、分页加载及删除，恢复原提示词、参数、思考与 session，并可重放最后一轮。
- 调试输入按用户在浏览器保留 7 天，刷新不续期，发送、删空或明确清空后立即移除；存储失败时提示，切换模型和加载历史保留未发送草稿。

- 新增 LLM 一级导航，包含基础和供应商两个子项，沿用现有 daisyUI 样式、深浅主题及折叠导航。
- IOC 提取支持唯一的供应商／模型组合；新增在线多轮调试、实时文本、停止生成、会话重置和请求用量。
- 供应商支持增删改、三种预设、模型发现与手工维护、默认模型、协议、凭据和高级请求参数。
- 全局与局部设置支持代理、自定义请求头、可自定义头名称的 session 和流式开关，明确区分继承与关闭。

### 调整

- 修复供应商先填写替换 API Key 再勾选清除时保存失败：清除操作优先，提交时省略替换密钥；保存失败继续保留编辑草稿。
- 修复迁移 AI 设置时误删来源详情状态导致的弹窗无法打开，恢复来源详情查看与 ID 复制反馈。
- 威胁情报页面的 AI 配置迁入 LLM，保留实际状态和跳转入口，原有审核流程继续保留。
- 复用既有 CSRF 与登录失效处理；配置冲突保留草稿，秘密字段保存后不回显或重复提交。

需配套部署服务端 LLM API。见 [LLM 使用与验证](LLM.md)。
