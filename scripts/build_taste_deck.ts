// Purpose: Build the static deck of repositories used by the /setup taste test
// Context: The taste test shows real repositories and learns from which ones the
//          reader keeps. Fetching those live would spend the whole unauthenticated
//          GitHub search budget (10 requests/minute) on first paint, on the one
//          screen where a stall is fatal. So the deck is baked here and served as
//          a static file, the same way featured_repos.json already is.
//
//          Run: bun run build-taste-deck   (GITHUB_TOKEN optional; CI supplies one)

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const OUTPUT_PATH = 'static/data/taste_deck.json';

/** Per-cluster draw. The deck's job is to span the space, not to be big. */
const PER_CLUSTER = 3;

/**
 * Deliberately spread across the whole product surface. The taste test is only
 * informative if consecutive cards can disagree with each other — a deck of
 * twenty JavaScript frameworks teaches nothing.
 *
 * Every query is a single `topic:` qualifier, or several ANDed. GitHub's
 * repository search rejects `OR` between qualifiers outright (422), which is the
 * same constraint that makes the feed draw one topic per search rather than
 * OR-ing a reader's filter into one query.
 */
const CLUSTERS: readonly { id: string; q: string }[] = [
	{ id: 'frontend', q: 'topic:frontend' },
	{ id: 'backend', q: 'topic:api topic:backend' },
	{ id: 'systems', q: 'topic:rust language:rust topic:systems-programming' },
	{ id: 'devops', q: 'topic:kubernetes' },
	{ id: 'machine-learning', q: 'topic:machine-learning' },
	{ id: 'cli', q: 'topic:cli topic:terminal' },
	{ id: 'self-hosted', q: 'topic:self-hosted' },
	{ id: 'security', q: 'topic:security topic:cybersecurity' },
	{ id: 'game-development', q: 'topic:game-development' },
	{ id: 'databases', q: 'topic:database' },
	{ id: 'mobile', q: 'topic:flutter' },
	{ id: 'iot', q: 'topic:arduino' },
	{ id: 'graphics', q: 'topic:graphics' },
	{ id: 'testing', q: 'topic:testing' },
	{ id: 'data-viz', q: 'topic:data-visualization' },
	{ id: 'automation', q: 'topic:automation topic:productivity' },
	{ id: 'learning', q: 'topic:awesome' },
	{ id: 'design', q: 'topic:design-system' },
	{ id: 'blockchain', q: 'topic:blockchain' },
	{ id: 'media', q: 'topic:ffmpeg' }
];

/**
 * Recognisable but not monumental. Below this a card is too obscure to judge in
 * three seconds; above it, everyone has already seen the repository and the
 * answer carries no information.
 */
const STAR_FLOOR = 500;
const STAR_CEILING = 50_000;

/** Unauthenticated search allows 10 requests/minute. Stay under it. */
const UNAUTHENTICATED_DELAY_MS = 7_000;

interface DeckEntry {
	id: string;
	cluster: string;
	name: string;
	full_name: string;
	description: string;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	topics: string[];
	avatar: string;
	default_branch: string;
}

interface SearchItem {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	topics?: string[];
	archived?: boolean;
	fork?: boolean;
	owner: { avatar_url: string };
	default_branch: string;
}

const token = process.env.GITHUB_TOKEN;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function searchCluster(cluster: { id: string; q: string }): Promise<DeckEntry[]> {
	const url = new URL('https://api.github.com/search/repositories');
	url.searchParams.set('q', `${cluster.q} stars:${STAR_FLOOR}..${STAR_CEILING}`);
	url.searchParams.set('sort', 'stars');
	url.searchParams.set('order', 'desc');
	url.searchParams.set('per_page', '30');

	const res = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github+json',
			...(token ? { Authorization: `Bearer ${token}` } : {})
		}
	});

	if (!res.ok) {
		console.warn(`  ${cluster.id}: search failed with ${res.status}, skipping`);
		return [];
	}

	const data = (await res.json()) as { items?: SearchItem[] };
	if (!Array.isArray(data.items)) {
		console.warn(`  ${cluster.id}: no items in response, skipping`);
		return [];
	}

	// A card the reader cannot judge is a wasted round: everything here needs a
	// description to read and topics to attribute the answer to.
	const usable = data.items.filter(
		(item) =>
			!item.archived &&
			!item.fork &&
			typeof item.description === 'string' &&
			item.description.trim().length > 0 &&
			(item.topics?.length ?? 0) > 0
	);

	// Spread the draw across the result page rather than taking the top three,
	// which would return the same household names on every rebuild.
	const step = Math.max(1, Math.floor(usable.length / PER_CLUSTER));

	return usable
		.filter((_, index) => index % step === 0)
		.slice(0, PER_CLUSTER)
		.map((item) => ({
			id: item.id.toString(),
			cluster: cluster.id,
			name: item.name,
			full_name: item.full_name,
			description: item.description ?? '',
			html_url: item.html_url,
			language: item.language,
			stargazers_count: item.stargazers_count,
			topics: item.topics ?? [],
			avatar: item.owner.avatar_url,
			default_branch: item.default_branch
		}));
}

async function main() {
	console.log(
		`Building taste deck from ${CLUSTERS.length} clusters (${token ? 'authenticated' : 'unauthenticated — this will be slow'})...`
	);

	const deck: DeckEntry[] = [];

	for (const [index, cluster] of CLUSTERS.entries()) {
		console.log(`[${index + 1}/${CLUSTERS.length}] ${cluster.id}`);
		deck.push(...(await searchCluster(cluster)));

		if (!token && index < CLUSTERS.length - 1) await sleep(UNAUTHENTICATED_DELAY_MS);
	}

	if (!deck.length) throw new Error('Taste deck came back empty — refusing to write it');

	// De-duplicate: a repository can legitimately match two clusters, but showing
	// it twice in one test makes the product look broken.
	const unique = [...new Map(deck.map((entry) => [entry.id, entry])).values()];

	mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
	writeFileSync(OUTPUT_PATH, JSON.stringify(unique, null, 2));

	console.log(
		`Wrote ${unique.length} repositories across ${new Set(unique.map((e) => e.cluster)).size} clusters to ${OUTPUT_PATH}`
	);
}

main().catch((error) => {
	console.error('Failed to build taste deck:', error);
	process.exit(1);
});
