import { tr } from '../i18n/index.js'
function hostnames(value) {
  return [...new Set(value.split(/[\n,]+/).map((host) => host.trim().toLowerCase()).filter(Boolean))]
}

export function settingsForm(data) {
  const policy = data?.document
  if (!Number.isSafeInteger(data?.revision) || data.revision < 1
    || !['none', 'turnstile'].includes(policy?.provider)
    || typeof policy.site_key !== 'string' || !Array.isArray(policy.allowed_hostnames)
    || !policy.allowed_hostnames.every((host) => typeof host === 'string')
    || !['timeout_ms', 'connect_timeout_ms', 'max_in_flight'].every((key) => Number.isSafeInteger(policy[key]))
    || typeof policy.send_remote_ip !== 'boolean' || typeof data.secret_key_configured !== 'boolean') {
    throw new Error(tr("登录保护配置响应无效。"))
  }
  return {
    revision: data.revision, provider: policy.provider, site_key: policy.site_key,
    hostnames: policy.allowed_hostnames.join('\n'), timeout_ms: policy.timeout_ms,
    connect_timeout_ms: policy.connect_timeout_ms, max_in_flight: policy.max_in_flight,
    send_remote_ip: policy.send_remote_ip, secret_key_configured: data.secret_key_configured,
    secret_key: '', clear_secret: false, change_reason: '',
  }
}

export function validateSettings(form) {
  if (!form || !['none', 'turnstile'].includes(form.provider)) return tr("请选择支持的验证服务。")
  if (!Number.isSafeInteger(form.timeout_ms) || form.timeout_ms < 500 || form.timeout_ms > 10000) return tr("验证超时须为 500–10000 毫秒。")
  if (!Number.isSafeInteger(form.connect_timeout_ms) || form.connect_timeout_ms < 1 || form.connect_timeout_ms > form.timeout_ms) return tr("连接超时须大于零，且不能超过验证超时。")
  if (!Number.isSafeInteger(form.max_in_flight) || form.max_in_flight < 1 || form.max_in_flight > 256) return tr("并发上限须为 1–256 的整数。")
  if (form.site_key.length > 256) return tr("Site Key 不可超过 256 字符。")
  if (form.secret_key.length > 2048 || (form.secret_key && (form.secret_key !== form.secret_key.trim() || /[\u0000-\u001f\u007f]/.test(form.secret_key)))) return tr("Secret 不可包含首尾空白、控制字符或超过 2048 字符。")
  if (form.clear_secret && form.secret_key) return tr("替换和清除 Secret 不能同时执行。")
  const hosts = hostnames(form.hostnames)
  if (hosts.length > 32 || hosts.some((host) => host.length > 253 || !host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) return tr("最多填写 32 个有效域名，不含协议、端口、路径或通配符。")
  if (form.provider === 'turnstile' && (!form.site_key.trim() || !hosts.length
    || (!form.secret_key && (!form.secret_key_configured || form.clear_secret)))) return tr("开启 Turnstile 前须填写 Site Key、Secret 和允许域名。")
  if (form.change_reason.length > 500 || /[\u0000-\u001f\u007f]/.test(form.change_reason)) return tr("变更说明不可超过 500 字符或包含控制字符。")
  return ''
}

export function settingsPayload(form) {
  const problem = validateSettings(form)
  if (problem) throw new Error(problem)
  return {
    expected_revision: form.revision,
    document: {
      provider: form.provider, site_key: form.site_key.trim(), allowed_hostnames: hostnames(form.hostnames),
      timeout_ms: form.timeout_ms, connect_timeout_ms: form.connect_timeout_ms,
      max_in_flight: form.max_in_flight, send_remote_ip: form.send_remote_ip,
    },
    secret_key: form.secret_key, clear_secret: form.clear_secret, change_reason: form.change_reason.trim(),
  }
}
