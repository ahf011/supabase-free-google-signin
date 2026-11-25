# Remove the paid custom domain

Do this only after the new sign-in works live. Removing the domain breaks anything that still uses it, so follow this order.

Replace `api.example.com` with your custom domain and `<project-ref>` with your project ref.

## 1. Find every use

```bash
git grep -n "api.example.com"
```

Also check:

- [ ] Hosting environment variables (all environments)
- [ ] Mobile apps, desktop apps and browser extensions. **If an app already in people's hands has this domain built in, do not remove it** until those users have updated.
- [ ] Every sign-in provider (Google, Apple, GitHub and others) and any SAML setup
- [ ] Webhooks that call your functions (payment providers and similar)
- [ ] Email templates, auth hooks and old links
- [ ] File URLs saved in your database
- [ ] Content Security Policy, allowed image hosts, CORS lists, scheduled jobs and other servers
- [ ] Any backend that checks the token issuer

## 2. Add the default callback everywhere

Add `https://<project-ref>.supabase.co/auth/v1/callback` to each provider. For Apple, edit your **Services ID** and add the domain `<project-ref>.supabase.co` and that return URL.

## 3. Switch to the default address

Change your Supabase URL settings to `https://<project-ref>.supabase.co`, rewrite saved URLs, update webhooks, redeploy and rerun the [test list](setup.md#test-it).

**Everyone may be signed out once.** The session cookie name comes from the first part of the Supabase address. With `api.example.com` it was `sb-api-auth-token`. It becomes `sb-<project-ref>-auth-token`. To keep people signed in, keep the old name everywhere you create a client (replace `api` with the first part of your old address):

```ts
createServerClient(url, key, { cookieOptions: { name: 'sb-api-auth-token' }, cookies })
createBrowserClient(url, key, { cookieOptions: { name: 'sb-api-auth-token' } })
createClient(url, key, { auth: { storageKey: 'sb-api-auth-token' } }) // browser storage apps
```

For Path B also pass `cookieName: 'sb-api-auth-token'` to `createGoogleAuth`.

## 4. Back up

You need Docker running. Do this outside your code folder. These files contain user data, so keep them private and never commit them.

```bash
npx supabase@latest login
```

```bash
npx supabase@latest db dump --remote=<project-ref> --role-only -f roles.sql
```

```bash
npx supabase@latest db dump --remote=<project-ref> -f schema.sql
```

```bash
npx supabase@latest db dump --remote=<project-ref> --data-only --use-copy -f data.sql
```

If asked for a password, use the database password from your project. Database dumps do not contain uploaded files. For each bucket:

```bash
npx supabase@latest storage cp -r ss:///BUCKET_NAME ./storage-backup/BUCKET_NAME --remote=<project-ref>
```

If the CLI says a command is experimental, add `--experimental`. Then check the backup: the files are not empty, `data.sql` includes your users (search it for `users`), and the downloaded file count matches each bucket.

Search the data for the old domain one last time:

```bash
grep -c "api.example.com" data.sql
```

## 5. Remove it

```bash
npx supabase@latest domains delete --remote=<project-ref>
```

Older CLI versions use `--project-ref <project-ref>` instead of `--remote=<project-ref>`.

Then:

1. In the project's **Add-ons** settings, confirm **Custom Domain** is off, so billing stops.
2. Delete the old DNS records for the domain (the `CNAME` and any verification `TXT`). A leftover `CNAME` can be abused.
3. Rerun the [test list](setup.md#test-it) right away.

## If something goes wrong

- Before removal: redeploy your previous version.
- After removal: keep using the default address. Getting the custom domain back means paying for it and setting it up again.

Next (optional): [move to the Free plan](free-plan.md).

[Supabase custom domain docs](https://supabase.com/docs/guides/platform/custom-domains)
