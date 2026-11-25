// Stand-ins for Google and Supabase Auth. They copy the checks that matter here.
import { createHash, randomBytes } from 'node:crypto'

export const CLIENT_ID = 'test-client.apps.googleusercontent.com'
export const CLIENT_SECRET = 'test-secret'
export const SUPABASE_URL = 'https://abcdefghij.supabase.co'

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createMocks(options: { tamperNonce?: boolean; audience?: string; tokenStatus?: number } = {}) {
  const codes = new Map<string, URLSearchParams>()
  const sessions = new Set<string>()
  const calls: { url: string; body?: any }[] = []

  /** What Google does when the user picks an account. */
  function authorize(authorizeUrl: string) {
    const params = new URL(authorizeUrl).searchParams
    const code = randomBytes(12).toString('hex')
    codes.set(code, params)
    return { code, state: params.get('state')!, redirectUri: params.get('redirect_uri')! }
  }

  const fetchMock = (async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : (input.url ?? input.toString()))
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(init.body.toString())
      calls.push({ url: url.href, body: Object.fromEntries(body) })
      if (options.tokenStatus) return json({ error: 'invalid_client' }, options.tokenStatus)
      const request = codes.get(body.get('code')!)
      codes.delete(body.get('code')!)
      const challenge = createHash('sha256').update(body.get('code_verifier')!).digest('base64url')
      if (!request || body.get('client_secret') !== CLIENT_SECRET || body.get('redirect_uri') !== request.get('redirect_uri') || challenge !== request.get('code_challenge')) {
        return json({ error: 'invalid_grant' }, 400)
      }
      const claims = { aud: options.audience ?? CLIENT_ID, nonce: options.tamperNonce ? 'wrong' : request.get('nonce'), sub: '1' }
      return json({ id_token: `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`, access_token: 'google-access' })
    }
    if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/token') {
      const body = JSON.parse(init.body)
      calls.push({ url: url.href, body })
      const claims = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url').toString())
      if (claims.aud !== CLIENT_ID) return json({ code: 400, msg: 'Unacceptable audience in id_token' }, 400)
      if (claims.nonce !== createHash('sha256').update(body.nonce ?? '').digest('hex')) return json({ code: 400, msg: 'Nonces mismatch' }, 400)
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = `${b64({ alg: 'HS256' })}.${b64({ sub: 'user-1', exp })}.${randomBytes(8).toString('base64url')}`
      sessions.add(token)
      return json({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh', user: user() })
    }
    if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/user') {
      const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '') ?? ''
      return sessions.has(token) ? json(user()) : json({ code: 401, msg: 'invalid token' }, 401)
    }
    throw new Error(`Unexpected request: ${url.href}`)
  }) as typeof fetch

  const user = () => ({ id: 'user-1', aud: 'authenticated', email: 'person@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })

  return { fetch: fetchMock, authorize, calls }
}

/** A very small cookie jar, like a browser's. */
export function cookieJar() {
  const cookies = new Map<string, string>()
  return {
    cookies,
    save(response: Response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';')
        const index = pair.indexOf('=')
        const name = pair.slice(0, index)
        const value = pair.slice(index + 1)
        if (/max-age=0(;|$)/i.test(line) || !value) cookies.delete(name)
        else cookies.set(name, value)
      }
    },
    header: () => Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; '),
  }
}
