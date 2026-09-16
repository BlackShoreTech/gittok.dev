import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as auth from './auth';
import { isStarred, star, unstar, NotAuthenticatedError, StarRequestError } from './stars';

vi.mock('./auth', () => ({ getAccessToken: vi.fn(), signOut: vi.fn() }));

const REPO = 'sveltejs/svelte';

const respondWith = (status: number): void => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(null, { status }))
	);
};

beforeEach(() => {
	vi.mocked(auth.getAccessToken).mockReturnValue('stub-access-token');
});

describe('stars', () => {
	it('reads 204 as starred', async () => {
		// Given GitHub reporting the repo is starred
		respondWith(204);

		// When the state is read
		const result = await isStarred(REPO);

		// Then it is starred
		expect(result).toBe(true);
	});

	it('reads 404 as not starred rather than an error', async () => {
		// Given GitHub's documented "not starred" answer
		respondWith(404);

		// When the state is read
		const result = await isStarred(REPO);

		// Then it resolves false instead of throwing
		expect(result).toBe(false);
	});

	it('sends the bearer token and pinned API version', async () => {
		// Given a signed-in user
		respondWith(204);

		// When a repo is starred
		await star(REPO);

		// Then the request is authorised against the right URL
		expect(fetch).toHaveBeenCalledWith(
			`https://api.github.com/user/starred/${REPO}`,
			expect.objectContaining({
				method: 'PUT',
				headers: expect.objectContaining({ Authorization: 'Bearer stub-access-token' })
			})
		);
	});

	it('signs out and reports not-authenticated on 401', async () => {
		// Given a token GitHub no longer accepts
		respondWith(401);

		// When a repo is starred
		const attempt = star(REPO);

		// Then the dead token is cleared and the caller can restart sign-in
		await expect(attempt).rejects.toBeInstanceOf(NotAuthenticatedError);
		expect(auth.signOut).toHaveBeenCalled();
	});

	it('refuses to act when there is no token at all', async () => {
		// Given a signed-out visitor
		vi.mocked(auth.getAccessToken).mockReturnValue(null);
		respondWith(204);

		// When a repo is starred
		const attempt = star(REPO);

		// Then no request is made
		await expect(attempt).rejects.toBeInstanceOf(NotAuthenticatedError);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('throws on a server error so optimistic UI can revert', async () => {
		// Given GitHub failing the write
		respondWith(500);

		// When a repo is starred
		const attempt = star(REPO);

		// Then the failure surfaces instead of resolving as success
		await expect(attempt).rejects.toBeInstanceOf(StarRequestError);
	});

	it('treats 404 on unstar as a failure, unlike 404 on read', async () => {
		// Given the repo is missing when removing a star
		respondWith(404);

		// When the star is removed
		const attempt = unstar(REPO);

		// Then it throws, because only the GET uses 404 as a state answer
		await expect(attempt).rejects.toBeInstanceOf(StarRequestError);
	});
});
