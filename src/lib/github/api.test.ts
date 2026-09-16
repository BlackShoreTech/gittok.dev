import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Octokit } from '@octokit/rest';
import {
	fetchAllRecentStargazers,
	getLookbackDays,
	isWithinLastDays,
	parseLastPage,
	toStargazerData
} from './api';

const daysAgo = (days: number): string =>
	new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const entry = (login: string, starredAt: string) => ({
	starred_at: starredAt,
	user: {
		id: login.length * 1000 + login.charCodeAt(0),
		login,
		avatar_url: `https://avatars.githubusercontent.com/${login}`,
		html_url: `https://github.com/${login}`,
		type: 'User'
	}
});

const linkHeaderFor = (lastPage: number): string | undefined =>
	lastPage <= 1
		? undefined
		: `<https://api.github.com/repositories/1/stargazers?per_page=100&page=${lastPage}>; rel="next", ` +
			`<https://api.github.com/repositories/1/stargazers?per_page=100&page=${lastPage}>; rel="last"`;

/**
 * Stands in for the real endpoint, reproducing the two behaviours that broke
 * the original implementation: results are always oldest-first, and `sort` /
 * `direction` are ignored entirely.
 */
const stubOctokit = (pages: ReturnType<typeof entry>[][]) => {
	const listStargazersForRepo = vi.fn(async ({ page }: { page: number }) => ({
		data: pages[page - 1] ?? [],
		headers: { link: linkHeaderFor(pages.length) }
	}));

	return {
		octokit: { rest: { activity: { listStargazersForRepo } } } as unknown as Octokit,
		listStargazersForRepo
	};
};

afterEach(() => {
	delete process.env.STAR_LOOKBACK_DAYS;
	vi.useRealTimers();
});

describe('parseLastPage', () => {
	it('returns 1 when the header is absent', () => {
		// Given a single-page result, where GitHub omits the Link header
		// When the last page is read
		// Then paging starts and ends on page 1
		expect(parseLastPage(undefined)).toBe(1);
	});

	it('reads the page number carrying rel="last"', () => {
		// Given a multi-page Link header whose rel="next" precedes rel="last"
		const header =
			'<https://api.github.com/repositories/1/stargazers?per_page=100&page=2>; rel="next", ' +
			'<https://api.github.com/repositories/1/stargazers?per_page=100&page=7>; rel="last"';

		// When the last page is read
		// Then rel="last" wins rather than the first page number in the header
		expect(parseLastPage(header)).toBe(7);
	});

	it('falls back to 1 when no rel="last" is present', () => {
		// Given a header that only advertises rel="prev"
		const header = '<https://api.github.com/repositories/1/stargazers?page=3>; rel="prev"';

		// When the last page is read
		// Then it degrades to a single page instead of returning NaN
		expect(parseLastPage(header)).toBe(1);
	});
});

describe('isWithinLastDays', () => {
	it('rejects an unparseable date instead of treating it as recent', () => {
		// Given a malformed timestamp
		// When the window is checked
		// Then it is excluded, because NaN comparisons would otherwise be false
		expect(isWithinLastDays('not-a-date', 10)).toBe(false);
	});

	it('includes a star inside the window and excludes one outside it', () => {
		// Given stars on either side of a 10 day boundary
		// When each is checked
		// Then only the recent one is inside
		expect(isWithinLastDays(daysAgo(3), 10)).toBe(true);
		expect(isWithinLastDays(daysAgo(30), 10)).toBe(false);
	});
});

describe('getLookbackDays', () => {
	it('defaults to 10 days to absorb GitHub cron drift', () => {
		// Given no override
		// When the lookback is read
		// Then the default window is wider than the daily schedule
		expect(getLookbackDays()).toBe(10);
	});

	it('honours STAR_LOOKBACK_DAYS for backfilling after an outage', () => {
		// Given an operator-supplied backfill window
		process.env.STAR_LOOKBACK_DAYS = '400';

		// When the lookback is read
		// Then the override is used
		expect(getLookbackDays()).toBe(400);
	});

	it('ignores a nonsensical override rather than fetching nothing', () => {
		// Given a malformed override
		process.env.STAR_LOOKBACK_DAYS = 'yesterday';

		// When the lookback is read
		// Then it falls back to the default instead of yielding NaN
		expect(getLookbackDays()).toBe(10);
	});
});

describe('toStargazerData', () => {
	it('drops an entry with no starred_at', () => {
		// Given a response missing the star+json Accept header, so no timestamp
		const withoutTimestamp = { login: 'octocat', id: 1 };

		// When it is normalised
		// Then it is discarded rather than stored with an undefined date
		expect(toStargazerData(withoutTimestamp)).toBeNull();
	});

	it('drops an entry whose user block is unusable', () => {
		// Given a timestamp with no identifiable user
		// When it is normalised
		// Then it is discarded
		expect(toStargazerData({ starred_at: daysAgo(1), user: null })).toBeNull();
	});

	it('normalises a well-formed entry', () => {
		// Given a standard star+json entry
		// When it is normalised
		// Then the fields the database needs are carried across
		const result = toStargazerData(entry('octocat', '2026-09-01T00:00:00Z'));

		expect(result).toMatchObject({
			login: 'octocat',
			html_url: 'https://github.com/octocat',
			type: 'User',
			starred_at: '2026-09-01T00:00:00Z'
		});
	});
});

describe('fetchAllRecentStargazers', () => {
	it('finds recent stars that sit on the last page', async () => {
		// Given the endpoint's real ordering: oldest first, newest on the LAST
		// page. This is the exact shape that made the previous implementation
		// break on page 1's oldest entry and return nothing on every run.
		const { octokit } = stubOctokit([
			[entry('ancient-one', daysAgo(500)), entry('ancient-two', daysAgo(400))],
			[entry('recent-one', daysAgo(3)), entry('recent-two', daysAgo(1))]
		]);

		// When recent stargazers are collected
		const result = await fetchAllRecentStargazers(octokit, 'BlackShoreTech', 'gittok.dev');

		// Then the recent stars are found rather than silently skipped
		expect(result.map((s) => s.login)).toEqual(['recent-two', 'recent-one']);
	});

	it('returns stars newest-first', async () => {
		// Given a page of ascending stars all inside the window
		const { octokit } = stubOctokit([
			[entry('older', daysAgo(5)), entry('middle', daysAgo(3)), entry('newest', daysAgo(1))]
		]);

		// When they are collected
		const result = await fetchAllRecentStargazers(octokit, 'o', 'r');

		// Then the ascending API order is reversed for the caller
		expect(result.map((s) => s.login)).toEqual(['newest', 'middle', 'older']);
	});

	it('stops paging once it walks past the window', async () => {
		// Given three pages where only the last holds recent stars
		const { octokit, listStargazersForRepo } = stubOctokit([
			[entry('p1', daysAgo(900))],
			[entry('p2', daysAgo(800))],
			[entry('p3-old', daysAgo(700)), entry('p3-new', daysAgo(2))]
		]);

		// When they are collected
		const result = await fetchAllRecentStargazers(octokit, 'o', 'r');

		// Then only the recent star is returned
		expect(result.map((s) => s.login)).toEqual(['p3-new']);

		// And page 1 is never re-walked, because the window edge ends the scan
		const pagesRequested = listStargazersForRepo.mock.calls.map(([args]) => args.page);
		expect(pagesRequested).not.toContain(2);
	});

	it('never sends sort or direction, which the endpoint ignores', async () => {
		// Given any request
		const { octokit, listStargazersForRepo } = stubOctokit([[entry('a', daysAgo(1))]]);

		// When stargazers are fetched
		await fetchAllRecentStargazers(octokit, 'o', 'r');

		// Then no ordering parameters are sent, so the code cannot appear to
		// promise a newest-first ordering the API does not honour
		const [args] = listStargazersForRepo.mock.calls[0];
		expect(args).not.toHaveProperty('sort');
		expect(args).not.toHaveProperty('direction');
		expect(args).toMatchObject({ per_page: 100 });
	});

	it('returns nothing when every star predates the window', async () => {
		// Given only stars far outside the lookback
		const { octokit } = stubOctokit([[entry('old', daysAgo(365))]]);

		// When they are collected
		const result = await fetchAllRecentStargazers(octokit, 'o', 'r');

		// Then the result is empty rather than erroring
		expect(result).toEqual([]);
	});

	it('widens the scan when STAR_LOOKBACK_DAYS is set', async () => {
		// Given a star outside the default window but inside a backfill window
		process.env.STAR_LOOKBACK_DAYS = '400';
		const { octokit } = stubOctokit([[entry('backfilled', daysAgo(200))]]);

		// When they are collected
		const result = await fetchAllRecentStargazers(octokit, 'o', 'r');

		// Then the override brings the older star back into range
		expect(result.map((s) => s.login)).toEqual(['backfilled']);
	});
});
