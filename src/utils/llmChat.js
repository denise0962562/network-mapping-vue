import { getCookieValue } from './csrf'
import { handleUnauthorized } from './http'
import { readEvents } from './llm'

export async function chatRequest(payload, signal, onEvent) {
  const response = await fetch('/api/llm/debug/chat', { method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookieValue('csrf_token') || '' }, body: JSON.stringify(payload) })
  if (response.status === 401) handleUnauthorized()
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw { response: { status: response.status, data } }
  }
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('llm_invalid_stream')
  await readEvents(response.body, onEvent)
}
