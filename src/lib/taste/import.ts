// Purpose: Seed a taste profile from the repositories the reader already starred
// Context: The strongest onboarding available. A reader cannot reliably name the
//          topics they like, but their GitHub stars are years of that exact
//          judgement already recorded. One tap beats any picker.
//
//          Runs entirely in the browser against api.github.com, the same way
//          stars.ts does — only minting the token ever needed a server.

import { getAccessToken } from '$lib/github/auth';
import { NotAuthenticatedError } from '$lib/github/stars';
import { applySignal } from './attribution';
import { observeRepos } from './profile';
import type { TasteProfile } from './types';

const STARRED_URL = 'https://api.github.com/user/starred';

/** Two pages is plenty of signal and keeps the import to a couple of seconds. */
const PER_PAGE = 100;
const MAX_PAGES = 2;

interface StarredRepo {
	topics?: string[];
	language: string | null;
}

export interface ImportResult {
	profile: TasteProfile;
	/** How many starred repositories actually contributed. */
	imported: number;
	/** Strongest topics learned, for showing the reader what was understood. */
	topTopics: string[];
}

const fetchPage = async (token: string, page: number): Promise<StarredRepo[]> => {
	const url = new URL(STARRED_URL);
	url.searchParams.set('per_page', String(PER_PAGE));
	url.searchParams.set('page', String(page));

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});

	if (response.status === 401) throw new NotAuthenticatedError();
	if (!response.ok) throw new Error(`Could not read your stars (${response.status})`);

	const data: unknown = await response.json();
	return Array.isArray(data) ? (data as StarredRepo[]) : [];
};

/**
 * Applies every starred repository as a `star` signal. Because attribution is
 * rarity-weighted and confidence-scaled, a hundred stars produces a profile with
 * real conviction while a handful produces only a gentle lean — which is exactly
 * proportionate to how much the reader has actually told us.
 */
export async function importFromStars(profile: TasteProfile): Promise<ImportResult> {
	const token = getAccessToken();
	if (token === null) throw new NotAuthenticatedError();

	const starred: StarredRepo[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const batch = await fetchPage(token, page);
		starred.push(...batch);
		if (batch.length < PER_PAGE) break;
	}

	const usable = starred.filter((repo) => (repo.topics?.length ?? 0) > 0 || repo.language);

	// Observe first: the reader's own stars are the only corpus available before
	// they have scrolled anything, so rarity has something to calibrate against.
	let next = observeRepos(
		profile,
		usable.map((repo) => ({ topics: repo.topics ?? [] }))
	);

	for (const repo of usable) {
		next = applySignal(next, {
			kind: 'star',
			topics: repo.topics ?? [],
			language: repo.language
		});
	}

	const topTopics = Object.entries(next.topics)
		.sort(([, a], [, b]) => b.score - a.score)
		.slice(0, 5)
		.map(([topic]) => topic);

	return { profile: next, imported: usable.length, topTopics };
}
