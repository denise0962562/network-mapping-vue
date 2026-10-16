# 飞书通知管理

[返回文档中心](README.md)

## 使用

管理员在「设置 → 通知渠道」进入 `/setting/notifications`。
添加飞书群自定义机器人，填写名称、Webhook 和签名密钥，选择健康告警、Scanner 掉线/恢复并启用。
保存后点击「测试发送」，在投递记录中确认结果，并检查群内实际消息。
如机器人配置关键词，应允许固定前缀 **Network Mapping**。

此页面不依赖邮件设置。健康告警受运行策略中的监控规则控制；Scanner 状态受掉线策略和维护宽限控制。
最低级别选择「仅严重」时，不发送 warning 级别的 Scanner 掉线/恢复。
登录、任务通知、报告通知及 Telegram 尚未接入此页面。

## 编辑与投递记录

- 保存的 Webhook 和签名密钥不会回显。编辑时留空保留；删除旧签名须显式勾选清除。
- 保存、停用、删除会取消该渠道尚未完成的旧投递；已发出的请求无法撤回。
- 并发编辑返回 409 时，刷新后重新编辑，避免覆盖他人修改。
- 测试须先保存并启用，同渠道两次测试至少间隔 30 秒。「测试已入队」不代表飞书已接受。
- 投递记录可按渠道和状态筛选，每页 50 条；自动刷新最新一页，也可加载更早记录。
- failed 记录可手动重试；消息可能重复，请结合事件 ID 排查。取消或过期事件不直接恢复。
- Scanner 恢复只通知同一目标已成功接收掉线消息的渠道，修改 Webhook 后不会向新群发送旧 incident 的恢复。
- 非管理员进入页面显示权限提示；服务端也验证管理员权限。

## 开发

页面 `src/views/Notifications.vue` 使用现有 HTTP 客户端，自动携带会话与 CSRF 请求头；
调用后端 `/api/notifications/channels` 和 `/api/notifications/deliveries`。
`src/utils/notifications.js` 负责表单快照、白名单字段请求构造、URL 初步校验及公开错误码展示。
后端仍是校验和权限的权威来源。页面只使用 Vue 文本插值，不渲染服务端 HTML，也不输出凭据到控制台。

```bash
# 在前端仓库执行
node --test src/utils/notifications.test.js
pnpm build
```

需配套部署新增通知接口的后端。
部署、重试、保留周期及全部接口见[后端通知专题文档](https://github.com/wshijiang/network-mapping/blob/main/docs/NOTIFICATIONS.md)。
