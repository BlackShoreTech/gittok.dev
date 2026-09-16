# Auth Worker — account setup

One-time manual setup for the GitHub sign-in flow. Everything here is free.

The Worker in `workers/auth/` exists for one reason: a static site cannot hold
`GH_CLIENT_SECRET`, and GitHub's token endpoint requires it. The Worker adds the
secret to the exchange and returns a short-lived token. It stores nothing.

---

## 1. Cloudflare account

1. Sign up at <https://dash.cloudflare.com/sign-up>. **No credit card** is needed
   for the Workers free plan (100,000 requests/day — this fires once per sign-in).
2. In the dashboard sidebar open **Compute (Workers)** and, if prompted, pick a
   `workers.dev` subdomain. The Worker will be reachable at
   `https://gittok-auth.<your-subdomain>.workers.dev`.

`gittok.dev` DNS currently sits at GoDaddy pointing to GitHub Pages. **Leave it
alone** — the `workers.dev` hostname is a different origin, which is fine because
the Worker sets explicit CORS headers. No DNS changes, no domain transfer.

### Get your Account ID

**Compute (Workers)** → right-hand sidebar → **Account ID** → copy.

### Create a deploy API token

**My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template.**

Scope it down before saving:

| Field             | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Account Resources | Include → your account only                           |
| Zone Resources    | All zones (unused, but the template requires a value) |
| TTL               | leave default                                         |

Copy the token — it is shown **once**.

---

## 2. GitHub App

Create at **Settings → Developer settings → GitHub Apps → New GitHub App**.
A GitHub App, not an OAuth App: it can request `Starring` alone, whereas an OAuth
App would have to ask for `public_repo`, which reads on the consent screen as
write access to every public repo the user owns.

| Field                                                  | Value                                 |
| ------------------------------------------------------ | ------------------------------------- |
| GitHub App name                                        | `GitTok`                              |
| Homepage URL                                           | `https://gittok.dev`                  |
| Callback URL                                           | `https://gittok.dev/auth/callback`    |
| Callback URL (2nd)                                     | `http://localhost:5174/auth/callback` |
| Expire user authorization tokens                       | **Enabled** (8-hour tokens)           |
| Request user authorization (OAuth) during installation | Enabled                               |
| Webhook → Active                                       | **Un**checked                         |

**Permissions → Account permissions → Starring: Read and write.** Nothing else.
Leave every repository permission at "No access"; `Metadata: read` is implied and
does not add a repository picker.

**Where can this GitHub App be installed? → Any account.**

After creating it:

- copy the **Client ID** (`Iv1....`) — public, goes in `wrangler.jsonc`
- **Generate a new client secret** and copy it — shown once

> Users authorize this app; they do **not** install it. GitHub's docs: _"An app
> does not need to be installed in order for a user to authorize the app."_ So the
> consent screen shows the `Starring` permission and no repository picker.

---

## 3. Wire up the secrets

### In `workers/auth/wrangler.jsonc`

Replace the placeholder — this value is public, commit it:

```jsonc
"GH_CLIENT_ID": "Iv1.your_real_client_id"
```

### In the GitHub repo

**Settings → Secrets and variables → Actions → New repository secret**, three times:

| Secret name             | Value                                    |
| ----------------------- | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | the API token from step 1                |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 1               |
| `GH_CLIENT_SECRET`      | the GitHub App client secret from step 2 |

`.github/workflows/deploy-worker.yml` pushes `GH_CLIENT_SECRET` to the Worker on
every deploy, so GitHub Secrets stays the single source of truth. It never
appears in the repo, the bundle, or the Worker config.

---

## 4. Deploy

Push any change under `workers/auth/` to `main`, or run the workflow manually
from the Actions tab. The workflow typechecks, tests, then deploys.

First deploy from your laptop instead:

```bash
cd workers/auth
bun install
bunx wrangler login
bunx wrangler secret put GH_CLIENT_SECRET   # paste when prompted
bunx wrangler deploy
```

Confirm it is reachable — an unknown origin must be refused:

```bash
curl -i -X POST https://gittok-auth.<subdomain>.workers.dev \
  -H "Origin: https://evil.example" -H "Content-Type: application/json" \
  -d '{"code":"x","code_verifier":"'"$(printf 'v%.0s' {1..43})"'"}'
# expect: HTTP/2 403  {"error":"origin_not_allowed"}
```

---

## 5. Local development

```bash
cd workers/auth
bun run dev        # http://localhost:8787
```

`wrangler dev` reads `vars` from `wrangler.jsonc`. For the secret, create
`workers/auth/.dev.vars` (git-ignored):

```
GH_CLIENT_SECRET=your_dev_client_secret
```

`http://localhost:5174` is already in `ALLOWED_ORIGINS`, matching the Vite dev port.

---

## What the SPA still needs

Not built yet — this doc covers infrastructure only.

1. A sign-in button that generates a PKCE `code_verifier` + `state`, stores both
   in `sessionStorage`, and redirects to
   `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=…&state=…&code_challenge=…&code_challenge_method=S256`.
   Send **no** `scope` parameter — a GitHub App's permissions come from its settings.
2. A `/auth/callback` route that verifies `state`, POSTs `{code, code_verifier}`
   to the Worker, and keeps the returned `access_token` for its 8-hour life.
3. Star/unstar via `PUT`/`DELETE https://api.github.com/user/starred/{owner}/{repo}`
   with `Authorization: Bearer <token>`. On `401`, restart the flow — GitHub
   redirects straight back without a second consent prompt.

The Worker deliberately drops GitHub's `refresh_token` (6-month lifetime) so
nothing long-lived ever reaches the browser.

### Before shipping the token to the browser

Two prerequisites from the security review still stand:

- **PostHog will capture the token** if it lands in a plain input or a session
  replay. Session replay is enabled on this project. Any token-bearing input needs
  `type="password"` and the `ph-no-capture` class.
- **There is still no CSP.** The feed renders arbitrary third-party README HTML,
  so a `connect-src` allowlist is what stops a sanitizer bypass from exfiltrating
  a token. GitHub Pages cannot set response headers, so this has to be a
  `<meta http-equiv="Content-Security-Policy">` tag until/unless hosting moves.
