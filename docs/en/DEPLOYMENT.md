# Web console deployment

[Documentation](README.md) · [Source README](../../README.md)

## Requirements and build

The frontend uses Vue 3, Vite, Tailwind CSS and daisyUI. Node.js must satisfy `^20.19.0 || >=22.12.0`; use pnpm with the frozen lockfile. A configured Network Mapping server is required for authentication and business APIs.

```sh
git clone https://github.com/wshijiang/network-mapping-vue.git
cd network-mapping-vue
pnpm install --frozen-lockfile
pnpm build
```

The build writes `dist/` with the dashboard, sign-in, standalone search and asset entries. Configure the server to serve that entire directory:

```toml
[frontend]
directory = "../network-mapping-vue/dist"
```

The relative path is resolved from the server configuration file. The server checks authentication and declared page routes; unknown routes and missing resources remain real 404 responses. Keep frontend and server API versions compatible. See the [Docker integration guide (Chinese)](https://github.com/wshijiang/network-mapping-vue/blob/main/docs/DOCKER.md) for pinned frontend commits in server images.

## Development

```sh
pnpm dev --host 127.0.0.1
```

The default development proxy targets `https://localhost:9999` for API and logout requests. Change the target for your environment. Development HTTPS is enabled when the configured sibling TLS key/certificate files exist; otherwise it serves HTTP. The dev server alone does not provide authenticated business functionality. `pnpm preview` is only a static build preview, not a substitute for server authentication.

## Verify

Run the utility/component/view tests and the production build, and verify all four entry pages against the deployed server. Check login/2FA, expired sessions, loading/error states, route refreshes and frontend assets.

The language control is available on all four entries. Chinese browser preferences use Simplified Chinese; English and other preferences use English. Manual choices persist in a host-only cookie. Verify immediate switching and draft retention, then refresh to check persistence. See [language rules](LOCALIZATION.md).

Business time zone and scan parameters are independent of UI language. User input, original evidence and existing notification bodies retain their original content. Advanced UI and deployment references currently remain in the [Chinese documentation](https://github.com/wshijiang/network-mapping-vue/blob/main/docs/README.md).
