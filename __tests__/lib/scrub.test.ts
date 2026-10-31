import { describe, it, expect } from 'vitest'
import { scrubEvent } from '@/lib/monitoring/scrub'

describe('scrubEvent', () => {
  it('removes request bodies, cookies, emails and conversation content', () => {
    const e = scrubEvent({
      request: { data: '{"message":"my father died"}', cookies: 'sb=…', headers: { 'user-agent': 'UA', authorization: 'Bearer x' }, query_string: 'q=1' },
      user: { id: 'u1', email: 'a@b.in', ip_address: '1.2.3.4' },
      extra: { message: 'my father died', sessionId: 's1', apiKey: 'k' },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api/chat', method: 'POST', body: 'secret', status_code: 200 } }],
    })
    expect(JSON.stringify(e)).not.toMatch(/father|a@b\.in|Bearer|1\.2\.3\.4|secret|sb=/)
    expect(e.user).toEqual({ id: 'u1' })
    expect(e.extra).toEqual({ sessionId: 's1' })
    expect(e.request?.headers).toEqual({ 'user-agent': 'UA' })
  })
})
