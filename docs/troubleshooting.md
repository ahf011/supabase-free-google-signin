# Troubleshooting

Server errors are logged with the prefix `[google-auth]`. Check logs first. Do not turn off a security check to make an error go away.

| What you see | Cause | Fix |
|---|---|---|
| Google: `redirect_uri_mismatch` | Callback not listed exactly | Compare `APP_ORIGIN` + `/api/auth/google/callback` with the Google list, character by character |
| `auth_error=expired` every time | The cookie did not come back | Use one address (`www` or not) everywhere and match `APP_ORIGIN`. Use `https`. Finish within 10 minutes |
| `503` temporarily unavailable | A setting is missing, or `APP_ORIGIN` is not `https` | Read the server log, fix the setting, redeploy |
| `exchange_failed`, log says `invalid_client` | Wrong or masked secret, or it belongs to another client | Copy the real secret for that exact client ID |
| `exchange_failed`, log says `invalid_grant` | Code reused or redirect mismatch | Start again; check `APP_ORIGIN` |
| `Unacceptable audience in id_token` | Supabase does not list the client ID | Add it under **Client IDs** |
| `Nonces mismatch` or nonce error | Hashed and raw nonce swapped | Google gets the SHA-256 hash, Supabase gets the original |
| Google button window is blank or frozen on `accounts.google.com/gsi/transform` | Security headers, browser or extension blocking the button's window bridge | Set `Cross-Origin-Opener-Policy: same-origin-allow-popups`. If it still happens, use Path B, which does not use that bridge |
| Popup is blocked | Opened after a delay | Call it directly from the click. The code falls back to a full page |
| Popup says complete but the page waits | `status` route missing or blocked | Add the route and let it through middleware. Do not rely on `window.opener` |
| Signed in on the server, signed out in the browser | Browser client keeps sessions in storage | Use `createBrowserClient` from `@supabase/ssr`, or use Path A |
| Everyone signed out after changing the URL | Cookie name changed | See [step 3 of domain removal](remove-custom-domain.md) |
| Images or files broke | Saved URLs use the old domain | Rewrite them to the default address |
| Apple or GitHub sign-in broke | Default callback missing | See [step 2 of domain removal](remove-custom-domain.md) |
| Reset or confirm emails broke | Links built with the old domain | Use your current Supabase URL; ask people to request a new email |
| Google still shows your domain, not your name | Brand not verified or not published | Complete brand verification |
| Works live, fails on previews | Preview callback not listed | Add that exact address or test on a fixed one |
| Downgrade is blocked | Project limit or paid add-on | See [Free plan](free-plan.md) |
| Database is read-only after downgrade | Over the size limit | Free up space following Supabase's guidance, or upgrade |
