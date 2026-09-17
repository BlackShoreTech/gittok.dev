// Purpose: Lock the filter's persistence rules, especially the legacy migration
// Context: The migration reads a key the filter itself does not own. Getting the
//          hand-off wrong resurrects selections a reader has explicitly removed,
//          which is exactly what happened the first time.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { emptyFilter, isFilterActive, filterCount } from './filter';

const FILTER_KEY = 'gittok:filter';
const LEGACY_KEY = 'topics';

/**
 * The store reads localStorage once at module load, so each case re-evaluates it
 * against freshly seeded storage rather than sharing one instance. That module
 * load is the behaviour under test: it is where the migration runs.
 */
const freshStore = async () => {
	vi.resetModules();
	const module = await import('./filter');
	return module.filterStore;
};

const read = <T>(store: { subscribe: (run: (value: T) => void) => () => void }): T => {
	let value!: T;
	store.subscribe((current) => (value = current))();
	return value;
};

describe('filter persistence', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('starts empty when nothing is stored', async () => {
		const store = await freshStore();
		expect(read(store)).toEqual(emptyFilter());
	});

	it('restores a stored filter', async () => {
		localStorage.setItem(
			FILTER_KEY,
			JSON.stringify({ topics: ['rust'], language: 'language:rust', starBand: null })
		);

		const store = await freshStore();
		const filter = read(store);

		expect(filter.topics).toEqual(['rust']);
		expect(filter.language).toBe('language:rust');
	});

	it('adopts topics picked before the filter existed', async () => {
		localStorage.setItem(LEGACY_KEY, JSON.stringify(['rust', 'cli']));

		const store = await freshStore();
		expect(read(store).topics).toEqual(['rust', 'cli']);
	});

	// The regression. Removing the last topic clears the filter's own key, so a
	// migration that left the legacy key in place read it again on reload and put
	// every topic back — the reader could never actually remove one.
	it('does not restore migrated topics after they are removed', async () => {
		localStorage.setItem(LEGACY_KEY, JSON.stringify(['rust']));

		const first = await freshStore();
		expect(read(first).topics).toEqual(['rust']);

		first.toggleTopic('rust');
		expect(read(first).topics).toEqual([]);

		const afterReload = await freshStore();
		expect(read(afterReload).topics).toEqual([]);
		expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
	});

	it('does not restore migrated topics after a full clear', async () => {
		localStorage.setItem(LEGACY_KEY, JSON.stringify(['rust', 'cli']));

		const first = await freshStore();
		first.clear();

		const afterReload = await freshStore();
		expect(read(afterReload)).toEqual(emptyFilter());
	});

	it('consumes the legacy key even when it holds nothing usable', async () => {
		localStorage.setItem(LEGACY_KEY, JSON.stringify([]));

		await freshStore();
		expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
	});

	it('survives a corrupt stored filter', async () => {
		localStorage.setItem(FILTER_KEY, '{not json');

		const store = await freshStore();
		expect(read(store)).toEqual(emptyFilter());
	});

	it('persists each kind of constraint', async () => {
		const store = await freshStore();

		store.toggleTopic('rust');
		store.setLanguage('language:rust');
		store.setStarBand('stars:50..200');

		const stored: unknown = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null');
		expect(stored).toEqual({
			topics: ['rust'],
			language: 'language:rust',
			starBand: 'stars:50..200'
		});
	});
});

describe('filter predicates', () => {
	it('reports an empty filter as inactive', () => {
		expect(isFilterActive(emptyFilter())).toBe(false);
		expect(filterCount(emptyFilter())).toBe(0);
	});

	it('counts every constraint, not just topics', () => {
		const filter = { topics: ['rust', 'cli'], language: 'language:rust', starBand: null };
		expect(isFilterActive(filter)).toBe(true);
		expect(filterCount(filter)).toBe(3);
	});
});
