const pendingStates = new Set(['pending', 'running', 'retrying'])

export function isProjectionPending(status) {
  return pendingStates.has(status)
}

export function projectionMessage(status) {
  if (!isProjectionPending(status)) return ''
  return status === 'retrying'
    ? '扫描结果已保存，资产更新暂时延迟，系统正在自动重试。'
    : '扫描结果已保存，资产更新中，完成后将自动刷新。'
}
