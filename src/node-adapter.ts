// Use google-auth.ts with Express or plain Node. These routes are GET only.
import type { IncomingMessage, ServerResponse } from 'node:http'

export function toNode(handler: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value && !key.startsWith(':')) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    // Only the path and query are used. The public address comes from appOrigin.
    const url = new URL(`http://localhost${req.originalUrl ?? req.url ?? '/'}`)
    const response = await handler(new Request(url, { headers }))
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) res.setHeader('Set-Cookie', cookies)
    res.end(await response.text())
  }
}
