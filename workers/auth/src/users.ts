// Purpose: Record a GitHub account in D1 the first time it signs in, and track
//          return sign-ins after that.
// Context: The token exchange never learned who it was authenticating — it
// handed back a token and forgot. This module is the one place that asks GitHub
// "who was that?" and writes the answer down. It is deliberately best-effort:
// the sign-in has already succeeded by the time this runs, so nothing in here
// may turn a working sign-in into a failed one.

import { z } from 'zod';

const GITHUB_API = 'https://api.github.com';

/** Only the fields worth storing. GitHub sends ~30 more. */
const GitHubUser = z.object({
	id: z.number().int().positive(),
	login: z.string().min(1),
	// Lenient on purpose. This is the public profile email, so it is usually
	// null, and a surprising value here must not discard the whole record —
	// losing the user row to salvage one optional field is the wrong trade.
	email: z.string().nullish().catch(null)
});

/**
 * The fragment of D1 this module actually uses.
 *
 * A real `D1Database` satisfies it structurally, so the Worker passes `env`
 * unchanged — but a test can supply a three-method stub instead of casting a
 * fake through the full runtime interface.
 */
export type SignInRegistry = {
	readonly DB: {
		prepare(query: string): {
			bind(...values: readonly (string | number | null)[]): {
				run(): Promise<unknown>;
			};
		};
	};
};

// `?4` is bound once and used for both timestamps, so a new row's
// first_seen_at and last_seen_at come from a single clock reading.
//
// On return sign-ins `login` is refreshed, because GitHub account renames leave
// the numeric id untouched and the stored label stale. `email` instead uses
// COALESCE: it is usually null, and overwriting a known address with null every
// time someone signs in would discard the one field we struggle to obtain.
const UPSERT_USER = `
INSERT INTO users (github_id, login, email, first_seen_at, last_seen_at)
VALUES (?1, ?2, ?3, ?4, ?4)
ON CONFLICT (github_id) DO UPDATE SET
  login = excluded.login,
  email = COALESCE(excluded.email, users.email),
  last_seen_at = excluded.last_seen_at,
  sign_in_count = sign_in_count + 1
`;

/**
 * Identifies the freshly signed-in user and records them.
 *
 * Never rejects. Callers pass this to `ctx.waitUntil`, where a rejection would
 * be logged as a Worker error against a request the browser already considers
 * successful — and, worse, invite a future caller to `await` it and couple the
 * sign-in's fate to a bookkeeping write.
 */
export const recordSignIn = async (
	env: SignInRegistry,
	accessToken: string,
	now: Date
): Promise<void> => {
	try {
		const response = await fetch(`${GITHUB_API}/user`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				'User-Agent': 'gittok-auth-worker'
			}
		});

		if (!response.ok) {
			console.error('sign_in_record_failed', { stage: 'identify', status: response.status });
			return;
		}

		const user = GitHubUser.safeParse(await response.json());
		if (!user.success) {
			console.error('sign_in_record_failed', { stage: 'parse' });
			return;
		}

		await env.DB.prepare(UPSERT_USER)
			.bind(user.data.id, user.data.login, user.data.email ?? null, now.toISOString())
			.run();
	} catch (e) {
		// The token is in scope here, so the error itself is never logged — a
		// fetch failure can carry the request in its message.
		console.error('sign_in_record_failed', {
			stage: 'write',
			reason: e instanceof Error ? e.name : 'unknown'
		});
	}
};
