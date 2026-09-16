// Purpose: Browser-side GitHub sign-in (PKCE authorization-code flow)
// Context: gittok.dev is static, so it cannot hold a client secret. The code
// exchange happens in the Cloudflare Worker (workers/auth). This module owns
// everything either side of that call: PKCE material, CSRF state, and the
// short-lived token in localStorage.

import { browser } from '$app/environment';
import { get, writable, type Readable } from 'svelte/store';

import { AUTH_WORKER_URL, GITHUB_CLIENT_ID, isAuthConfigured } from './config';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

const TOKEN_KEY = 'gh_session';
const VERIFIER_KEY = 'gh_pkce_verifier';
const STATE_KEY = 'gh_oauth_state';
const RETURN_KEY = 'gh_return_to';

/** Re-auth a minute early so a request cannot start on a token that expires mid-flight. */
const EXPIRY_SKEW_MS = 60_000;

export type Session = {
	readonly accessToken: string;
	/** Epoch ms. GitHub App user tokens live 8 hours. */
	readonly expiresAt: number;
};

export class SignInError extends Error {
	constructor(readonly reason: 'state_mismatch' | 'exchange_failed' | 'missing_verifier') {
		super(reason);
		this.name = 'SignInError';
	}
}

const sessionStore = writable<Session | null>(null);

/** `null` when signed out or expired. */
export const session: Readable<Session | null> = sessionStore;

const base64url = (bytes: Uint8Array): string => {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomToken = (byteLength: number): string =>
	base64url(crypto.getRandomValues(new Uint8Array(byteLength)));

/** S256 is the only method GitHub accepts; `plain` is rejected. */
const challengeFor = async (verifier: string): Promise<string> => {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
};

const isSession = (value: unknown): value is Session =>
	typeof value === 'object' &&
	value !== null &&
	'accessToken' in value &&
	typeof value.accessToken === 'string' &&
	'expiresAt' in value &&
	typeof value.expiresAt === 'number';

const readStoredSession = (): Session | null => {
	const raw = localStorage.getItem(TOKEN_KEY);
	if (raw === null) return null;

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isSession(parsed) || parsed.expiresAt - EXPIRY_SKEW_MS <= Date.now()) {
			localStorage.removeItem(TOKEN_KEY);
			return null;
		}
		return parsed;
	} catch (e) {
		if (e instanceof SyntaxError) {
			localStorage.removeItem(TOKEN_KEY);
			return null;
		}
		throw e;
	}
};

/** Rehydrates the store from localStorage. Safe to call more than once. */
export const restoreSession = (): void => {
	if (!browser) return;
	sessionStore.set(readStoredSession());
};

/**
 * The live token, or `null` when signed out or expired.
 *
 * Only publishes to the store when the token actually changed. Setting it
 * unconditionally makes every read a reactive write, which turns any `$effect`
 * that reads `$session` and calls this into an infinite update loop.
 */
export const getAccessToken = (): string | null => {
	if (!browser) return null;
	const current = readStoredSession();
	if (get(sessionStore)?.accessToken !== current?.accessToken) sessionStore.set(current);
	return current?.accessToken ?? null;
};

/** Forgets the token locally. The GitHub authorization itself is left alone. */
export const signOut = (): void => {
	if (!browser) return;
	localStorage.removeItem(TOKEN_KEY);
	sessionStore.set(null);
};

/**
 * Disconnects the account for real: revokes the authorization on GitHub, then
 * clears local state.
 *
 * `signOut` alone leaves the grant standing, so the next sign-in completes
 * silently with no consent screen and the app quietly regains access. Revoking
 * the grant is also what makes a user pick up changed App permissions, since
 * GitHub only re-prompts for an app that is not already authorized.
 */
export const disconnect = async (): Promise<void> => {
	if (!browser) return;

	const token = readStoredSession()?.accessToken ?? null;

	if (token !== null && isAuthConfigured()) {
		try {
			await fetch(`${AUTH_WORKER_URL}/revoke`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ access_token: token })
			});
		} catch {
			// Best effort: a failed revoke must not strand the user in a session
			// they asked to end, so the local clear below happens regardless.
		}
	}

	signOut();
};

/**
 * Sends the user to GitHub's consent screen. `returnTo` is where the callback
 * sends them back to, so signing in from the feed returns to the feed.
 */
export const beginSignIn = async (returnTo: string): Promise<void> => {
	if (!browser || !isAuthConfigured()) return;

	const verifier = randomToken(64);
	const state = randomToken(16);

	sessionStorage.setItem(VERIFIER_KEY, verifier);
	sessionStorage.setItem(STATE_KEY, state);
	sessionStorage.setItem(RETURN_KEY, returnTo);

	const url = new URL(AUTHORIZE_URL);
	url.searchParams.set('client_id', GITHUB_CLIENT_ID);
	url.searchParams.set('redirect_uri', `${window.location.origin}/auth/callback`);
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', await challengeFor(verifier));
	url.searchParams.set('code_challenge_method', 'S256');
	// No `scope`: a GitHub App's permissions come from its settings, not the URL.

	window.location.assign(url.toString());
};

/**
 * Where to send the user after the callback resolves.
 *
 * Only same-origin paths are honoured. `//evil.example` is a protocol-relative
 * URL that browsers treat as absolute, so rejecting a leading `//` is what stops
 * a tampered sessionStorage entry turning sign-in into an open redirect.
 */
export const consumeReturnTo = (): string => {
	const stored = sessionStorage.getItem(RETURN_KEY);
	sessionStorage.removeItem(RETURN_KEY);

	if (stored === null || !stored.startsWith('/') || stored.startsWith('//')) return '/feed';
	return stored;
};

/**
 * Completes the flow: checks CSRF state, trades the code through the Worker,
 * and stores the resulting token. Throws `SignInError` on every failure path.
 */
export const completeSignIn = async (code: string, state: string): Promise<void> => {
	const expectedState = sessionStorage.getItem(STATE_KEY);
	const verifier = sessionStorage.getItem(VERIFIER_KEY);
	sessionStorage.removeItem(STATE_KEY);
	sessionStorage.removeItem(VERIFIER_KEY);

	// Compared before anything else: a mismatch means this callback was not
	// initiated by this tab, so the code must not be spent.
	if (expectedState === null || state !== expectedState) {
		throw new SignInError('state_mismatch');
	}
	if (verifier === null) throw new SignInError('missing_verifier');

	const response = await fetch(AUTH_WORKER_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, code_verifier: verifier })
	});

	if (!response.ok) throw new SignInError('exchange_failed');

	const payload: unknown = await response.json();
	if (
		typeof payload !== 'object' ||
		payload === null ||
		!('access_token' in payload) ||
		typeof payload.access_token !== 'string'
	) {
		throw new SignInError('exchange_failed');
	}

	const lifetimeSeconds =
		'expires_in' in payload && typeof payload.expires_in === 'number' ? payload.expires_in : 28_800;

	const next: Session = {
		accessToken: payload.access_token,
		expiresAt: Date.now() + lifetimeSeconds * 1000
	};

	localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
	sessionStore.set(next);
};
