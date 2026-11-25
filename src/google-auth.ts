// SERVER ONLY. Never import this file into browser code.
//
// Google sign-in that returns to YOUR domain, then creates a normal Supabase session.
// Uses web-standard Request and Response, so it runs in Next.js route handlers and
// other servers that speak those types.
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export type GoogleAuthConfig = {
  /** Public address of your site, for example https://www.example.com (no path). */
  appOrigin: string
  googleClientId: string
  googleClientSecret: string
  /** The default project address: https://<project-ref>.supabase.co */
  supabaseUrl: string
  /** Publishable key or legacy anon key. Never the secret or service role key. */
  supabaseKey: string
  /** Page that shows sign-in errors. Default: /signin */
  signInPath?: string
  /** Where to go after sign-in when no destination was requested. Default: / */
  defaultNext?: string
  /** Set only if your app already uses a custom Supabase cookie name. */
  cookieName?: string
  /** Set only if your app already shares the session cookie across subdomains. */
  cookieDomain?: string
  /** For tests. Leave unset in your app. */
  fetch?: typeof fetch
}

const FLOW_SECONDS = 600
const RESULT_SECONDS = 120
const PLACEHOLDER = 'https://placeholder.invalid'

const MESSAGES = {
  canceled: 'Google sign-in was canceled.',
  expired: 'This sign-in attempt expired. Please try again.',
  exchange_failed: 'Google sign-in could not be completed. Please try again.',
  verification_failed: 'Google sign-in could not be verified. Please try again.',
} as const
type ErrorCode = keyof typeof MESSAGES

type Flow = { state: string; nonce: string; verifier: string; next: string; popup: string | null; created: number }

const sha256 = (value: string) => createHash('sha256').update(value)
const isHex64 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function decode(value: string | undefined): Record<string, unknown> | null {
  try {
    const data = JSON.parse(Buffer.from(value || '', 'base64url').toString())
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

const isFresh = (created: unknown, seconds: number) =>
  typeof created === 'number' && Date.now() >= created && Date.now() - created < seconds * 1000

/** Allow only paths on your own site, so sign-in cannot be used to send people elsewhere. */
export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('/')) return fallback
  if (value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback
  const url = new URL(value, PLACEHOLDER)
  const path = url.pathname + url.search + url.hash
  return url.origin === PLACEHOLDER && !path.startsWith('//') ? path : fallback
}

export function createGoogleAuth(config: GoogleAuthConfig) {
  // Settings are checked per request, so a build without secrets does not crash.
  function settings() {
    const required = ['appOrigin', 'googleClientId', 'googleClientSecret', 'supabaseUrl', 'supabaseKey'] as const
    const missing = required.filter(key => !config[key]?.trim())
    if (missing.length) {
      console.error('[google-auth] missing settings:', missing.join(', '))
      return null
    }
    const origin = new URL(config.appOrigin.trim()).origin
    const { protocol, hostname } = new URL(origin)
    if (protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      console.error('[google-auth] appOrigin must use https outside local development')
      return null
    }
    return {
      origin,
      secure: protocol === 'https:',
      redirectUri: `${origin}/api/auth/google/callback`,
      clientId: config.googleClientId.trim(),
      clientSecret: config.googleClientSecret.trim(),
      supabaseUrl: config.supabaseUrl.trim(),
      supabaseKey: config.supabaseKey.trim(),
      signInPath: safeNext(config.signInPath, '/signin'),
      defaultNext: safeNext(config.defaultNext, '/'),
    }
  }
  type Settings = NonNullable<ReturnType<typeof settings>>

  const baseHeaders = () => new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
  const text = (message: string, status: number) => new Response(message, { status, headers: baseHeaders() })
  const unavailable = () => text('Google sign-in is temporarily unavailable.', 503)

  const cookieName = (s: Settings, name: 'flow' | 'result') => `${s.secure ? '__Host-' : ''}gauth-${name}`

  function setCookie(s: Settings, headers: Headers, name: 'flow' | 'result', value: string, maxAge: number) {
    headers.append(
      'Set-Cookie',
      serializeCookieHeader(cookieName(s, name), value, { httpOnly: true, secure: s.secure, sameSite: 'lax', path: '/', maxAge }),
    )
  }

  const requestCookies = (request: Request) =>
    parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({ name, value: value ?? '' }))

  const readCookie = (s: Settings, request: Request, name: 'flow' | 'result') =>
    requestCookies(request).find(cookie => cookie.name === cookieName(s, name))?.value

  function readFlow(s: Settings, request: Request): Flow | null {
    const data = decode(readCookie(s, request, 'flow'))
    if (!data || !isHex64(data.state) || !isHex64(data.nonce) || !isFresh(data.created, FLOW_SECONDS)) return null
    if (typeof data.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.verifier)) return null
    return {
      state: data.state,
      nonce: data.nonce,
      verifier: data.verifier,
      next: safeNext(data.next, s.defaultNext),
      popup: isHex64(data.popup) ? data.popup : null,
      created: data.created as number,
    }
  }

  // Writes the session with the same cookie format the rest of your app reads.
  function supabaseFor(s: Settings, request: Request, headers: Headers) {
    const domain = config.cookieDomain
    return createServerClient(s.supabaseUrl, s.supabaseKey, {
      cookieOptions: { ...(config.cookieName ? { name: config.cookieName } : {}), ...(domain ? { domain } : {}) },
      global: config.fetch ? { fetch: config.fetch } : {},
      cookies: {
        getAll: () => requestCookies(request),
        setAll: (cookies, cacheHeaders?: Record<string, string>) => {
          for (const { name, value, options } of cookies) headers.append('Set-Cookie', serializeCookieHeader(name, value, options))
          for (const [key, value] of Object.entries(cacheHeaders ?? {})) headers.set(key, value)
        },
      },
    })
  }

  /** GET /api/auth/google/start?next=/path  (add &popup=<64 hex> for popup mode) */
  async function start(request: Request): Promise<Response> {
    const s = settings()
    if (!s) return unavailable()
    if (request.headers.get('sec-fetch-site') === 'cross-site') return text('Invalid sign-in request.', 400)
    const query = new URL(request.url).searchParams
    const popup = query.get('popup')
    if (popup !== null && !isHex64(popup)) return text('Invalid sign-in request.', 400)

    const flow: Flow = {
      state: randomBytes(32).toString('hex'),
      nonce: randomBytes(32).toString('hex'),
      verifier: randomBytes(32).toString('base64url'),
      next: safeNext(query.get('next'), s.defaultNext),
      popup,
      created: Date.now(),
    }
    const google = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    google.search = new URLSearchParams({
      client_id: s.clientId,
      redirect_uri: s.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: flow.state,
      // Google receives the hash. Supabase receives the original and compares them.
      nonce: sha256(flow.nonce).digest('hex'),
      code_challenge: sha256(flow.verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString()

    const headers = baseHeaders()
    headers.set('Location', google.toString())
    setCookie(s, headers, 'flow', encode(flow), FLOW_SECONDS)
    if (popup) setCookie(s, headers, 'result', '', 0)
    return new Response(null, { status: 302, headers })
  }

  /** GET /api/auth/google/callback  (Google sends the browser here) */
  async function callback(request: Request): Promise<Response> {
    const s = settings()
    if (!s) return unavailable()
    const query = new URL(request.url).searchParams
    const flow = readFlow(s, request)
    const state = query.get('state')

    if (!flow || !isHex64(state) || !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))) {
      console.error('[google-auth] callback: missing cookie or state mismatch')
      const headers = baseHeaders()
      headers.set('Location', `${s.origin}${withError(s.signInPath, 'expired')}`)
      return new Response(null, { status: 303, headers })
    }

    const headers = baseHeaders()
    const finish = (error?: ErrorCode): Response => {
      setCookie(s, headers, 'flow', '', 0)
      if (!flow.popup) {
        headers.set('Location', `${s.origin}${error ? withError(s.signInPath, error) : flow.next}`)
        return new Response(null, { status: 303, headers })
      }
      setCookie(s, headers, 'result', encode({ popup: flow.popup, error, next: flow.next, created: Date.now() }), RESULT_SECONDS)
      headers.set('Content-Type', 'text/html; charset=utf-8')
      headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
      const message = error ? MESSAGES[error] : 'Sign-in complete.'
      const link = error ? s.signInPath : flow.next
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in</title></head>` +
          `<body style="font:18px system-ui;max-width:440px;margin:15vh auto;padding:24px"><p>${message}</p><p>You can close this window.</p>` +
          `<a href="${escapeHtml(link)}">Continue here</a></body></html>`,
        { status: error ? 400 : 200, headers },
      )
    }

    const googleError = query.get('error')
    if (googleError) return finish(googleError === 'access_denied' ? 'canceled' : 'exchange_failed')
    const code = query.get('code')
    if (!code || code.length > 4096) return finish('exchange_failed')

    try {
      const response = await (config.fetch ?? fetch)('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: s.clientId,
          client_secret: s.clientSecret,
          code,
          code_verifier: flow.verifier,
          grant_type: 'authorization_code',
          redirect_uri: s.redirectUri,
        }),
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      })
      const tokens = (await response.json()) as { id_token?: unknown; access_token?: unknown; error?: unknown }
      if (!response.ok || typeof tokens.id_token !== 'string') {
        console.error('[google-auth] token exchange failed:', response.status, String(tokens.error))
        return finish('exchange_failed')
      }
      // Supabase verifies the signature, audience, issuer and expiry. We also require
      // our own nonce, even if "Skip nonce check" is turned on in the project.
      const claims = decode(tokens.id_token.split('.')[1])
      if (claims?.nonce !== sha256(flow.nonce).digest('hex')) {
        console.error('[google-auth] nonce mismatch')
        return finish('verification_failed')
      }
      const { data, error } = await supabaseFor(s, request, headers).auth.signInWithIdToken({
        provider: 'google',
        token: tokens.id_token,
        nonce: flow.nonce,
        ...(typeof tokens.access_token === 'string' ? { access_token: tokens.access_token } : {}),
      })
      if (error || !data.session) {
        console.error('[google-auth] Supabase rejected the Google token:', error?.message)
        return finish('verification_failed')
      }
      return finish()
    } catch (error) {
      console.error('[google-auth] callback failed:', error instanceof Error ? error.message : 'unknown error')
      return finish('exchange_failed')
    }
  }

  /** GET /api/auth/google/status?popup=<id>  (popup mode only) */
  async function status(request: Request): Promise<Response> {
    const s = settings()
    const headers = baseHeaders()
    const json = (body: object, code = 200) => {
      headers.set('Content-Type', 'application/json')
      return new Response(JSON.stringify(body), { status: code, headers })
    }
    if (!s) return json({ error: 'Google sign-in is temporarily unavailable.' }, 503)
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Invalid request.' }, 403)
    const popup = new URL(request.url).searchParams.get('popup')
    if (!isHex64(popup)) return json({ error: 'Invalid request.' }, 400)

    const result = decode(readCookie(s, request, 'result'))
    if (!result || result.popup !== popup || !isFresh(result.created, RESULT_SECONDS)) return json({ pending: true })
    if (typeof result.error === 'string') {
      return json({ error: MESSAGES[result.error as ErrorCode] ?? MESSAGES.exchange_failed })
    }
    try {
      const { data, error } = await supabaseFor(s, request, headers).auth.getUser()
      if (error || !data.user) return json({ error: MESSAGES.verification_failed })
      return json({ redirect: safeNext(result.next, s.defaultNext) })
    } catch {
      return json({ pending: true })
    }
  }

  return { start, callback, status }
}

function withError(path: string, code: ErrorCode) {
  const url = new URL(path, PLACEHOLDER)
  url.searchParams.set('auth_error', code)
  return url.pathname + url.search + url.hash
}
