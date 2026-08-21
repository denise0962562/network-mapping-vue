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
- 创建任务时根据目标中的 `:` 自动识别 IPv6，否则识别为 IPv4。
- 同一任务混合 IPv4/IPv6 时阻止提交，用户需要拆成两个任务。
- 指定扫描器模式下，不兼容当前地址族的扫描器会被禁用。
- 任务列表和任务详情展示服务端返回的 `address_family`。

协议能力来自 `GET /api/scanner/list` 和 `GET /api/scanner/{id}`。前端只用于提前提示，
服务端仍会重新解析目标并执行最终兼容性校验。

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
