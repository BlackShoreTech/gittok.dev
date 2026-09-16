import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleTokenExchange, type Env } from './index';

const ENV: Env = {
	GH_CLIENT_ID: 'test-client-id',
	GH_CLIENT_SECRET: 'secret-never-leaves-the-worker',
	ALLOWED_ORIGINS: 'https://gittok.dev,http://localhost:5174'
};

const ALLOWED_ORIGIN = 'https://gittok.dev';

const postFrom = (origin: string, body: unknown): Request =>
	new Request('https://auth.gittok.dev/', {
		method: 'POST',
		headers: { Origin: origin, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

const VALID_BODY = { code: 'stub-auth-code', code_verifier: 'v'.repeat(43) } as const;

/** Stubs the single upstream call to GitHub so no test touches the network. */
const stubGitHub = (payload: unknown): void => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
	);
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('handleTokenExchange', () => {
	it('answers preflight from an allowed origin with that exact origin', async () => {
		// Given a browser preflight from the production site
		const request = new Request('https://auth.gittok.dev/', {
			method: 'OPTIONS',
			headers: { Origin: ALLOWED_ORIGIN }
		});

		// When the worker handles it
		const response = await handleTokenExchange(request, ENV);

		// Then it is approved, echoing the origin rather than a wildcard
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
		expect(response.headers.get('Vary')).toBe('Origin');
	});

	it('refuses an origin outside the allowlist without calling GitHub', async () => {
		// Given an exchange attempt from an attacker-controlled page
		stubGitHub({ access_token: 'stub-access-token' });

		// When the worker handles it
		const response = await handleTokenExchange(postFrom('https://evil.example', VALID_BODY), ENV);

		// Then it is rejected outright and the client secret is never spent
		expect(response.status).toBe(403);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects a body that is missing the PKCE verifier', async () => {
		// Given a request carrying a code but no code_verifier
		stubGitHub({ access_token: 'stub-access-token' });

		// When the worker handles it
		const response = await handleTokenExchange(
			postFrom(ALLOWED_ORIGIN, { code: 'stub-auth-code' }),
			ENV
		);

		// Then the boundary parse fails before any upstream call
		expect(response.status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('returns the access token but strips the refresh token', async () => {
		// Given GitHub issuing both an access token and a six-month refresh token
		stubGitHub({
			access_token: 'stub-access-token',
			token_type: 'bearer',
			expires_in: 28800,
			refresh_token: 'stub-refresh-token',
			refresh_token_expires_in: 15811200
		});

		// When the worker completes the exchange
		const response = await handleTokenExchange(postFrom(ALLOWED_ORIGIN, VALID_BODY), ENV);
		const payload: unknown = await response.json();

		// Then only the short-lived token reaches the browser
		expect(response.status).toBe(200);
		expect(payload).toEqual({
			access_token: 'stub-access-token',
			token_type: 'bearer',
			expires_in: 28800
		});
	});

	it('never echoes the client secret back to the caller', async () => {
		// Given a successful exchange
		stubGitHub({ access_token: 'stub-access-token', token_type: 'bearer' });

		// When the worker responds
		const response = await handleTokenExchange(postFrom(ALLOWED_ORIGIN, VALID_BODY), ENV);

		// Then the secret appears nowhere in the response body
		expect(await response.text()).not.toContain(ENV.GH_CLIENT_SECRET);
	});

	it('maps a GitHub error payload to a 4xx instead of a misleading 200', async () => {
		// Given GitHub rejecting a reused code, which it reports with HTTP 200
		stubGitHub({ error: 'bad_verification_code', error_description: 'expired' });

		// When the worker completes the exchange
		const response = await handleTokenExchange(postFrom(ALLOWED_ORIGIN, VALID_BODY), ENV);

		// Then the browser sees a real failure status
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'bad_verification_code' });
	});

	it('derives redirect_uri from the calling origin so local dev can sign in', async () => {
		// Given a sign-in started from the local dev server rather than production
		const sentBodies: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				sentBodies.push(String(init.body));
				return new Response(
					JSON.stringify({ access_token: 'stub-access-token', token_type: 'bearer' }),
					{ status: 200 }
				);
			})
		);

		// When the worker exchanges the code
		await handleTokenExchange(postFrom('http://localhost:5174', VALID_BODY), ENV);

		// Then GitHub is told the localhost callback, matching what was authorized
		const sent: unknown = JSON.parse(sentBodies[0] ?? '{}');
		expect(sent).toMatchObject({
			redirect_uri: 'http://localhost:5174/auth/callback',
			client_secret: ENV.GH_CLIENT_SECRET
		});
	});

	it('rejects a method other than POST', async () => {
		// Given a GET against the token endpoint
		const request = new Request('https://auth.gittok.dev/', {
			method: 'GET',
			headers: { Origin: ALLOWED_ORIGIN }
		});

		// When the worker handles it
		const response = await handleTokenExchange(request, ENV);

		// Then it is refused
		expect(response.status).toBe(405);
	});
});
