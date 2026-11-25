import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signInWithGooglePopup, cancelGoogleSignIn } from '../src/google-signin-client'
import { mountGoogleButton } from '../src/google-button'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function fakeWindow(popup: object | null) {
  const window = { location: { pathname: '/signin', search: '', assign: vi.fn() }, open: vi.fn(() => popup) }
  vi.stubGlobal('window', window)
  return window
}
const replies = (...bodies: (object | Error)[]) =>
  vi.stubGlobal('fetch', vi.fn(async () => {
    const body = bodies.length > 1 ? bodies.shift()! : bodies[0]
    if (body instanceof Error) throw body
    return new Response(JSON.stringify(body))
  }))

describe('popup client', () => {
  it('falls back to a full-page redirect when the popup is blocked', async () => {
    const window = fakeWindow(null)
    await signInWithGooglePopup('/dashboard')
    expect(window.location.assign).toHaveBeenCalledWith('/api/auth/google/start?next=%2Fdashboard')
  })

  it('survives a network error, then navigates', async () => {
    vi.useFakeTimers()
    const close = vi.fn()
    const window = fakeWindow({ close })
    replies(new Error('offline'), { pending: true }, { redirect: '/dashboard' })
    const done = signInWithGooglePopup('/dashboard')
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(close).toHaveBeenCalled()
    expect(window.location.assign).toHaveBeenCalledWith('/dashboard')
  })

  it.each([
    [{ error: 'Google sign-in was canceled.' }, /canceled/],
    [{ redirect: '//evil.com' }, /timed out/],
  ])('throws for %j', async (body, message) => {
    vi.useFakeTimers()
    const window = fakeWindow({ close: vi.fn() })
    replies(body)
    const done = expect(signInWithGooglePopup()).rejects.toThrow(message)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 2000)
    await done
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('can be canceled', async () => {
    vi.useFakeTimers()
    fakeWindow({ close: vi.fn() })
    replies({ pending: true })
    const done = expect(signInWithGooglePopup()).rejects.toThrow(/canceled/)
    cancelGoogleSignIn()
    await vi.advanceTimersByTimeAsync(2000)
    await done
  })
})

describe('Google button (no server)', () => {
  it('gives Google the hashed nonce and Supabase the original, and renews it after an error', async () => {
    const initialize = vi.fn()
    const renderButton = vi.fn()
    vi.stubGlobal('window', { google: { accounts: { id: { initialize, renderButton } } } })
    const signInWithIdToken = vi.fn()
      .mockResolvedValueOnce({ error: new Error('nope') })
      .mockResolvedValueOnce({ error: null })
    const onResult = vi.fn()
    const element = { replaceChildren: vi.fn() } as unknown as HTMLElement

    await mountGoogleButton(element, { auth: { signInWithIdToken } } as any, 'client-id', onResult)
    for (const attempt of [0, 1]) {
      const options = initialize.mock.calls[attempt][0]
      await options.callback({ credential: 'google-token' })
      const sent = signInWithIdToken.mock.calls[attempt][0]
      expect(sent).toMatchObject({ provider: 'google', token: 'google-token' })
      expect(createHash('sha256').update(sent.nonce).digest('hex')).toBe(options.nonce)
    }
    expect(initialize.mock.calls[0][0].nonce).not.toBe(initialize.mock.calls[1][0].nonce)
    expect(onResult.mock.calls.map(call => call[0]?.message ?? null)).toEqual(['nope', null])
  })
})
