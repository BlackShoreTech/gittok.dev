import { beforeEach, describe, expect, it } from 'vitest';

import { dropSeen, loadSeenRepoIds, rememberRepoIds } from './seen';

const STORAGE_KEY = 'gittok:seen-repos';

/** The cap `seen.ts` trims to. Duplicated so a change to it fails loudly here. */
const LIMIT = 400;

const repos = (...ids: string[]) => ids.map((id) => ({ id }));

const stored = (): string[] => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');

beforeEach(() => {
	localStorage.clear();
});

describe('loadSeenRepoIds', () => {
	it('starts empty for a first-time reader', () => {
		// Given nothing stored
		// When the memory is loaded
		// Then the feed is unfiltered rather than broken
		expect(loadSeenRepoIds().size).toBe(0);
	});

	it('restores what a previous visit saw', () => {
		// Given ids left behind by an earlier session
		localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 'b']));

		// When the memory is loaded
		// Then a refresh knows to skip them
		expect([...loadSeenRepoIds()]).toEqual(['a', 'b']);
	});

	it('recovers from corrupted storage instead of failing the feed', () => {
		// Given a value that is not JSON, e.g. a half-written record
		localStorage.setItem(STORAGE_KEY, '{not json');

		// When the memory is loaded
		// Then the reader loses variety, not the feed
		expect(loadSeenRepoIds().size).toBe(0);
	});

	it('ignores entries that are not ids', () => {
		// Given a stored array holding junk alongside real ids
		localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 42, null, 'b']));

		// When the memory is loaded
		// Then only usable ids survive
		expect([...loadSeenRepoIds()]).toEqual(['a', 'b']);
	});
});

describe('rememberRepoIds', () => {
	it('persists across a reload', () => {
		// Given a batch the reader was just shown
		const seen = new Set<string>();

		// When it is remembered
		rememberRepoIds(seen, ['a', 'b']);

		// Then a refresh can read it back
		expect(stored()).toEqual(['a', 'b']);
	});

	it('drops the oldest ids once the cap is passed', () => {
		// Given more cards than the memory holds
		const seen = new Set<string>();
		rememberRepoIds(
			seen,
			Array.from({ length: LIMIT + 50 }, (_, index) => `repo-${index}`)
		);

		// When the memory is inspected
		// Then it stays bounded, keeping the most recent cards
		expect(seen.size).toBe(LIMIT);
		expect(seen.has('repo-0')).toBe(false);
		expect(seen.has(`repo-${LIMIT + 49}`)).toBe(true);
	});

	it('treats a re-shown card as recent again', () => {
		// Given an id remembered early on
		const seen = new Set<string>();
		rememberRepoIds(seen, ['first', 'second']);

		// When it comes round again
		rememberRepoIds(seen, ['first']);

		// Then it moves to the back of the queue, so the trim evicts genuinely
		// stale entries rather than the one just shown
		expect([...seen]).toEqual(['second', 'first']);
	});
});

describe('dropSeen', () => {
	it('removes cards the reader has already been shown', () => {
		// Given a full batch overlapping an earlier one
		const batch = repos('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');

		// When the seen ids are dropped
		const result = dropSeen(batch, new Set(['a', 'c']));

		// Then only fresh cards remain
		expect(result.map((project) => project.id)).toEqual(['b', 'd', 'e', 'f', 'g', 'h']);
	});

	it('keeps a thin batch rather than emptying the feed', () => {
		// Given a batch almost entirely seen before
		const batch = repos('a', 'b', 'c', 'd');

		// When filtering would leave too little to scroll
		const result = dropSeen(batch, new Set(['a', 'b', 'c']));

		// Then a repeat is preferred over a blank screen
		expect(result).toEqual(batch);
	});
});
