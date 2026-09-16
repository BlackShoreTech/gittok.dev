// Purpose: Remember which repositories a reader has already been shown
// Context: The feed is assembled from random GitHub searches, so nothing stops
//          two draws from overlapping. Without a memory that survives a reload,
//          a refresh can open on the same card the reader just scrolled past.

import { browser } from '$app/environment';

const STORAGE_KEY = 'gittok:seen-repos';

/** Roughly a long session's worth of cards. Small enough that the filter can
 * never starve a feed drawn from millions of repositories. */
const LIMIT = 400;

/** Below this, a batch is too thin to be worth de-duplicating — a repeat reads
 * better than a blank screen. */
const MIN_USABLE_BATCH = 5;

export function loadSeenRepoIds(): Set<string> {
	if (!browser) return new Set();

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return new Set();

		const parsed: unknown = JSON.parse(stored);
		return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
	} catch {
		return new Set();
	}
}

export function rememberRepoIds(seen: Set<string>, ids: Iterable<string>): void {
	for (const id of ids) {
		// Re-inserting moves an id to the end, so the trim below drops the
		// genuinely oldest entries rather than the least recently shown.
		seen.delete(id);
		seen.add(id);
	}

	while (seen.size > LIMIT) {
		const oldest = seen.values().next();
		if (oldest.done) break;
		seen.delete(oldest.value);
	}

	if (!browser) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
	} catch {
		// A full or blocked quota costs variety, not the feed. Nothing to do.
	}
}

export function dropSeen<T extends { id: string }>(projects: T[], seen: Set<string>): T[] {
	const unseen = projects.filter((project) => !seen.has(project.id));
	return unseen.length >= MIN_USABLE_BATCH ? unseen : projects;
}
