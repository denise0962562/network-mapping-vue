# LLM 基础与供应商界面

一级导航 **LLM** 包含基础（`/llm/basic`）和供应商（`/llm/providers`）；`/llm` 重定向基础页。入口仅向管理员显示，服务端独立检查权限。

基础页配置唯一的 IOC 供应商／模型组合，并提供在线多轮对话、停止生成和清空会话。临时调试不改变提取配置；切换模型清空对话，页面离开取消上游请求。内容以 Vue 文本插值呈现，未完成的回答不加入后续消息历史。用量仅展示供应商实际返回值。

供应商页支持 DeepSeek、OpenCode Go、CommandCode GOAT 预设、自定义供应商、模型刷新与手工维护、默认模型和高级请求参数。全局及局部均支持代理、请求头、session、流式配置；局部明确区分继承与关闭。模型刷新使用已保存配置，更新草稿后需保存；未支持的原生协议模型不进入选择列表。

代理地址输入明文显示，便于核对与编辑；已保存的代理仍使用服务端配置标记，留空保留。请求头模式 select 与同级代理、流式及 Session select 统一为默认尺寸。API Key、请求头值和固定 session 值均不回显。“已保存，留空保留”沿用服务端标记，删除头行清除该项。删除活动供应商可同时暂停提取；并发 revision 冲突保留当前编辑草稿并提示刷新。

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

## 历史对话与未发送草稿

IOC 提取卡片新增两个默认关闭的开关：保留提取对话、保留调试对话，均包含供应商实际返回的思考。保存后影响后续请求，关闭不删除原历史。

“加载历史对话”使用既有 daisyUI modal、table、radio、badge 与按钮，区分“IOC 提取”和“调试”，支持分页选择及删除。IOC 快照供管理员查看，调试快照仅原管理员可见。加载不自动发送、不更改 IOC 绑定，继续发送另存快照。历史系统提示词可展开查看；“重放最后一轮”恢复原始输入，需再次点击发送才调用供应商。删除的是选中的请求快照，不影响文章或 IOC。

服务端复用原实际 session 头及输出格式，界面恢复当时的系统提示词和参数；继续对话不发送思考或未完成的回答。接口或协议变化时提示新建会话。缓存是否命中仍取决于供应商，不能保证永不过期。

输入框草稿按用户缓存在当前浏览器 7 天，从最后一次编辑计时，刷新不会续期。发送、删空或明确清空会话立即移除草稿；切换模型和加载历史保留未发送文字。localStorage 失败时显示提示，当前输入仍留在内存。服务端历史与此草稿缓存独立，历史须手动删除。

验证补充：`node --test src/utils/llmDraft.test.js src/views/LlmBasic.test.js src/components/LlmHistoryDialog.test.js`，覆盖过期、账号隔离、发送清理、加载／重放、提示词快照、参数恢复和历史删除分页。
