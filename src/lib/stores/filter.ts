// Purpose: The reader's explicit feed filter — narrow on demand, and only on demand
// Context: Distinct from taste learning by design. A filter is a hard constraint
//          the reader chose and can see in the header; taste is a soft tilt they
//          never touch. Conflating the two is what made picking a topic feel like
//          punishment: one pick used to collapse the feed to one topic forever.
//
//          Topics here are OR-ed *over time* rather than within a query. GitHub
//          ANDs repeated `topic:` qualifiers, so `topic:rust topic:zig` matches
//          almost nothing; drawing one topic per search gives real OR semantics
//          across a session and costs nothing.

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'gittok:filter';

export interface FeedFilter {
	/** Drawn from one at a time. Empty means "no topic constraint". */
	topics: string[];
	/** A GitHub `language:` value, or null for any. */
	language: string | null;
	/** A `stars:a..b` qualifier, or null to keep the weighted random default. */
	starBand: string | null;
}

/** Offered in the UI. Labels are the reader's words; values are GitHub's. */
export const starBandOptions = [
	{ value: 'stars:50..200', label: 'Undiscovered', hint: '50 – 200 stars' },
	{ value: 'stars:200..1000', label: 'Emerging', hint: '200 – 1k stars' },
	{ value: 'stars:1000..5000', label: 'Established', hint: '1k – 5k stars' },
	{ value: 'stars:5000..20000', label: 'Popular', hint: '5k – 20k stars' },
	{ value: 'stars:20000..100000', label: 'Landmark', hint: '20k+ stars' }
] as const;

export const emptyFilter = (): FeedFilter => ({ topics: [], language: null, starBand: null });

export const isFilterActive = (filter: FeedFilter): boolean =>
	filter.topics.length > 0 || filter.language !== null || filter.starBand !== null;

/** How many constraints are set, for the header badge. */
export const filterCount = (filter: FeedFilter): number =>
	filter.topics.length + (filter.language ? 1 : 0) + (filter.starBand ? 1 : 0);

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/**
 * Topics picked on /setup used to be applied to the feed as a hard constraint —
 * that was the old behaviour, just invisible and unclearable. Carrying them over
 * preserves exactly what those readers already had, and now they can see it in
 * the header and drop it in one tap.
 */
const LEGACY_TOPICS_KEY = 'topics';

const migrateLegacyTopics = (): FeedFilter => {
	try {
		const legacy = localStorage.getItem(LEGACY_TOPICS_KEY);
		if (!legacy) return emptyFilter();

		// One way, and exactly once. Clearing the filter removes its key, so a
		// migration that left the old one behind would read it again on the next
		// load and silently restore topics the reader had just removed.
		localStorage.removeItem(LEGACY_TOPICS_KEY);

		const parsed: unknown = JSON.parse(legacy);
		if (!isStringArray(parsed) || !parsed.length) return emptyFilter();

		const migrated = { ...emptyFilter(), topics: parsed };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
		return migrated;
	} catch {
		return emptyFilter();
	}
};

const load = (): FeedFilter => {
	if (!browser) return emptyFilter();

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return migrateLegacyTopics();

		const parsed: unknown = JSON.parse(stored);
		if (!parsed || typeof parsed !== 'object') return emptyFilter();

		const raw = parsed as Partial<Record<keyof FeedFilter, unknown>>;

		return {
			topics: isStringArray(raw.topics) ? raw.topics : [],
			language: typeof raw.language === 'string' ? raw.language : null,
			starBand: typeof raw.starBand === 'string' ? raw.starBand : null
		};
	} catch {
		// A corrupt filter should cost the reader their narrowing, not the feed.
		return emptyFilter();
	}
};

const save = (filter: FeedFilter) => {
	if (!browser) return;

	try {
		if (isFilterActive(filter)) localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Quota or private mode. The filter still applies for this session.
	}
};

const store = writable<FeedFilter>(load());

/** Every mutation persists — there is no path that changes the filter silently. */
const commit = (next: FeedFilter): FeedFilter => {
	save(next);
	return next;
};

export const filterStore = {
	subscribe: store.subscribe,

	toggleTopic: (topic: string) =>
		store.update((filter) =>
			commit({
				...filter,
				topics: filter.topics.includes(topic)
					? filter.topics.filter((entry) => entry !== topic)
					: [...filter.topics, topic]
			})
		),

	setLanguage: (language: string | null) =>
		store.update((filter) => commit({ ...filter, language })),

	setStarBand: (starBand: string | null) =>
		store.update((filter) => commit({ ...filter, starBand })),

	/** Replaces everything at once — used when applying a whole panel of changes. */
	replace: (filter: FeedFilter) => store.set(commit(filter)),

	clear: () => store.set(commit(emptyFilter()))
};

/** Convenience for chrome that only needs to know whether to shout. */
export const filterIsActive = derived(store, isFilterActive);
