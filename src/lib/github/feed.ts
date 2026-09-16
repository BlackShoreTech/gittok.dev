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

export const stars = ['stars:>1000', 'stars:500..1000', 'stars:100..500'] as const;

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

export async function searchRepositories(octokit: Octokit, query: string): Promise<FeedProject[]> {
	const url = new URL('https://api.github.com/search/repositories');
	url.search = query;

	const res = await fetch(url);
	const data = (await res.json()) as GitHubSearchResponse;

	return data.items.map((item) => ({
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
}

export function getRandomSearchQuery(
	topics: string[],
	seenQueries: Record<string, { current_page: number; total_projects: number }>,
	attempt: number = 0
): URLSearchParams {
	const searchParams = new URLSearchParams();

	const randomTopic = `topic:${topics[Math.floor(Math.random() * topics.length)]}`;
	const randomStars = stars[Math.floor(Math.random() * stars.length)];

	const q = `${randomStars} ${randomTopic}`;

	searchParams.set('q', q);
	searchParams.set('page', '1');
	searchParams.set('per_page', '25');

	if (seenQueries[q] && attempt < 10000) {
		if (seenQueries[q].current_page < seenQueries[q].total_projects / 25) {
			searchParams.set('page', (seenQueries[q].current_page + 1).toString());
		} else {
			return getRandomSearchQuery(topics, seenQueries, attempt + 1);
		}
	}

	return searchParams;
}
