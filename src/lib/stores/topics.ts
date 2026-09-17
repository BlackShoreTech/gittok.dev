import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'topics';

// Load initial state from localStorage if available
const getStoredTopics = (): Set<string> => {
	if (!browser) return new Set();

	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return new Set();

	return new Set(JSON.parse(stored));
};

// Create the store with initial state
const { subscribe, set, update } = writable<Set<string>>(getStoredTopics());

// Save state to localStorage
const saveToStorage = (topics: Set<string>) => {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify([...topics]));
};

// Export the store with actions
//
// `set` and `update` persist too. They used to be re-exported raw, so every
// write that did not go through `toggle` was lost on reload — which silently
// broke any bulk write (importing a set of topics, applying several at once).
export const topicsStore = {
	subscribe,

	set: (topics: Set<string>) => {
		saveToStorage(topics);
		set(topics);
	},

	update: (updater: (topics: Set<string>) => Set<string>) =>
		update((topics) => {
			const newTopics = updater(topics);
			saveToStorage(newTopics);
			return newTopics;
		}),

	toggle: (topic: string) =>
		update((topics) => {
			const newTopics = new Set(topics);

			if (topics.has(topic)) newTopics.delete(topic);
			else newTopics.add(topic);

			saveToStorage(newTopics);
			return newTopics;
		}),

	reset: () => {
		const newTopics = new Set<string>();
		if (browser) localStorage.removeItem(STORAGE_KEY);
		set(newTopics);
	}
};
