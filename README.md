# Network Mapping Vue

Network Mapping 的 Vue 3/Vite 单页前端，提供扫描任务、扫描器、审计日志和结果分析界面。

## 高级搜索界面

独立入口 `/search.html` 使用 `POST /api/search/v2`，支持 IP/CIDR、端口、服务、Banner、
地理信息和资产标签的组合查询。搜索框直接提交完整表达式，语法校验由服务端完成；HTTP
`422` 响应中的 UTF-16 `span` 会用于选中错误位置。页面还会加载标签目录，点击标签即可
追加精确标签条件。

```text
country = CN AND port = 443 AND tag = "生产环境"
has_endpoint(port = 80) AND has_endpoint(port = 443)
```

完整语法、字段表、标签和跨端点语义参见服务端仓库的
[资产搜索语法与 API](https://github.com/wshijiang/network-mapping/blob/dev/docs/SEARCH_SYNTAX.md)。

## 双栈扫描界面

- 扫描器列表用 IPv4/IPv6 badge 显示当前协议是否就绪。
- 扫描器详情显示探测到的公网地址、失败原因及最后检测时间。
- 创建任务使用单一目标输入框，完整校验并自动识别 IPv4/CIDR、IPv6/CIDR 或域名。
- 多目标支持逗号或换行分隔，但一次只能使用一种分隔符；混合目标类型时阻止提交。
- 域名目标必须至少包含一个点，仅允许 ASCII 字母、数字和非首尾连字符；单标签不超过 63
  octets，点分形式（不含末尾根点）不超过 253 octets。
- 指定扫描器模式下，不兼容当前地址族的扫描器会被禁用。
- 任务列表和任务详情展示服务端返回的 `address_family`。

协议能力来自 `GET /api/scanner/list` 和 `GET /api/scanner/{id}`。前端只用于提前提示，
服务端仍会重新解析目标并执行最终兼容性校验。

## Nuclei 漏洞扫描界面

- 创建页对 IP/CIDR 和域名统一提供“全部”“仅端口”“服务识别”“仅 DNS”四种模式；
- 前端根据统一目标输入自动选择 IP 或域名创建接口，并在输入区实时显示识别类型和错误原因；
- “全部”提交 `scan_profile=vulnerability_scan`；域名目标先解析，再由服务端对授权地址生成扫描任务；
- “仅 DNS”提交 `scan_profile=dns_records`，只在域名目标下可选且不显示端口输入；
- 目标切换为 IP/CIDR 时会移除“仅 DNS”选择，提交函数仍会执行同样校验；
- 指定扫描器时，只允许选择声明该 profile 且目标地址族就绪的节点；
- 管理员可在设置页将漏洞扫描设为新任务和自动任务的默认模式；
- 任务详情显示漏洞总数，并最多展示最近 500 条漏洞的严重级别、模板、匹配位置、说明、
  修复建议、标签、提取结果和 HTTP(S) 引用；
- 漏洞详情来自服务端结构化结果，不渲染 Nuclei 原始请求或响应。

前端选择项不会远程启用 Nuclei，也不能指定模板或 CLI 参数。扫描节点必须提前安装并启用
Nuclei，且使用经过审核的本地签名模板目录。协议、上线顺序和存储语义参见服务端仓库的
[扫描计划与结果协议](https://github.com/wshijiang/network-mapping/blob/dev/docs/SCAN_PIPELINE.md)。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm run dev
```

### Compile and Minify for Production

```sh
pnpm run build
```

生产构建输出到 `dist/`，由 Network Mapping 服务端按已声明的 SPA 路由提供。未知路径和
缺失资源不会回退到 SPA 页面。

维护说明参见 [维护与扩展指南](docs/maintenance-guide.md)。
