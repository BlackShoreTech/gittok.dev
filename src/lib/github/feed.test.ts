import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Octokit } from '@octokit/rest';
import {
	fetchFeedPage,
	getRandomSearchQuery,
	orderings,
	searchRepositories,
	shuffle,
	starBands,
	type QueryMemory,
	type Random
} from './feed';

const octokit = {} as Octokit;

/** Feeds `Math.random`'s callers a known script so a draw can be asserted on. */
const sequence = (values: number[]): Random => {
	let index = 0;
	return () => values[index++ % values.length];
};

const item = (id: number) => ({
	id,
	name: `repo-${id}`,
	full_name: `owner/repo-${id}`,
	description: null,
	html_url: `https://github.com/owner/repo-${id}`,
	language: 'Python',
	stargazers_count: 120,
	forks_count: 4,
	fork: false,
	created_at: '2024-01-01T00:00:00Z',
	updated_at: '2024-02-01T00:00:00Z',
	pushed_at: '2024-03-01T00:00:00Z',
	owner: { id: 7, avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4' },
	default_branch: 'main'
});

const searchResponse = (items: ReturnType<typeof item>[], total = items.length, status = 200) => ({
	ok: status < 400,
	status,
	json: async () => ({ total_count: total, incomplete_results: false, items })
});

const draw = (count: number, topics = ['python'], seen: Record<string, QueryMemory> = {}) =>
	Array.from({ length: count }, () => getRandomSearchQuery(topics, seen));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('starBands', () => {
	it('bounds every band at both ends', () => {
		// Given the bands the feed draws from
		// When each qualifier is read
		// Then none is open-ended, because `stars:>1000` matched every giant on
		// GitHub at once and relevance ranking then served the same handful of
		// 100k-star repositories on every draw
		for (const [band] of starBands) {
			expect(band).toMatch(/^stars:\d+\.\.\d+$/);
		}
	});

	it('caps the most popular band at 100k stars', () => {
		// Given the upper bound of every band
		const ceilings = starBands.map(([band]) => Number(band.split('..')[1]));

		// When the highest is read
		// Then it stops at 100k rather than running away to the largest repository
		expect(Math.max(...ceilings)).toBe(100000);
	});
});

describe('getRandomSearchQuery', () => {
	it('never emits an unbounded star qualifier', () => {
		// Given many draws against a single topic, the case a reader filtering by
		// "python" hits
		// When each query is read
		// Then no draw can flood the feed with the most-starred repositories
		for (const params of draw(500)) {
			expect(params.get('q')).toMatch(/^stars:\d+\.\.\d+ topic:python$/);
		}
	});

	it('produces many distinct searches for one topic', () => {
		// Given a reader who has filtered down to a single topic. Before the fix
		// this collapsed to three possible queries, so a refresh replayed one of
		// three identical result sets.
		const seen = new Set(draw(400).map((params) => params.toString()));

		// When the draws are compared
		// Then the query space is wide enough that a repeat is unlikely
		expect(seen.size).toBeGreaterThan(50);
	});

	it('varies the ordering so best match cannot pin the same repos first', () => {
		// Given many draws
		const sorts = new Set(draw(300).map((params) => params.get('sort')));

		// When the sort parameters are compared
		// Then best match (null) is one option among several, rather than the only one
		expect(sorts.size).toBeGreaterThan(1);
		expect(sorts).toContain(null);
	});

	it('pairs every explicit sort with an order', () => {
		// Given draws that selected a sort
		// When each is read
		// Then the direction is always set, so no ordering silently half-applies
		for (const params of draw(300)) {
			if (params.get('sort')) expect(params.get('order')).toBeTruthy();
		}
	});

	it('does not pin every draw to page 1', () => {
		// Given many draws of an unseen query
		const pages = new Set(draw(200).map((params) => params.get('page')));

		// When the pages are compared
		// Then the feed reaches past GitHub's first page of results
		expect(pages.size).toBeGreaterThan(1);
	});

	it('stays inside a small result set once its size is known', () => {
		// Given a query already known to hold 30 results, or two pages
		const seen: Record<string, QueryMemory> = {
			'stars:50..200 topic:python': { current_page: 2, total_projects: 30 }
		};

		// When the same query is drawn with the lowest band selected
		const pages = Array.from({ length: 50 }, () =>
			Number(getRandomSearchQuery(['python'], seen, sequence([0, 0, 0, Math.random()])).get('page'))
		);

		// Then it never asks for a page GitHub cannot fill
		expect(Math.max(...pages)).toBeLessThanOrEqual(2);
		expect(Math.min(...pages)).toBeGreaterThanOrEqual(1);
	});

	it('never pages past the 1000 results GitHub will serve', () => {
		// Given a query with far more matches than GitHub will page through
		const seen: Record<string, QueryMemory> = {
			'stars:50..200 topic:python': { current_page: 1, total_projects: 500_000 }
		};

		// When it is drawn repeatedly
		const pages = Array.from({ length: 200 }, () =>
			Number(getRandomSearchQuery(['python'], seen, sequence([0, 0, 0, Math.random()])).get('page'))
		);

		// Then paging stops at the 1000-result ceiling, and still ranges deeper
		// than the ceiling used for a query of unknown size
		expect(Math.max(...pages)).toBeLessThanOrEqual(1000 / 25);
		expect(Math.max(...pages)).toBeGreaterThan(4);
	});

	it('steps off the page it last served', () => {
		// Given a query whose previous draw read page 1
		const seen: Record<string, QueryMemory> = {
			'stars:50..200 topic:python': { current_page: 1, total_projects: 200 }
		};

		// When a draw would land on page 1 again
		const params = getRandomSearchQuery(['python'], seen, sequence([0, 0, 0, 0]));

		// Then it moves on instead of re-reading what the reader already saw
		expect(params.get('page')).not.toBe('1');
	});
});

describe('searchRepositories', () => {
	it('reports the total so callers can page deeper', async () => {
		// Given a search that matches far more than one page
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => searchResponse([item(1), item(2)], 900))
		);

		// When it is run
		const result = await searchRepositories(octokit, 'q=stars:50..200+topic:python');

		// Then the caller learns how much more there is to read
		expect(result.totalCount).toBe(900);
		expect(result.projects.map((project) => project.id)).toEqual(['1', '2']);
	});

	it('names the rate limit instead of crashing on a missing items array', async () => {
		// Given a throttled response, which carries a message and no items
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: 'rate limit' }) }))
		);

		// When a search is run
		// Then the feed gets an error it can explain, rather than a TypeError
		await expect(searchRepositories(octokit, 'q=x')).rejects.toThrow(/rate limit/i);
	});
});

describe('fetchFeedPage', () => {
	it('records the result size against the query it drew', async () => {
		// Given a search with more results than one page
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => searchResponse([item(1)], 640))
		);
		const seen: Record<string, QueryMemory> = {};

		// When a page is fetched
		await fetchFeedPage(octokit, ['python'], seen, sequence([0, 0, 0, 0]));

		// Then the size is remembered, which is what lets later draws page deeper
		expect(seen['stars:50..200 topic:python']).toEqual({
			current_page: 1,
			total_projects: 640
		});
	});

	it('falls back to page 1 when the draw overshot a narrow query', async () => {
		// Given a query too narrow to fill the page the draw picked
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(searchResponse([], 0))
			.mockResolvedValueOnce(searchResponse([item(1), item(2)], 2));
		vi.stubGlobal('fetch', fetchMock);

		// When a deep page is drawn
		const projects = await fetchFeedPage(octokit, ['python'], {}, sequence([0, 0, 0, 0.99]));

		// Then the reader still gets cards instead of an empty feed
		expect(projects.map((project) => project.id)).toEqual(['1', '2']);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1][0])).toContain('page=1');
	});

	it('re-draws when a band and topic match nothing at all', async () => {
		// Given a first draw that matches nothing, the real case being a rare topic
		// paired with a high star band — `topic:astrophysics stars:20000..100000`
		// rendered an empty feed before this retry existed
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(searchResponse([], 0))
			.mockResolvedValueOnce(searchResponse([item(9)], 1));
		vi.stubGlobal('fetch', fetchMock);

		// When a page is fetched on page 1, so no paging retry applies
		const projects = await fetchFeedPage(octokit, ['python'], {}, sequence([0, 0, 0, 0]));

		// Then a fresh draw fills the feed instead of leaving the reader with nothing
		expect(projects.map((project) => project.id)).toEqual(['9']);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives up after a bounded number of draws', async () => {
		// Given a topic that matches nothing in any band
		const fetchMock = vi.fn().mockResolvedValue(searchResponse([], 0));
		vi.stubGlobal('fetch', fetchMock);

		// When a page is fetched
		const projects = await fetchFeedPage(octokit, ['python'], {}, sequence([0, 0, 0, 0]));

		// Then it stops rather than hammering GitHub's rate limit
		expect(projects).toEqual([]);
		expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
	});
});

describe('shuffle', () => {
	it('keeps every member and leaves the input alone', () => {
		// Given a batch of cards
		const input = [1, 2, 3, 4, 5];

		// When it is shuffled
		const result = shuffle(input);

		// Then nothing is lost or duplicated, and the caller's array is untouched
		expect([...result].sort()).toEqual(input);
		expect(input).toEqual([1, 2, 3, 4, 5]);
	});

	it('reorders a long enough batch', () => {
		// Given a batch too long for an identical shuffle to be plausible
		const input = Array.from({ length: 50 }, (_, index) => index);

		// When it is shuffled
		// Then the opening card is no longer fixed to the search's top hit
		expect(shuffle(input)).not.toEqual(input);
	});
});

describe('orderings', () => {
	it('keeps best match in the rotation', () => {
		// Given the orderings the feed rotates through
		// When they are read
		// Then GitHub's own relevance ranking is still one of the options
		expect(orderings).toContainEqual({});
	});
});
