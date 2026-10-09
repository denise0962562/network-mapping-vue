// Imported only by the development preview; all values are synthetic.
export function configCheckPreview(scenario) {
  const items = [
    { field: 'server.max_body_size', kind: 'default', source: 'startup', default_value: '67108864', description: '采用内置默认值（64 MiB）；如需调整，请修改启动配置并重启。' },
    { field: 'database.pool_wait_timeout_ms', kind: 'default', source: 'startup', default_value: '2000', description: '连接池等待超时采用内置默认值 2000 毫秒。' },
    { field: 'requests.retention_days', kind: 'default', source: 'database_seed', default_value: '30', description: '仅作为数据库首次初始化的种子；已有运行策略请在 Web 管理页面调整。' },
    { field: 'backup.binary', kind: 'optional', source: 'startup', default_value: '"/usr/bin/pgbackrest"', description: '本地备份功能未启用，此参数无需补齐；启用时请检查实际路径和挂载。' },
  ]
  if (scenario === 'required') {
    items.unshift({ field: 'tls.certificate_chain_file', kind: 'required', source: 'startup', default_value: null, description: '请填写证书链路径。此状态仅用于界面演示；实际服务缺少必需参数时无法启动。' })
  }
  return {
    component: 'server',
    version: '演示',
    checked_at: new Date().toISOString(),
    items: scenario === 'complete' ? [] : items,
  }
}
