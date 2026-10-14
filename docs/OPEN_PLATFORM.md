# 开放平台 Web

访问 `/open-platform`，现有用户侧栏也有「开放平台」入口。页面依赖服务端 `/api/open-platform` 会话管理 API，外部业务使用独立 `/open-api/v1` 凭据。

支持个人应用与管理员配置的合作方应用，提供总览、申请与审批、字段/范围/配额编辑、凭据一次显示/轮换/撤销、调用与审计、用量、导出/报告、Webhook 和投递、接口目录与实际应用调试、接入文档、平台开关与开放平台角色管理。

开发者只管理自己的应用，运营可协助管理，审计只读；管理员才可审批、扩权及修改平台设置。敏感操作自动弹出密码/已有 2FA 验证，成功后重试原操作。所有管理写入使用现有 http 客户端的 CSRF 配置。

调试使用应用内选定的有效凭据，权限和数据限制与外部调用一致，无需把密钥粘贴进浏览器。真实业务变更有确认；错误展示公开原因及 request_id。凭据和回调签名密钥只保存在当前弹窗内存，关闭/卸载时清除。

应用编辑 revision 与授权 policy_revision 分离；名称/用途修改不会使文件失效。范围化策略发布会提示旧文件/游标需重建。沙箱读取批准实际数据，拒绝真实扫描。

组件：`src/views/OpenPlatform.vue`、`src/components/OpenApiPolicyEditor.vue`；辅助函数与测试：`src/utils/openApi.js`、`openApi.test.js`。

```bash
pnpm test:open-api
pnpm build
```

完整接口、部署和管理文档由服务端版本内嵌：`network-mapping/docs/OPEN_API.md`、`OPEN_API_MANAGEMENT.md`、`OPEN_API_IMPLEMENTATION.md`，Web 文档页可直接阅读并下载 OpenAPI。反向代理与服务端 SPA 托管须支持 `/open-platform/*` 和 `/developer/open-api`。列表遵循后端分页/上限，日志及审计可继续加载，其他历史列表的上限见接入文档。
