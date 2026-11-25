---
name: supabase-free-google-signin
description: Move a website to Google sign-in that returns to its own domain and creates a Supabase session with signInWithIdToken, so the paid Supabase custom domain is not needed. Use when someone wants Google sign-in to stop showing a supabase.co address, wants to drop the Supabase custom domain add-on, or wants to move from Supabase Pro to Free without breaking sign-in.
---

# Branded Google sign-in without the Supabase custom domain

Read `docs/setup.md` before changing anything. Code to copy is in `src/`. All paths are relative to this skill's folder.

## Workflow

1. **Inspect, change nothing.** Framework, hosting, where the session lives (cookies or browser storage), every Google sign-in entry point, every use of a custom domain (code, setting names, mobile apps, other providers, webhooks, emails, saved URLs, headers). Report blockers.
2. **Choose the path.**
   - No server: `src/google-button.ts`.
   - Server with `@supabase/ssr` cookies: `src/google-auth.ts` and `src/google-signin-client.ts`. Add `src/node-adapter.ts` for Express or plain Node.
   - Full-page sign-in by default. Popup only if asked.
3. **Implement** with the existing Supabase project, button design and post-sign-in routing. Add error and retry states.
4. **Guide dashboard setup** (Google, Supabase, hosting) with exact values, one step at a time.
5. **Verify.** Existing tests, type check, build, rejection cases, local sign-in, then the live checklist in `docs/setup.md`. An existing Google user must open the same account.
6. **Only if asked,** remove the domain (`docs/remove-custom-domain.md`, in order) and downgrade (`docs/free-plan.md`).

Errors: use `docs/troubleshooting.md`. Security design: `docs/security.md`.

## Stop and ask first

Get a clear yes before each: deploying, production setting changes, copying a secret, removing a domain or DNS record, changing plans, pausing, deleting or moving a project, role changes, invitations.

## Never

- Print, log or commit secrets. The Google secret stays server only. Do not use the service role key.
- Remove the domain before the new sign-in is verified live, all uses are replaced and a backup is checked.
- Remove a domain that shipped mobile apps still depend on.
- Weaken state, nonce, PKCE or redirect checks to get a sign-in to pass.
- Create extra accounts to get around plan limits.

## Report

State what changed, what was tested, what was not tested (especially real Google sign-in), and the manual steps left. Check current prices, limits and CLI flags in official docs.
