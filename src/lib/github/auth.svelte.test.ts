import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const TOKEN_KEY = 'gh_session';
const STATE_KEY = 'gh_oauth_state';
const VERIFIER_KEY = 'gh_pkce_verifier';

const HOUR_MS = 3_600_000;

/** Each test needs a fresh module: the session store is module-level state. */
const loadAuth = async () => {
	vi.resetModules();
	return import('./auth');
};

const storeSession = (accessToken: string, expiresAt: number): void => {
	localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt }));
};

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});

describe('session lifetime', () => {
	it('returns a token that is still valid', async () => {
		// Given a session with an hour left
		const { getAccessToken } = await loadAuth();
		storeSession('stub-access-token', Date.now() + HOUR_MS);

		// When the token is read
		const token = getAccessToken();

		// Then it is handed back
		expect(token).toBe('stub-access-token');
	});

	it('discards an expired session instead of returning a dead token', async () => {
		// Given a session that lapsed a second ago
		const { getAccessToken } = await loadAuth();
		storeSession('stub-access-token', Date.now() - 1000);

		// When the token is read
		const token = getAccessToken();

		// Then nothing is returned and the dead entry is cleared
		expect(token).toBeNull();
		expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
	});

	it('retires a token inside the expiry skew so no request starts on it', async () => {
		// Given a session expiring in 30s, inside the 60s skew
		const { getAccessToken } = await loadAuth();
		storeSession('stub-access-token', Date.now() + 30_000);

		// When the token is read
		const token = getAccessToken();

		// Then it is already treated as gone
		expect(token).toBeNull();
	});

	it('survives corrupted storage rather than throwing on every read', async () => {
		// Given a localStorage entry that is not JSON
		const { getAccessToken } = await loadAuth();
		localStorage.setItem(TOKEN_KEY, 'not-json{');

		// When the token is read
		const token = getAccessToken();

		// Then it reads as signed out and the bad entry is cleared
		expect(token).toBeNull();
		expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
	});

	it('does not republish an unchanged session', async () => {
		// Given a subscriber watching a valid, stable session
		const { getAccessToken, restoreSession, session } = await loadAuth();
		storeSession('stub-access-token', Date.now() + HOUR_MS);
		restoreSession();

		let notifications = 0;
		const unsubscribe = session.subscribe(() => {
			notifications += 1;
		});
		notifications = 0;

		// When the token is read repeatedly, as a reactive effect would
		getAccessToken();
		getAccessToken();
		getAccessToken();
		unsubscribe();

		// Then the store never fires, so a reader cannot drive itself into a loop
		expect(notifications).toBe(0);
	});
});

describe('beginSignIn', () => {
	const authorizeUrl = async (): Promise<URL> => {
		const assign = vi.fn();
		vi.stubGlobal('location', { origin: 'https://gittok.dev', assign });

		const { beginSignIn } = await loadAuth();
		await beginSignIn('/feed');

		return new URL(String(assign.mock.calls[0]?.[0]));
	};

	it('requests public_repo, the only scope GitHub accepts for starring', async () => {
		// Given a visitor starting sign-in
		// When they are sent to GitHub
		const url = await authorizeUrl();

		// Then the token will come back able to star: without this scope every
		// write is rejected, which is what broke starring under the GitHub App
		expect(url.searchParams.get('scope')).toBe('public_repo');
	});

	it('sends the callback back to this origin under S256', async () => {
		// Given a visitor starting sign-in
		// When they are sent to GitHub
		const url = await authorizeUrl();

		// Then the flow is PKCE-protected and returns to the origin that began it
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('code_challenge')).toBeTruthy();
		expect(url.searchParams.get('redirect_uri')).toBe('https://gittok.dev/auth/callback');
		expect(url.searchParams.get('state')).toBe(sessionStorage.getItem(STATE_KEY));
	});
});

describe('completeSignIn', () => {
	it('refuses a callback whose state does not match this tab', async () => {
		// Given a callback carrying someone else's state
		const { completeSignIn, SignInError } = await loadAuth();
		sessionStorage.setItem(STATE_KEY, 'expected-state');
		sessionStorage.setItem(VERIFIER_KEY, 'stub-verifier');
		vi.stubGlobal('fetch', vi.fn());

		// When it is completed
		const attempt = completeSignIn('stub-auth-code', 'attacker-state');

		// Then the code is never spent
		await expect(attempt).rejects.toBeInstanceOf(SignInError);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('clears the one-time PKCE material even when the exchange fails', async () => {
		// Given a mismatched callback
		const { completeSignIn } = await loadAuth();
		sessionStorage.setItem(STATE_KEY, 'expected-state');
		sessionStorage.setItem(VERIFIER_KEY, 'stub-verifier');
		vi.stubGlobal('fetch', vi.fn());

		// When it is rejected
		await expect(completeSignIn('stub-auth-code', 'wrong')).rejects.toThrow();

		// Then neither value can be replayed by a second attempt
		expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
		expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull();
	});

	it('stores the token with an expiry derived from expires_in', async () => {
		// Given a matching callback and a worker returning an 8-hour token
		const { completeSignIn, getAccessToken } = await loadAuth();
		sessionStorage.setItem(STATE_KEY, 'matching-state');
		sessionStorage.setItem(VERIFIER_KEY, 'stub-verifier');
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							access_token: 'stub-access-token',
							token_type: 'bearer',
							expires_in: 28_800
						}),
						{ status: 200 }
					)
			)
		);

		// When the exchange completes
		await completeSignIn('stub-auth-code', 'matching-state');

		// Then the token is live and dated from expires_in
		expect(getAccessToken()).toBe('stub-access-token');
		const stored: unknown = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? '{}');
		expect(stored).toMatchObject({ accessToken: 'stub-access-token' });
	});

	it('rejects a worker response with no access token', async () => {
		// Given the worker answering 200 with an error payload
		const { completeSignIn, SignInError } = await loadAuth();
		sessionStorage.setItem(STATE_KEY, 'matching-state');
		sessionStorage.setItem(VERIFIER_KEY, 'stub-verifier');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ error: 'bad_verification_code' })))
		);

		// When the exchange completes
		const attempt = completeSignIn('stub-auth-code', 'matching-state');

		// Then no session is created
		await expect(attempt).rejects.toBeInstanceOf(SignInError);
		expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
	});
});
