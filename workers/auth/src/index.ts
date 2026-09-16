// Purpose: Exchange a GitHub OAuth authorization code for a user access token,
//          and revoke the authorization when the user disconnects.
// Context: gittok.dev is a static SPA, so it cannot hold GH_CLIENT_SECRET. This
// Worker is the only server-side component: it adds the secret to the exchange
// and returns a short-lived token. It stores nothing and has no database.

import { z } from 'zod';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

/** RFC 7636 fixes the verifier at 43-128 characters. */
const TokenExchangeRequest = z.object({
	code: z.string().min(1),
	code_verifier: z.string().min(43).max(128)
});

const RevokeRequest = z.object({
	access_token: z.string().min(1)
});

/** GitHub answers both success and failure with HTTP 200, so the body is the discriminator. */
const GitHubTokenResponse = z.union([
	z.object({
		access_token: z.string().min(1),
		token_type: z.string().min(1),
		expires_in: z.number().optional()
	}),
	z.object({
		error: z.string().min(1),
		error_description: z.string().optional()
	})
]);

export type Env = {
	readonly GH_CLIENT_ID: string;
	readonly GH_CLIENT_SECRET: string;
	/** Comma-separated exact origins permitted to spend the client secret. */
	readonly ALLOWED_ORIGINS: string;
};

/** Must match the SPA route that receives GitHub's redirect. */
const CALLBACK_PATH = '/auth/callback';

const PREFLIGHT_HEADERS = {
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400'
} as const;

type JsonParse = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

const parseJson = (text: string): JsonParse => {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch (e) {
		if (e instanceof SyntaxError) return { ok: false };
		throw e;
	}
};

const allowedOrigin = (request: Request, env: Env): string | null => {
	const origin = request.headers.get('Origin');
	if (origin === null) return null;
	const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
	return allowed.includes(origin) ? origin : null;
};

const corsHeaders = (origin: string | null): Record<string, string> =>
	origin === null ? {} : { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };

const json = (body: unknown, status: number, headers: Record<string, string>): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});

export const handleTokenExchange = async (request: Request, env: Env): Promise<Response> => {
	const origin = allowedOrigin(request, env);
	const cors = corsHeaders(origin);

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: { ...cors, ...PREFLIGHT_HEADERS } });
	}

	if (request.method !== 'POST') {
		return json({ error: 'method_not_allowed' }, 405, cors);
	}

	// A browser would block the response anyway, but refusing here stops the
	// endpoint being used as an open code-exchange oracle by a non-browser client.
	if (origin === null) {
		return json({ error: 'origin_not_allowed' }, 403, {});
	}

	const body = parseJson(await request.text());
	if (!body.ok) return json({ error: 'invalid_json' }, 400, cors);

	const parsed = TokenExchangeRequest.safeParse(body.value);
	if (!parsed.success) return json({ error: 'invalid_request' }, 400, cors);

	// Bare fetch is deliberate: an authorization code is single-use, so retrying
	// a failed exchange would burn a valid code against a already-consumed one.
	const upstream = await fetch(GITHUB_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({
			client_id: env.GH_CLIENT_ID,
			client_secret: env.GH_CLIENT_SECRET,
			code: parsed.data.code,
			code_verifier: parsed.data.code_verifier,
			// Derived from the validated origin, so localhost and production each
			// exchange against the redirect_uri they actually authorized with.
			redirect_uri: `${origin}${CALLBACK_PATH}`
		})
	});

	const upstreamBody = parseJson(await upstream.text());
	if (!upstreamBody.ok) return json({ error: 'upstream_unavailable' }, 502, cors);

	const result = GitHubTokenResponse.safeParse(upstreamBody.value);
	if (!result.success) return json({ error: 'upstream_unavailable' }, 502, cors);

	if ('error' in result.data) {
		return json({ error: result.data.error }, 400, cors);
	}

	// The refresh token is deliberately dropped. It lives for six months, and the
	// browser only needs the 8-hour access token; re-authorising is a silent
	// redirect for an already-authorised app. Nothing long-lived reaches the page.
	return json(
		{
			access_token: result.data.access_token,
			token_type: result.data.token_type,
			expires_in: result.data.expires_in
		},
		200,
		cors
	);
};

/**
 * Revokes the user's authorization grant, not just their token.
 *
 * `DELETE /applications/{client_id}/token` would drop a single token while
 * leaving the grant in place, so GitHub would skip the consent screen on the
 * next sign-in and the app would silently reacquire access. Deleting the GRANT
 * removes the app from the user's authorized-apps page and makes the next
 * sign-in show the permission prompt again — which is also the only way a user
 * picks up changed App permissions.
 *
 * Requires Basic auth with the client secret, so it cannot run in the browser.
 */
export const handleRevoke = async (request: Request, env: Env): Promise<Response> => {
	const origin = allowedOrigin(request, env);
	const cors = corsHeaders(origin);

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: { ...cors, ...PREFLIGHT_HEADERS } });
	}

	if (request.method !== 'POST') {
		return json({ error: 'method_not_allowed' }, 405, cors);
	}

	if (origin === null) {
		return json({ error: 'origin_not_allowed' }, 403, {});
	}

	const body = parseJson(await request.text());
	if (!body.ok) return json({ error: 'invalid_json' }, 400, cors);

	const parsed = RevokeRequest.safeParse(body.value);
	if (!parsed.success) return json({ error: 'invalid_request' }, 400, cors);

	const upstream = await fetch(`${GITHUB_API}/applications/${env.GH_CLIENT_ID}/grant`, {
		method: 'DELETE',
		headers: {
			Authorization: `Basic ${btoa(`${env.GH_CLIENT_ID}:${env.GH_CLIENT_SECRET}`)}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'gittok-auth-worker'
		},
		body: JSON.stringify({ access_token: parsed.data.access_token })
	});

	// 404 means GitHub has no such grant, which is the state the caller wanted.
	if (!upstream.ok && upstream.status !== 404) {
		return json({ error: 'revoke_failed' }, 502, cors);
	}

	return new Response(null, { status: 204, headers: cors });
};

const REVOKE_PATH = '/revoke';

// The token exchange stays on every other path, including the root, because
// already-deployed clients post there with no path segment.
const handleFetch = async (request: Request, env: Env): Promise<Response> =>
	new URL(request.url).pathname === REVOKE_PATH
		? handleRevoke(request, env)
		: handleTokenExchange(request, env);

// Cloudflare Workers require a default export; this is the framework exception
// to the named-exports-only rule.
export default {
	fetch: handleFetch
} satisfies ExportedHandler<Env>;
