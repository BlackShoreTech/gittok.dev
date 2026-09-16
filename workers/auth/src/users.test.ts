import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordSignIn, type SignInRegistry } from './users';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const TOKEN = 'stub-access-token';

type Write = { readonly query: string; readonly values: readonly unknown[] };

/** Captures what would have been written, without standing up a database. */
const registry = (): { env: SignInRegistry; writes: Write[] } => {
	const writes: Write[] = [];
	const DB: SignInRegistry['DB'] = {
		prepare: (query) => ({
			bind: (...values) => ({
				run: async () => {
					writes.push({ query, values });
					return {};
				}
			})
		})
	};
	return { env: { DB }, writes };
};

const brokenRegistry = (): SignInRegistry => ({
	DB: {
		prepare: () => ({
			bind: () => ({
				run: () => Promise.reject(new Error('D1_ERROR: no such table: users'))
			})
		})
	}
});

const stubGitHubUser = (payload: unknown, status = 200): void => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status })));
};

const OCTOCAT = { id: 583231, login: 'octocat', email: 'octocat@github.com' } as const;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('recordSignIn', () => {
	it('identifies the user with the token that was just issued', async () => {
		// Given GitHub ready to answer who the token belongs to
		stubGitHubUser(OCTOCAT);
		const { env } = registry();

		// When the sign-in is recorded
		await recordSignIn(env, TOKEN, NOW);

		// Then the bearer is the user's own token, which is the only credential
		// that can resolve /user to a specific account
		const call = vi.mocked(fetch).mock.calls.at(0);
		expect(call?.[0]).toBe('https://api.github.com/user');
		expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
	});

	it('writes one row with both timestamps from a single clock reading', async () => {
		// Given a first-time signer
		stubGitHubUser(OCTOCAT);
		const { env, writes } = registry();

		// When the sign-in is recorded
		await recordSignIn(env, TOKEN, NOW);

		// Then one bound timestamp serves first_seen_at and last_seen_at, so a new
		// row cannot claim to have been seen last before it was seen first
		expect(writes).toHaveLength(1);
		expect(writes[0]?.values).toEqual([583231, 'octocat', 'octocat@github.com', NOW.toISOString()]);
	});

	it('upserts rather than inserting, so a return sign-in is not a duplicate', async () => {
		// Given any recorded sign-in
		stubGitHubUser(OCTOCAT);
		const { env, writes } = registry();

		// When the statement is prepared
		await recordSignIn(env, TOKEN, NOW);

		// Then the conflict clause counts the visit and preserves a known email,
		// because the public profile address is usually absent and overwriting a
		// stored one with null would lose the hardest field to obtain
		const query = writes[0]?.query ?? '';
		expect(query).toContain('ON CONFLICT (github_id) DO UPDATE');
		expect(query).toContain('sign_in_count = sign_in_count + 1');
		expect(query).toContain('email = COALESCE(excluded.email, users.email)');
	});

	it('stores null when the account publishes no email', async () => {
		// Given an account with no public profile email, which GitHub omits
		stubGitHubUser({ id: 1, login: 'ghost' });
		const { env, writes } = registry();

		// When the sign-in is recorded
		await recordSignIn(env, TOKEN, NOW);

		// Then the user is still recorded, with the email left empty
		expect(writes[0]?.values).toEqual([1, 'ghost', null, NOW.toISOString()]);
	});

	it('records the user even when the email is not a usable string', async () => {
		// Given a surprising value where an email should be
		stubGitHubUser({ id: 1, login: 'ghost', email: 42 });
		const { env, writes } = registry();

		// When the sign-in is recorded
		await recordSignIn(env, TOKEN, NOW);

		// Then the optional field degrades to null instead of discarding the row
		expect(writes[0]?.values).toEqual([1, 'ghost', null, NOW.toISOString()]);
	});

	it('does not reject when the database write fails', async () => {
		// Given D1 rejecting every write, e.g. migrations never applied
		stubGitHubUser(OCTOCAT);

		// When the sign-in is recorded
		const settled = recordSignIn(brokenRegistry(), TOKEN, NOW);

		// Then it resolves quietly: this runs in waitUntil after the browser has
		// already been given its token, so a failed write must not surface
		await expect(settled).resolves.toBeUndefined();
	});

	it('does not reject or write when GitHub refuses the token', async () => {
		// Given GitHub rejecting the token
		stubGitHubUser({ message: 'Bad credentials' }, 401);
		const { env, writes } = registry();

		// When the sign-in is recorded
		await expect(recordSignIn(env, TOKEN, NOW)).resolves.toBeUndefined();

		// Then nothing is invented in the database
		expect(writes).toEqual([]);
	});

	it('does not write when the payload is not a user', async () => {
		// Given a response that parses as JSON but is not an account
		stubGitHubUser({ access_token: 'wrong-endpoint' });
		const { env, writes } = registry();

		// When the sign-in is recorded
		await expect(recordSignIn(env, TOKEN, NOW)).resolves.toBeUndefined();

		// Then no row is written from a shape we do not recognise
		expect(writes).toEqual([]);
	});

	it('does not reject when GitHub is unreachable', async () => {
		// Given the network failing outright
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(new TypeError('network error')))
		);

		// When the sign-in is recorded
		await expect(recordSignIn(brokenRegistry(), TOKEN, NOW)).resolves.toBeUndefined();
	});

	it('never writes the access token to the log', async () => {
		// Given every stage failing, so all three log sites are reachable
		const logged: unknown[] = [];
		vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			logged.push(...args);
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(new Error(`failed to POST ${TOKEN}`)))
		);

		// When the sign-in is recorded
		await recordSignIn(brokenRegistry(), TOKEN, NOW);

		// Then the token never reaches observability, even though the thrown error
		// carried it — Workers Logs is readable by anyone with dashboard access
		expect(logged.length).toBeGreaterThan(0);
		expect(JSON.stringify(logged)).not.toContain(TOKEN);
	});
});
