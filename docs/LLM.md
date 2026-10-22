# LLM 基础与供应商界面

一级导航 **LLM** 包含基础（`/llm/basic`）和供应商（`/llm/providers`）；`/llm` 重定向基础页。入口仅向管理员显示，服务端独立检查权限。

基础页配置唯一的 IOC 供应商／模型组合，并提供在线多轮对话、停止生成和清空会话。临时调试不改变提取配置；切换模型清空对话，页面离开取消上游请求。内容以 Vue 文本插值呈现，未完成的回答不加入后续消息历史。用量仅展示供应商实际返回值。

供应商页支持 DeepSeek、OpenCode Go、CommandCode GOAT 预设、自定义供应商、模型刷新与手工维护、默认模型和高级请求参数。全局及局部均支持代理、请求头、session、流式配置；局部明确区分继承与关闭。模型刷新使用已保存配置，更新草稿后需保存；未支持的原生协议模型不进入选择列表。

API Key、请求头值、代理地址和固定 session 值均不回显。“已保存，留空保留”沿用服务端标记，删除头行清除该项。删除活动供应商可同时暂停提取；并发 revision 冲突保留当前编辑草稿并提示刷新。

供应商勾选“清除数据库 API Key”后，清除操作优先于已输入的替换密钥，保存请求不提交替换值。保存失败保留草稿；取消勾选后可继续保存原先输入的新密钥。清除后可使用环境变量备用来源或有效的自定义 Authorization 请求头；未设置备用环境变量时，有效认证头仍可用于调试、模型刷新及 IOC 提取。数据库密钥解密失败仍会阻断请求。

界面复用项目既有 daisyUI card、table、modal、input、select、toggle、chat、alert 和语义配色；沿用现有折叠导航、AppAlert、未保存修改提示及深浅主题。不新增独立配色或样式框架。

POST SSE 使用 `llmChat.js`，沿用 `http.js` 的会话失效处理和 CSRF Cookie。SSE 解析支持任意 UTF-8 分片与 CRLF，必须收到 done 或 error；EOF 不能标记完成。

原威胁情报页移除 AI 编辑表单，保留状态与入口。来源名称与“配置详情”仍可打开来源详情并复制来源 ID。需与支持 `/api/llm/*` 的服务端配套部署，发布时更新服务端 `.github/frontend-ref`。

验证：

```sh
node --test src/utils/llm.test.js src/views/LlmBasic.test.js src/views/LlmProviders.test.js src/views/ThreatIntelligence.test.js
pnpm build
```

浏览器检查覆盖桌面、390px 手机宽度、深浅主题、编辑弹窗、调试成功、停止与错误状态。界面夹具测试不代表供应商实连；完整配置、迁移和请求限制见[服务端 LLM 文档](https://github.com/wshijiang/network-mapping/blob/main/docs/LLM.md)。
