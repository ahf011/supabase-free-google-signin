import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoogleAuth, safeNext, type GoogleAuthConfig } from '../src/google-auth'
import { CLIENT_ID, CLIENT_SECRET, SUPABASE_URL, cookieJar, createMocks } from './mocks'

const ORIGIN = 'https://www.example.com'
const POPUP = 'a'.repeat(64)

function setup(mockOptions: Parameters<typeof createMocks>[0] = {}, config: Partial<GoogleAuthConfig> = {}) {
  const mocks = createMocks(mockOptions)
  const auth = createGoogleAuth({
    appOrigin: ORIGIN, googleClientId: CLIENT_ID, googleClientSecret: CLIENT_SECRET,
    supabaseUrl: SUPABASE_URL, supabaseKey: 'publishable-key', fetch: mocks.fetch, ...config,
  })
  const jar = cookieJar()
  const get = (path: string, headers: Record<string, string> = {}) =>
    new Request(`http://internal:3000${path}`, { headers: { cookie: jar.header(), ...headers } })

  async function begin(query = 'next=/dashboard') {
    const response = await auth.start(get(`/api/auth/google/start?${query}`))
    jar.save(response)
    return { response, ...mocks.authorize(response.headers.get('location')!) }
  }
  async function finish(query: string) {
    const response = await auth.callback(get(`/api/auth/google/callback?${query}`))
    jar.save(response)
    return response
  }
  return { auth, mocks, jar, get, begin, finish }
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('safeNext', () => {
  it.each(['/', '/practice', '/a?b=1#c'])('keeps %s', value => expect(safeNext(value)).toBe(value))
  it.each([
    'https://evil.com', '//evil.com', '/\\evil.com', '/.//evil.com', '/..//evil.com', '/%2e%2e//evil.com',
    '/\t/evil.com', '/\n/evil.com', 'evil.com', 'javascript:alert(1)', '', null, 42, `/${'a'.repeat(3000)}`,
  ])('rejects %j', value => expect(safeNext(value, '/home')).toBe('/home'))
})

describe('full-page flow', () => {
  it('sends the browser to Google with your own callback, state, nonce and PKCE', async () => {
    const { begin } = setup()
    const { response } = await begin()
    const url = new URL(response.headers.get('location')!)
    expect(response.status).toBe(302)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/google/callback`)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('nonce')).toMatch(/^[a-f0-9]{64}$/)
    expect(url.toString()).not.toContain('supabase')
    expect(url.toString()).not.toContain(CLIENT_SECRET)
    const cookie = response.headers.getSetCookie()[0]
    expect(cookie).toContain('__Host-gauth-flow=')
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('creates a Supabase session cookie and returns to the requested page', async () => {
    const { begin, finish, jar, mocks } = setup()
    const { code, state } = await begin()
    const response = await finish(`code=${code}&state=${state}`)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect([...jar.cookies.keys()]).toEqual(['sb-abcdefghij-auth-token'])
    const exchange = mocks.calls[1].body
    expect(exchange.provider).toBe('google')
    expect(createHash('sha256').update(exchange.nonce).digest('hex')).toBe(
      JSON.parse(Buffer.from(exchange.id_token.split('.')[1], 'base64url').toString()).nonce,
    )
  })

  it('can keep an existing cookie name after the project address changes', async () => {
    const { begin, finish, jar } = setup({}, { cookieName: 'sb-auth-auth-token', cookieDomain: '.example.com' })
    const { code, state } = await begin()
    const response = await finish(`code=${code}&state=${state}`)
    expect([...jar.cookies.keys()]).toEqual(['sb-auth-auth-token'])
    expect(response.headers.getSetCookie().join()).toContain('Domain=.example.com')
  })

  it('never redirects off your site', async () => {
    const { begin, finish } = setup()
    const { code, state } = await begin('next=//evil.com')
    expect((await finish(`code=${code}&state=${state}`)).headers.get('location')).toBe(`${ORIGIN}/`)
  })

  it('works on localhost without secure cookies', async () => {
    const { begin } = setup({}, { appOrigin: 'http://localhost:3000' })
    const { response } = await begin()
    expect(response.headers.getSetCookie()[0]).toMatch(/^gauth-flow=/)
    expect(response.headers.getSetCookie()[0]).not.toMatch(/Secure/i)
  })
})

describe('rejections', () => {
  const sessionCookies = (response: Response) => response.headers.getSetCookie().filter(line => line.startsWith('sb-'))
  const expectError = (response: Response, code: string) => {
    expect(response.headers.get('location')).toBe(`${ORIGIN}/signin?auth_error=${code}`)
    expect(sessionCookies(response)).toEqual([])
  }

  it('rejects a wrong state', async () => {
    const { begin, finish, mocks } = setup()
    const { code } = await begin()
    expectError(await finish(`code=${code}&state=${'b'.repeat(64)}`), 'expired')
    expect(mocks.calls).toEqual([])
  })

  it('rejects a callback with no cookie (another browser, or www versus bare domain)', async () => {
    const { begin, finish, jar } = setup()
    const { code, state } = await begin()
    jar.cookies.clear()
    expectError(await finish(`code=${code}&state=${state}`), 'expired')
  })

  it('rejects an attempt older than ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { begin, finish } = setup()
    const { code, state } = await begin()
    vi.setSystemTime(Date.now() + 601_000)
    expectError(await finish(`code=${code}&state=${state}`), 'expired')
  })

  it('handles cancel', async () => {
    const { begin, finish } = setup()
    const { state } = await begin()
    expectError(await finish(`error=access_denied&state=${state}`), 'canceled')
  })

  it.each([
    ['a wrong client secret', { tokenStatus: 401 }, 'exchange_failed'],
    ['a changed nonce', { tamperNonce: true }, 'verification_failed'],
    ['a client ID Supabase does not list', { audience: 'other' }, 'verification_failed'],
  ])('rejects %s', async (_name, options, error) => {
    const { begin, finish } = setup(options)
    const { code, state } = await begin()
    expectError(await finish(`code=${code}&state=${state}`), error)
  })

  it('rejects starting from another website', async () => {
    const { auth, get } = setup()
    const response = await auth.start(get('/api/auth/google/start', { 'sec-fetch-site': 'cross-site' }))
    expect(response.status).toBe(400)
  })

  it('answers 503 when settings are missing or the site is not https', async () => {
    for (const config of [{ googleClientSecret: '' }, { appOrigin: 'http://www.example.com' }]) {
      const { auth, get } = setup({}, config)
      expect((await auth.start(get('/api/auth/google/start'))).status).toBe(503)
      expect((await auth.callback(get('/api/auth/google/callback'))).status).toBe(503)
    }
  })
})

describe('popup mode', () => {
  const read = async (ctx: ReturnType<typeof setup>, id = POPUP) => {
    const response = await ctx.auth.status(ctx.get(`/api/auth/google/status?popup=${id}`))
    return response.json()
  }

  it('reports pending, then the destination', async () => {
    const ctx = setup()
    const { code, state } = await ctx.begin(`next=/dashboard&popup=${POPUP}`)
    expect(await read(ctx)).toEqual({ pending: true })
    const page = await ctx.finish(`code=${code}&state=${state}`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('Sign-in complete.')
    for (const secret of ['google-access', 'refresh', CLIENT_SECRET]) expect(html).not.toContain(secret)
    expect(await read(ctx)).toEqual({ redirect: '/dashboard' })
    expect(await read(ctx, 'c'.repeat(64))).toEqual({ pending: true })
  })

  it('reports cancel', async () => {
    const ctx = setup()
    const { state } = await ctx.begin(`popup=${POPUP}`)
    await ctx.finish(`error=access_denied&state=${state}`)
    expect(await read(ctx)).toEqual({ error: 'Google sign-in was canceled.' })
  })

  it('does not report success without a real session', async () => {
    const ctx = setup()
    const { code, state } = await ctx.begin(`popup=${POPUP}`)
    await ctx.finish(`code=${code}&state=${state}`)
    ctx.jar.cookies.delete('sb-abcdefghij-auth-token')
    expect(await read(ctx)).toEqual({ error: 'Google sign-in could not be verified. Please try again.' })
  })

  it('escapes the destination in the page', async () => {
    const ctx = setup()
    const { code, state } = await ctx.begin(`next=${encodeURIComponent('/a?x="><script>')}&popup=${POPUP}`)
    expect(await (await ctx.finish(`code=${code}&state=${state}`)).text()).not.toContain('<script>')
  })

  it('rejects bad ids and cross-site reads', async () => {
    const ctx = setup()
    expect((await ctx.auth.start(ctx.get('/api/auth/google/start?popup=nope'))).status).toBe(400)
    expect((await ctx.auth.status(ctx.get('/api/auth/google/status?popup=nope'))).status).toBe(400)
    const cross = await ctx.auth.status(ctx.get(`/api/auth/google/status?popup=${POPUP}`, { 'sec-fetch-site': 'cross-site' }))
    expect(cross.status).toBe(403)
  })
})
