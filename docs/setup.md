# Setup

## How it works

1. Someone clicks **Continue with Google** on your site.
2. Google sends them back to your domain.
3. Your site gives Google's signed ID token to Supabase with `signInWithIdToken`.
4. Supabase verifies it and creates the normal session.

## Pick your path

| Your site | Use |
|---|---|
| No server (plain HTML, Vite, single-page app) | [Path A](#path-a-no-server): Google's button. No client secret |
| Server routes, session in cookies with `@supabase/ssr` | [Path B](#path-b-your-own-server): your own callback |
| Server, but session in browser storage | Path A, or move to `@supabase/ssr` first (everyone signs in once more) |

Path B needs your pages and sign-in routes on the same domain. Tested with Next.js 15 and Express 5. Current Supabase libraries need Node 22 or newer.

## Before you start

- Owner access to Supabase, Google Cloud, hosting and DNS.
- Your project ref: the first part of `https://<project-ref>.supabase.co`.
- One site address, for example `https://www.example.com`. Choose `www` or not, and redirect the other.
- Paying for a custom domain? **Do not remove it yet.**

## Google

In [Google Cloud Console](https://console.cloud.google.com/), open **Google Auth Platform**.

1. **Branding**: app name, support email, logo, home page, privacy policy, terms, authorized domain.
2. **Audience**: **External**. In Testing status only listed test users can sign in. Publish when ready.
3. **Data access**: only `openid`, `email`, `profile`.
4. **Clients**: use your **Web application** client, or create one. If Supabase already uses one, reuse it.
5. **Authorized JavaScript origins**: `https://www.example.com`, `http://localhost`, `http://localhost:3000`.
6. **Authorized redirect URIs** (keep what is there):
   - `https://www.example.com/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
   - `https://<project-ref>.supabase.co/auth/v1/callback`
7. Copy the **Client ID**. Path B also needs the **Client secret**.

Google may show a secret only once. A masked or hashed value will not work. If you lost it, add a second secret, update everywhere the old one is used, test, then disable the old one.

Redirect URIs must match exactly. Changes can take a few minutes.

## Supabase

**Authentication**, then the **Google** provider:

1. Turn it on.
2. **Client IDs**: web client ID first, then any iOS or Android IDs, comma separated.
3. **Client secret**: keep or add the matching one.
4. Leave **Skip nonce check** off unless a mobile app you already shipped needs it.

Check **URL Configuration**: Site URL and redirect list are correct.

## Path A: no server

Copy [`google-button.ts`](../src/google-button.ts) into your project.

```ts
import { createClient } from '@supabase/supabase-js'
import { mountGoogleButton } from './google-button'

// Use your existing client if you have one.
const supabase = createClient('https://<project-ref>.supabase.co', '<publishable-key>')
const message = document.getElementById('sign-in-error')!

mountGoogleButton(document.getElementById('google-button')!, supabase, '<web-client-id>', error => {
  if (error) message.textContent = error.message
  else window.location.assign('/dashboard')
}).catch(error => {
  message.textContent = error.message
})
```

```html
<div id="google-button"></div>
<p id="sign-in-error" role="alert"></p>
```

Remove every Google call to `signInWithOAuth`.

If you send security headers:

- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- Content Security Policy: allow `https://accounts.google.com/gsi/client` in `script-src`, `https://accounts.google.com/gsi/` in `frame-src` and `connect-src`, `https://accounts.google.com/gsi/style` in `style-src`.

Now [test it](#test-it).

## Path B: your own server

```bash
npm install @supabase/supabase-js @supabase/ssr
```

| Setting | Value |
|---|---|
| `APP_ORIGIN` | `https://www.example.com` |
| `GOOGLE_CLIENT_ID` | Web client ID |
| `GOOGLE_CLIENT_SECRET` | **Server only** |
| Supabase URL | `https://<project-ref>.supabase.co` |
| Supabase key | Publishable or anon key, never the secret or service role key |

Never prefix the secret with `NEXT_PUBLIC_`, `VITE_` or `PUBLIC_`. Never commit it. Locally use `APP_ORIGIN=http://localhost:3000` in an ignored `.env.local`.

Copy [`google-auth.ts`](../src/google-auth.ts) and [`google-signin-client.ts`](../src/google-signin-client.ts).

**Next.js**: follow the [5 moves in the README](../README.md#manual-nextjs-in-5-moves).

**Express**: also copy [`node-adapter.ts`](../src/node-adapter.ts).

```ts
import { createGoogleAuth } from './google-auth'
import { toNode } from './node-adapter'

const google = createGoogleAuth({
  appOrigin: process.env.APP_ORIGIN!,
  googleClientId: process.env.GOOGLE_CLIENT_ID!,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_KEY!,
})

app.get('/api/auth/google/start', toNode(google.start))
app.get('/api/auth/google/callback', toNode(google.callback))
app.get('/api/auth/google/status', toNode(google.status))
```

Read the session with `createServerClient` from `@supabase/ssr` and the request cookies.

### Popup instead of full page (optional)

Full page is recommended. For a popup, call this directly in the click handler:

```tsx
import { signInWithGooglePopup } from '@/lib/google-signin-client'

<button type="button" onClick={() => signInWithGooglePopup('/dashboard').catch(error => setError(error.message))}>
  Continue with Google
</button>
```

### Show errors

A failed full-page sign-in returns to `/signin?auth_error=<code>`.

```ts
const messages: Record<string, string> = {
  canceled: 'Google sign-in was canceled.',
  expired: 'That sign-in attempt expired. Please try again.',
  exchange_failed: 'Google sign-in could not be completed. Please try again.',
  verification_failed: 'Google sign-in could not be verified. Please try again.',
}
const code = new URLSearchParams(window.location.search).get('auth_error')
const message = code && Object.hasOwn(messages, code) ? messages[code] : null
```

### Check these

- Middleware lets `/api/auth/google/` through without sign-in.
- Every Google `signInWithOAuth` call is gone.
- No One Tap prompt competes on the sign-in page.
- Your rate limiting covers these routes.
- New users still get their profile or onboarding: point `next` at that page.

## Test it

Locally, then on the live site:

- [ ] Google's screen does not show `supabase.co`
- [ ] A new account can sign up
- [ ] An **existing** Google account opens the **same account and data**
- [ ] Refresh stays signed in, sign out works
- [ ] Cancel, then retry
- [ ] Phone, private window, Safari and Chrome
- [ ] Popup (if used) with popups blocked once
- [ ] Email sign-in, password reset and other providers still work
- [ ] Account deletion works on a throwaway account
- [ ] No `[google-auth]` errors in server logs

Preview deployments have new addresses, so Google rejects them unless you add each exact callback.

## Show your app name

In **Google Auth Platform** → **Branding**, submit brand verification. You need a public home page, a privacy policy on the same domain, and the domain verified in [Search Console](https://search.google.com/search-console). Manual review usually takes 2 to 3 business days. Publish the approved branding.

Never had a custom domain and already on Free? You're done. Otherwise: [remove the domain](remove-custom-domain.md), then optionally [go Free](free-plan.md).

## Official docs

- [Supabase: Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Google: OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google: Button setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google: Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
