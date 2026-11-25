// BROWSER code for sites that have a server (use with google-auth.ts).

const BASE = '/api/auth/google'
const here = () => window.location.pathname + window.location.search

/** Simplest and most reliable: the whole tab goes to Google and comes back. */
export function signInWithGoogle(next: string = here()) {
  window.location.assign(`${BASE}/start?${new URLSearchParams({ next })}`)
}

let active: AbortController | null = null

/** Optional: keeps your page open and shows Google in a small window. Call directly from a click. */
export async function signInWithGooglePopup(next: string = here()): Promise<void> {
  active?.abort()
  const attempt = new AbortController()
  active = attempt

  const popupId = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  // Open before any await, or the browser blocks the window.
  const popup = window.open(
    `${BASE}/start?${new URLSearchParams({ next, popup: popupId })}`,
    'google-signin',
    'popup=yes,width=520,height=680',
  )
  if (!popup) return signInWithGoogle(next)

  // Ask our own server for the result. Browser security headers can cut the link
  // between the two windows, so we do not rely on window.opener or popup.closed.
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline && !attempt.signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, 1200))
    if (attempt.signal.aborted) break
    const request = new AbortController()
    const stop = () => request.abort()
    const timer = setTimeout(stop, 8000)
    attempt.signal.addEventListener('abort', stop, { once: true })
    let result: { error?: unknown; redirect?: unknown }
    try {
      const response = await fetch(`${BASE}/status?popup=${popupId}`, { cache: 'no-store', credentials: 'same-origin', signal: request.signal })
      result = await response.json()
    } catch {
      continue // A brief network problem should not end the attempt.
    } finally {
      clearTimeout(timer)
      attempt.signal.removeEventListener('abort', stop)
    }
    if (attempt.signal.aborted) break
    if (typeof result.error === 'string') throw new Error(result.error)
    if (typeof result.redirect === 'string' && result.redirect.startsWith('/') && !result.redirect.startsWith('//')) {
      popup.close()
      window.location.assign(result.redirect)
      return
    }
  }
  throw new Error(attempt.signal.aborted ? 'Google sign-in was canceled.' : 'Google sign-in timed out. Please try again.')
}

/** Call this if the user signs in another way or leaves the sign-in screen. */
export function cancelGoogleSignIn() {
  active?.abort()
}
