// Purpose: Star and unstar repositories as the signed-in user
// Context: api.github.com sends `Access-Control-Allow-Origin: *` and accepts the
// `Authorization` header, so these calls run straight from the browser with no
// proxy. Only minting the token needed a server.

import { getAccessToken, signOut } from './auth';

const STARRED_BASE = 'https://api.github.com/user/starred';

/** Thrown when the token is absent or GitHub rejected it; callers re-run sign-in. */
export class NotAuthenticatedError extends Error {
	constructor() {
		super('not_authenticated');
		this.name = 'NotAuthenticatedError';
	}
}

/**
 * Why a star request failed, so the UI can say something true about it.
 *
 * `forbidden` is the one that matters: it is permanent, not transient. Retrying
 * will never help, so the only useful response is to send the person to GitHub.
 */
export type StarFailureReason = 'forbidden' | 'rate_limited' | 'offline' | 'server' | 'unknown';

const reasonFor = (status: number, rateLimitRemaining: string | null): StarFailureReason => {
	// GitHub reports rate limiting as 403 and distinguishes it only by this
	// header, so the status code alone cannot tell the two apart.
	if (status === 429 || (status === 403 && rateLimitRemaining === '0')) return 'rate_limited';
	if (status === 403) return 'forbidden';
	if (status >= 500) return 'server';
	return 'unknown';
};

/** Thrown for any other failed response, so callers can revert optimistic UI. */
export class StarRequestError extends Error {
	constructor(
		readonly status: number,
		readonly reason: StarFailureReason
	) {
		super(`star_request_failed_${status}`);
		this.name = 'StarRequestError';
	}
}

const request = async (fullName: string, method: 'GET' | 'PUT' | 'DELETE'): Promise<Response> => {
	const token = getAccessToken();
	if (token === null) throw new NotAuthenticatedError();

	let response: Response;
	try {
		response = await fetch(`${STARRED_BASE}/${fullName}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
	} catch {
		// fetch only rejects on a transport failure; every HTTP status resolves.
		throw new StarRequestError(0, 'offline');
	}

	// An expired or revoked token is indistinguishable from signed-out to the
	// user, so clear it and let the caller restart the flow.
	if (response.status === 401) {
		signOut();
		throw new NotAuthenticatedError();
	}

	// 404 is GitHub's documented "not starred" answer to the GET. Everywhere else
	// it is a real failure, and so is every other non-2xx — without this, a 403 or
	// 500 resolves as success and the optimistic UI never reverts.
	if (!response.ok && !(method === 'GET' && response.status === 404)) {
		throw new StarRequestError(
			response.status,
			reasonFor(response.status, response.headers.get('x-ratelimit-remaining'))
		);
	}

	return response;
};

/** GitHub answers 204 when starred and 404 when not. */
export const isStarred = async (fullName: string): Promise<boolean> => {
	const response = await request(fullName, 'GET');
	return response.status === 204;
};

export const star = async (fullName: string): Promise<void> => {
	await request(fullName, 'PUT');
};

export const unstar = async (fullName: string): Promise<void> => {
	await request(fullName, 'DELETE');
};
