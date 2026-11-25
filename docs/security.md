# Security (Path B)

- `state` and a short-lived `HttpOnly` cookie tie Google's reply to the browser that started it.
- PKCE protects the one-time code.
- A fresh `nonce` stops an old ID token from being replayed.
- Supabase verifies the ID token's signature, audience, issuer and expiry.
- Only paths on your own site are accepted as destinations.
- The client secret stays on the server. Tokens are never put in URLs or page content.

Path A relies on Google's button plus the same nonce check in Supabase. It uses no client secret.

The temporary cookies are not signed. On `https` they use the `__Host-` prefix, so other subdomains cannot set them.

## Report a problem

Use **Security** → **Report a vulnerability** on the GitHub repository. Do not post secrets or tokens in an issue.
