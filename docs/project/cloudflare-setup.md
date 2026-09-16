# Auth Worker — account setup

One-time manual setup for the GitHub sign-in flow. Everything here is free.

The Worker in `workers/auth/` exists for one reason: a static site cannot hold
`GH_CLIENT_SECRET`, and GitHub's token endpoint requires it. The Worker adds the
secret to the exchange and returns a short-lived token.

It keeps no token of its own. The one thing it persists is a row per signed-in
account in D1 — see [Sign-in database](#create-the-sign-in-database) below.

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

### Create the sign-in database

Already created, and committed to `wrangler.jsonc` as the `DB` binding:

```bash
bunx wrangler d1 create gittok                    # -> database_id
bunx wrangler d1 migrations apply gittok --remote  # creates the users table
```

`database_id` is an account-scoped identifier, not a credential — inert without
the API token — so it is committed alongside `GH_CLIENT_ID`.

Free plan: 5 GB, 5M rows read/day, 100k rows written/day. One sign-in writes one
row, so the write ceiling is ~100k sign-ins/day.

Reading it back:

```bash
bunx wrangler d1 execute gittok --remote \
  --command "SELECT COUNT(*) AS users FROM users;"

bunx wrangler d1 execute gittok --remote \
  --command "SELECT date(first_seen_at) AS day, COUNT(*) AS signups
             FROM users GROUP BY day ORDER BY day DESC LIMIT 30;"
```

`users.email` is GitHub's **public profile** email and is therefore `NULL` for
most accounts. The verified primary address needs `user:email` added to the
scope in `src/lib/github/auth.ts` and a `GET /user/emails` call — which widens
the consent screen and makes every already-authorized user re-consent.

> **Operational trap.** `recordSignIn` swallows its own failures by design, so an
> unapplied migration loses signups **silently**: sign-in keeps working and the
> only symptom is a `sign_in_record_failed` line in Workers Logs. Apply every
> future migration with `--remote` at deploy time. CI deliberately does not do it
> for you — auto-migrating on each push is how one bad migration takes the table
> with it.

---

## 2. OAuth App

Create at **Settings → Developer settings → OAuth Apps → New OAuth App**.

| Field                      | Value                              |
| -------------------------- | ---------------------------------- |
| Application name           | `GitTok`                           |
| Homepage URL               | `https://gittok.dev`               |
| Authorization callback URL | `https://gittok.dev/auth/callback` |

GitHub allows one callback URL per OAuth App, so local development needs a second
App of its own pointed at `http://localhost:5174/auth/callback`.

After creating it:

- copy the **Client ID** (`Ov23....`) — public, goes in `wrangler.jsonc` **and**
  `src/lib/github/config.ts`. The two must match or the exchange fails.
- **Generate a new client secret** and copy it — shown once

### Why not a GitHub App

A GitHub App can request the narrow `Starring` permission instead of the blunt
`public_repo` scope, and GitTok was built that way first. It cannot work.
Starring also requires the `Metadata` **repository** permission, and a GitHub
App's user access token reaches only repositories the app is installed on —
GitHub's own wording is _"a user access token can only access resources that both
the user and app can access."_ GitTok is authorized, never installed, so
`PUT /user/starred/{owner}/{repo}` against a repo from the feed always returned
`403 Resource not accessible by integration`.

`public_repo` is the only thing GitHub accepts here: _"Also required for starring
public repositories."_ The consent screen is blunter as a result. That is the
price of the feature, not an oversight — see the comment in `auth.ts`.

---

## 3. Wire up the secrets

### In `workers/auth/wrangler.jsonc`

Replace the placeholder — this value is public, commit it:

```jsonc
"GH_CLIENT_ID": "Ov23your_real_client_id"
```

### In the GitHub repo

**Settings → Secrets and variables → Actions → New repository secret**, three times:

| Secret name             | Value                                   |
| ----------------------- | --------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | the API token from step 1               |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 1              |
| `GH_CLIENT_SECRET`      | the OAuth App client secret from step 2 |

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

Then confirm `GH_CLIENT_ID` and `GH_CLIENT_SECRET` are from the **same** App. The
ID is committed and the secret is uploaded separately, so changing one without
the other is the easy mistake — and it is invisible until a user tries to sign
in. Spending a deliberately invalid code makes GitHub answer with which of the
two it disliked:

```bash
curl -X POST https://gittok-auth.<subdomain>.workers.dev \
  -H "Origin: https://gittok.dev" -H "Content-Type: application/json" \
  -d '{"code":"fake-code","code_verifier":"'"$(printf 'v%.0s' {1..64})"'"}'
# {"error":"bad_verification_code"}       → the pair matches; only the fake code was rejected
# {"error":"incorrect_client_credentials"} → mismatched pair, sign-in is broken
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

## How the SPA side fits together

| File                                    | Owns                                                             |
| --------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/github/config.ts`              | Client ID + Worker URL. Sign-in hides itself if either is unset. |
| `src/lib/github/auth.ts`                | PKCE material, CSRF `state`, the session in `localStorage`.      |
| `src/routes/auth/callback/+page.svelte` | Verifies `state`, calls the Worker, returns to the feed.         |
| `src/lib/github/stars.ts`               | `isStarred` / `star` / `unstar` against `api.github.com`.        |

Flow: sign-in generates a `code_verifier` + `state` into `sessionStorage` and
redirects to GitHub with `code_challenge_method=S256` and `scope=public_repo`. The
callback verifies `state`, POSTs `{code, code_verifier}` to the Worker, and stores
the token.

The App does not opt into expiring tokens, so GitHub returns no `expires_in` and
the token would otherwise be permanent. `auth.ts` caps it at 8 hours locally, so
nothing long-lived sits in `localStorage`; any `refresh_token` GitHub does send is
dropped by the Worker. When a star call returns `401`, `stars.ts` clears the
session and the UI restarts sign-in — GitHub redirects straight back without a
second consent prompt.

Starred state is resolved lazily, only for the card currently in view. Probing
every rendered card would be one API request per card.

### Security prerequisites — both now done

- **PostHog no longer sees the auth code.** Session replay is enabled on this
  project, and the callback URL carries `?code=`. `src/routes/+layout.ts` installs
  a `sanitize_properties` hook that strips `code`/`state` from URL properties, and
  the callback also `replaceState`s them out of the address bar immediately.
  Nothing in this flow uses a token input, so `ph-no-capture` is not needed.
- **A CSP now ships.** Configured in `svelte.config.js` (`kit.csp`, hash mode), so
  SvelteKit hashes its own inline scripts and emits a `<meta>` tag — GitHub Pages
  cannot set real headers. `connect-src` is the load-bearing directive: it is what
  stops a DOMPurify bypass from exfiltrating the token. The GA snippet was moved
  out of `app.html` into `static/analytics.js` so `script-src` can stay on `'self'`.

> `upgrade-insecure-requests` is enabled so README badges linked over plain http
> still render. It also upgrades same-origin requests, so a plain-http preview
> (`DISABLE_HTTPS=1`) will not load. Dev and production are both https.
