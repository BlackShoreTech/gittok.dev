// Purpose: Functions and types for the feed page's GitHub interactions
// Context: Used to fetch and process GitHub repositories for the TikTok-style feed

import { Octokit } from '@octokit/rest';

export interface FeedProject {
	id: string;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	/** 1 when the repository is itself a fork. Not a count — see `forks_count`. */
	fork: number;
	/** Number of forks of this repository. */
	forks_count: number;
	topics: string[];
	created_at: string;
	updated_at: string;
	is_pinned: number;
	owner_id: number;
	fetched_at: string;
	readmeSnippet: string | null;
	/** Set when a README fetch fails, so the card can show a real error state. */
	readmeError?: boolean;
	avatar: string;
	stargazersUrl: string;
	forksUrl: string;
	default_branch: string;
}

export const languageColors = {
	TypeScript: '#3178c6',
	JavaScript: '#f1e05a',
	Python: '#3572A5',
	Java: '#b07219',
	Ruby: '#701516',
	Go: '#00ADD8',
	Rust: '#dea584',
	C: '#555555',
	'C++': '#f34b7d',
	'C#': '#178600',
	PHP: '#4F5D95',
	Swift: '#ffac45',
	Kotlin: '#A97BFF',
	Dart: '#00B4AB',
	Shell: '#89e051',
	HTML: '#e34c26',
	CSS: '#563d7c',
	Vue: '#41b883',
	Svelte: '#ff3e00',
	React: '#61dafb'
} as const;

/**
 * Star bands to sample from, paired with their draw weight. Bounded at the top
 * on purpose: GitHub ranks by popularity, so an open-ended `stars:>1000` filled
 * every draw with the same 100k-star monuments.
 */
export const starBands = [
	['stars:50..200', 2],
	['stars:200..1000', 3],
	['stars:1000..5000', 3],
	['stars:5000..20000', 2],
	['stars:20000..100000', 1]
] as const;

/**
 * Orderings to rotate through. Best match (the empty entry) is GitHub's default
 * and is stable, so on its own it returns identical results for identical
 * queries — which is what made refreshes feel the same.
 */
export const orderings = [
	{},
	{ sort: 'stars', order: 'desc' },
	{ sort: 'stars', order: 'asc' },
	{ sort: 'forks', order: 'desc' },
	{ sort: 'forks', order: 'asc' },
	{ sort: 'updated', order: 'desc' },
	{ sort: 'help-wanted-issues', order: 'desc' }
] as const satisfies readonly { sort?: string; order?: string }[];

/** GitHub refuses to serve past the first 1000 results of any search. */
const MAX_SEARCH_RESULTS = 1000;

const PER_PAGE = 25;

/** How deep to page before a query's real size is known. Overshooting costs one
 * request, which `fetchFeedPage` recovers from. */
const UNKNOWN_QUERY_PAGE_CEILING = 4;

export const languages = [
	'language:typescript',
	'language:javascript',
	'language:python',
	'language:java',
	'language:ruby',
	'language:go',
	'language:rust',
	'language:c',
	'language:cpp',
	'language:csharp',
	'language:php',
	'language:swift',
	'language:kotlin',
	'language:dart',
	'language:shell',
	'language:html',
	'language:css',
	'language:vue',
	'language:svelte',
	'language:react'
] as const;

/** Thrown when a README could not be retrieved, so callers can render an error state. */
export class ReadmeError extends Error {}

export async function fetchReadme(
	author: string,
	repo: string,
	default_branch: string
): Promise<string> {
	const response = await fetch(
		`https://raw.githubusercontent.com/${author}/${repo}/${default_branch}/README.md`
	);

	if (!response.ok) {
		throw new ReadmeError(`README request failed with ${response.status}`);
	}

	const data = await response.text();

	// Only the opening section is shown on a card; the rest lives on GitHub.
	return data.split('\n').slice(0, 60).join('\n');
}

export async function fetchProject(author: string, project: string): Promise<FeedProject> {
	const url = new URL(`https://api.github.com/repos/${author}/${project}`);
	const res = await fetch(url);
	const data = await res.json();

	return {
		id: data.id.toString(),
		name: data.name,
		full_name: data.full_name,
		description: data.description || 'No description provided',
		html_url: data.html_url,
		language: data.language,
		stargazers_count: data.stargazers_count,
		fork: data.fork ? 1 : 0,
		forks_count: data.forks_count ?? 0,
		topics: data.topics ?? [],
		created_at: data.created_at,
		updated_at: data.updated_at,
		is_pinned: 0,
		owner_id: data.owner.id,
		fetched_at: new Date().toISOString(),
		readmeSnippet: null,
		avatar: data.owner.avatar_url,
		stargazersUrl: data.html_url + '/stargazers',
		forksUrl: data.html_url + '/fork',
		default_branch: data.default_branch
	};
}

interface GitHubSearchResponse {
	total_count: number;
	incomplete_results: boolean;
	items: Array<{
		id: number;
		name: string;
		full_name: string;
		description: string | null;
		html_url: string;
		language: string | null;
		stargazers_count: number;
		forks_count: number;
		topics?: string[];
		fork: boolean;
		created_at: string;
		updated_at: string;
		pushed_at: string;
		owner: {
			id: number;
			avatar_url: string;
		};
		default_branch: string;
	}>;
}

export interface SearchResult {
	projects: FeedProject[];
	/** Capped by GitHub at 1000 for paging purposes, however large the real count is. */
	totalCount: number;
}

export async function searchRepositories(octokit: Octokit, query: string): Promise<SearchResult> {
	const url = new URL('https://api.github.com/search/repositories');
	url.search = query;

	const res = await fetch(url);
	const data = (await res.json()) as GitHubSearchResponse;

	// A throttled search answers with a message and no `items`; without this the
	// feed reports "cannot read properties of undefined" instead of the rate limit.
	if (!Array.isArray(data.items)) {
		throw new Error(
			res.status === 403 || res.status === 429
				? 'GitHub search rate limit reached'
				: `GitHub search failed with ${res.status}`
		);
	}

	const projects = data.items.map((item) => ({
		id: item.id.toString(),
		name: item.name,
		full_name: item.full_name,
		description: item.description || 'No description provided',
		html_url: item.html_url,
		language: item.language,
		stargazers_count: item.stargazers_count,
		fork: item.fork ? 1 : 0,
		forks_count: item.forks_count ?? 0,
		topics: item.topics ?? [],
		created_at: item.created_at,
		updated_at: item.pushed_at ?? item.updated_at,
		is_pinned: 0,
		owner_id: item.owner.id,
		fetched_at: new Date().toISOString(),
		readmeSnippet: null,
		avatar: item.owner.avatar_url,
		stargazersUrl: item.html_url + '/stargazers',
		forksUrl: item.html_url + '/fork',
		default_branch: item.default_branch
	}));

	return { projects, totalCount: data.total_count ?? projects.length };
}

export interface QueryMemory {
	current_page: number;
	total_projects: number;
}

export type Random = () => number;

const pick = <T>(values: readonly T[], random: Random): T =>
	values[Math.floor(random() * values.length)];

const pickWeighted = <T>(entries: readonly (readonly [T, number])[], random: Random): T => {
	const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
	let roll = random() * total;

	for (const [value, weight] of entries) {
		roll -= weight;
		if (roll < 0) return value;
	}

	return entries[entries.length - 1][0];
};

const pickPage = (memory: QueryMemory | undefined, random: Random): number => {
	const reachable = memory
		? Math.min(Math.ceil(memory.total_projects / PER_PAGE), MAX_SEARCH_RESULTS / PER_PAGE)
		: UNKNOWN_QUERY_PAGE_CEILING;
	const ceiling = Math.max(1, reachable);
	const page = 1 + Math.floor(random() * ceiling);

	// Step off a page already served this session rather than re-reading it.
	return ceiling > 1 && page === memory?.current_page ? (page % ceiling) + 1 : page;
};

export function shuffle<T>(values: T[], random: Random = Math.random): T[] {
	const result = [...values];

	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}

	return result;
}

export function getRandomSearchQuery(
	topics: string[],
	seenQueries: Record<string, QueryMemory>,
	random: Random = Math.random
): URLSearchParams {
	const topic = pick(topics, random);
	const band = pickWeighted(starBands, random);
	const ordering = pick(orderings, random);

	const q = `${band} topic:${topic}`;
	const searchParams = new URLSearchParams();

	searchParams.set('q', q);
	searchParams.set('per_page', String(PER_PAGE));
	searchParams.set('page', String(pickPage(seenQueries[q], random)));

	if ('sort' in ordering) {
		searchParams.set('sort', ordering.sort);
		searchParams.set('order', ordering.order);
	}

	return searchParams;
}

/**
 * How many times to re-draw before giving up. Pairing a rare topic with a high
 * star band genuinely matches nothing — `topic:astrophysics stars:20000..100000`
 * is empty — and a reader should get a different draw, not an empty feed.
 */
const MAX_DRAWS = 3;

/**
 * Draws randomised searches until one returns something, recording how big each
 * result set turned out to be so later draws against the same query can page
 * deeper instead of re-reading page 1.
 */
export async function fetchFeedPage(
	octokit: Octokit,
	topics: string[],
	seenQueries: Record<string, QueryMemory>,
	random: Random = Math.random
): Promise<FeedProject[]> {
	for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
		const searchParams = getRandomSearchQuery(topics, seenQueries, random);
		const q = searchParams.get('q') ?? '';

		const run = async (): Promise<FeedProject[]> => {
			const result = await searchRepositories(octokit, searchParams.toString());
			seenQueries[q] = {
				current_page: Number(searchParams.get('page')),
				total_projects: result.totalCount
			};
			return result.projects;
		};

		let projects = await run();

		// Page 1 holds whatever exists, so it separates "the draw overshot" from
		// "this combination matches nothing".
		if (!projects.length && searchParams.get('page') !== '1') {
			searchParams.set('page', '1');
			projects = await run();
		}

		if (projects.length) return projects;
	}

	return [];
}
