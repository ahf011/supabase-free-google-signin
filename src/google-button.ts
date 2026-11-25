// BROWSER code for sites with NO server (plain HTML, Vite, single-page apps).
// Shows Google's own button and hands the result to Supabase. No client secret.
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    google?: any
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client'
let loading: Promise<void> | null = null

function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google sign-in could not load. Check your connection or content blocker.'))
    }
    document.head.appendChild(script)
  })
  return loading
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

/**
 * Draws the button inside `element`. `onResult` gets null on success, or the error.
 * `supabase` is your existing browser client.
 */
export async function mountGoogleButton(
  element: HTMLElement,
  supabase: Pick<SupabaseClient, 'auth'>,
  clientId: string,
  onResult: (error: Error | null) => void,
): Promise<void> {
  await loadGoogle()
  // Google receives the hash. Supabase receives the original and compares them.
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const hashed = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))))

  window.google.accounts.id.initialize({
    client_id: clientId,
    nonce: hashed,
    callback: async ({ credential }: { credential: string }) => {
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce })
      // A fresh nonce for the next attempt.
      if (error) await mountGoogleButton(element, supabase, clientId, onResult)
      onResult(error)
    },
  })
  element.replaceChildren()
  window.google.accounts.id.renderButton(element, { theme: 'outline', size: 'large', text: 'continue_with', width: 300 })
}
