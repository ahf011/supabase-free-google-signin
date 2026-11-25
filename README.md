# supabase-free-google-signin

[![ci](https://github.com/ahf011/supabase-free-google-signin/actions/workflows/ci.yml/badge.svg)](https://github.com/ahf011/supabase-free-google-signin/actions/workflows/ci.yml)

Your Google login says `qzxkvjwpmrt.supabase.co`? That's giving phishing link. 💀

Send Google back to **your** domain instead. No $10/month custom domain add-on. Same database, same users.

| | Before 😬 | After 😮‍💨 |
|---|---|---|
| Google shows | random `supabase.co` | your domain (your app name once Google verifies it) |
| Custom domain add-on | $10/month | $0 |
| Supabase Free plan | no custom domains | works, if you fit its limits |

## Speedrun: let AI cook 🧑‍🍳

**Claude Code**

```bash
git clone https://github.com/ahf011/supabase-free-google-signin ~/.claude/skills/supabase-free-google-signin
```

**Codex**

```bash
git clone https://github.com/ahf011/supabase-free-google-signin ~/.codex/skills/supabase-free-google-signin
```

Open your site's project and say:

> use the supabase-free-google-signin skill

Any other AI: clone this repo, give it the folder, paste [PROMPT.md](PROMPT.md).

## Manual: Next.js in 5 moves

For the App Router with `@supabase/ssr`. Not you? [Other setups](docs/setup.md).

**1. Google.** In your web OAuth client, add this redirect URI:

```text
https://YOUR-DOMAIN/api/auth/google/callback
```

**2. Supabase.** Authentication → Google → put that client ID first under **Client IDs**.

**3. Env vars.** Add to your host:

```bash
APP_ORIGIN=https://YOUR-DOMAIN
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
```

The secret stays on the server. Never prefix it with `NEXT_PUBLIC_`.

**4. Code.** Install the packages, then copy [`src/google-auth.ts`](src/google-auth.ts) and [`src/google-signin-client.ts`](src/google-signin-client.ts) into `lib/`.

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Create `app/api/auth/google/[action]/route.ts`:

```ts
import { createGoogleAuth } from '@/lib/google-auth'

const google = createGoogleAuth({
  appOrigin: process.env.APP_ORIGIN!,
  googleClientId: process.env.GOOGLE_CLIENT_ID!,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  signInPath: '/signin',
  defaultNext: '/dashboard',
})

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (action === 'start' || action === 'callback' || action === 'status') return google[action](request)
  return new Response('Not found', { status: 404 })
}
```

**5. Button.** Keep your design, swap the click:

```tsx
import { signInWithGoogle } from '@/lib/google-signin-client'

<button type="button" onClick={() => signInWithGoogle('/dashboard')}>Continue with Google</button>
```

Deploy, then [test it for real](docs/setup.md#test-it).

## Don't get cooked 🚨

- **Keep your old custom domain** until the new login works live. [Removal order](docs/remove-custom-domain.md).
- **Back up** before you delete or downgrade anything. [Free plan checklist](docs/free-plan.md).
- Something broke? [Troubleshooting](docs/troubleshooting.md).

## Real talk

- `supabase.co` still shows up in dev tools. This fixes the sign-in screen.
- Web Google sign-in only. Apple, GitHub and native apps don't change.
- Free plan limits still apply.
- Tests use fake Google and Supabase servers. Do a real login on your site before trusting it.
- Prices checked November 2026. [Check current ones](https://supabase.com/pricing).
- Not affiliated with Supabase or Google.

## Repo map

```text
src/        the code you copy
tests/      automated tests
docs/       setup, domain removal, Free plan, fixes, security
SKILL.md    instructions for AI agents
PROMPT.md   same thing for any other AI
```

## Contributing

Node 22+. Run this before opening a PR:

```bash
npm ci && npm run check
```

[MIT](LICENSE)
