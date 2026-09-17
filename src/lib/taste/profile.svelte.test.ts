import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	applySessionDecay,
	clearProfile,
	confidence,
	effectiveScore,
	loadProfile,
	observeRepos,
	profileStrength,
	saveProfile,
	topAffinities,
	topicIdf
} from './profile';
import {
	AFFINITY_EPSILON,
	CONFIDENCE_K,
	SESSION_DECAY,
	emptyProfile,
	type Affinity,
	type CorpusStats,
	type TasteProfile
} from './types';

/** The key `profile.ts` owns. Duplicated so a rename fails loudly here. */
const STORAGE_KEY = 'gittok:taste-v2';

const affinity = (score: number, events: number): Affinity => ({ score, events, updatedAt: 0 });

const withTopics = (topics: Record<string, Affinity>): TasteProfile => ({
	...emptyProfile(),
	topics
});

const corpus = (documents: number, topics: Record<string, number>): CorpusStats => ({
	documents,
	topics
});

beforeEach(() => {
	localStorage.clear();
});

describe('confidence', () => {
	it('grows from nothing to nearly everything as events accumulate', () => {
		// Given affinities built from 0, 1, 5 and 50 signals
		// When each is weighed
		// Then one tap is worth a sixth of its face value and only sustained
		// behaviour approaches the whole of it
		expect(confidence(affinity(1, 0))).toBe(0);
		expect(confidence(affinity(1, 1))).toBeCloseTo(1 / 6, 10);
		expect(confidence(affinity(1, CONFIDENCE_K))).toBe(0.5);
		expect(confidence(affinity(1, 50))).toBeCloseTo(50 / 55, 10);
	});
});

describe('effectiveScore', () => {
	it('discounts the raw score by its confidence', () => {
		// Given a strong raw score backed by a single event, which is exactly the
		// "one star" case the whole design exists to tame
		// When it is read
		// Then the profile reports a fraction of what was accumulated
		expect(effectiveScore(affinity(3, 1))).toBeCloseTo(0.5, 10);
		expect(effectiveScore(affinity(3, 50))).toBeCloseTo(3 * (50 / 55), 10);
	});

	it('keeps the sign of a dislike', () => {
		// Given a negative affinity
		// When it is read
		// Then confidence scales it without ever flipping it positive
		expect(effectiveScore(affinity(-2, 5))).toBeCloseTo(-1, 10);
	});
});

describe('topicIdf', () => {
	it('ranks a common topic below a rare one, and an unseen topic above both', () => {
		// Given a corpus where python is everywhere and cli is uncommon
		const stats = corpus(1000, { python: 800, cli: 60 });

		// When each topic's rarity is read
		const common = topicIdf(stats, 'python');
		const rare = topicIdf(stats, 'cli');
		const unseen = topicIdf(stats, 'hyperbolic-geometry');

		// Then a tag nothing else carries is the most informative thing on a card
		expect(common).toBeLessThan(rare);
		expect(rare).toBeLessThan(unseen);
	});

	it('stays positive even for a topic on every document', () => {
		// Given a topic carried by the entire corpus
		// When its rarity is read
		// Then it still contributes credit rather than zeroing or inverting it
		expect(topicIdf(corpus(500, { python: 500 }), 'python')).toBeGreaterThan(0);
	});
});

describe('profileStrength', () => {
	it('stays near zero after a single signal', () => {
		// Given the affinity one star produces
		const profile = withTopics({ python: affinity(1, 1) });

		// When the profile's trust is read
		// Then it is worth a few percent, which is what keeps the feed exploring
		expect(profileStrength(profile)).toBeCloseTo(1 / 6 / (1 / 6 + 5), 10);
		expect(profileStrength(profile)).toBeLessThan(0.05);
	});

	it('ignores languages', () => {
		// Given a heavily established language affinity and no topics at all
		const profile: TasteProfile = { ...emptyProfile(), languages: { Python: affinity(20, 50) } };

		// When the profile's trust is read
		// Then language — far coarser than a topic — buys no tilt on its own
		expect(profileStrength(profile)).toBe(0);
	});

	it('counts a dislike as evidence too', () => {
		// Given a profile holding only a strong negative
		const profile = withTopics({ crypto: affinity(-3, 20) });

		// When the profile's trust is read
		// Then knowing what the reader rejects is knowledge, not absence of it
		expect(profileStrength(profile)).toBeGreaterThan(0.3);
	});
});

describe('loadProfile', () => {
	it('starts empty for a first-time reader', () => {
		// Given nothing stored
		// When the profile is loaded
		// Then the feed runs on pure exploration rather than breaking
		expect(loadProfile().topics).toEqual({});
	});

	it('restores what an earlier session learned', () => {
		// Given a profile left behind by a previous visit
		const stored = withTopics({ rust: affinity(2, 8) });
		localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

		// When the profile is loaded
		// Then the reader's history survives the reload
		expect(loadProfile().topics.rust).toEqual(affinity(2, 8));
	});

	it('discards a profile from an older shape', () => {
		// Given a v1 record from before this contract existed
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ ...withTopics({ go: affinity(1, 1) }), v: 1 })
		);

		// When the profile is loaded
		// Then it is rebuilt from scratch rather than mis-read
		expect(loadProfile().topics).toEqual({});
	});

	it.each([
		['not JSON at all', '{not json'],
		['a bare array', '[]'],
		['null', 'null'],
		[
			'a profile missing its corpus',
			JSON.stringify({ v: 2, topics: {}, languages: {}, updatedAt: 0 })
		],
		[
			'an affinity with a string score',
			JSON.stringify({
				...emptyProfile(),
				topics: { rust: { score: 'lots', events: 3, updatedAt: 0 } }
			})
		]
	])('recovers from %s', (_case, stored) => {
		// Given storage holding something unusable
		localStorage.setItem(STORAGE_KEY, stored);

		// When the profile is loaded
		// Then the reader loses their learned tilt, not the feed
		expect(loadProfile()).toMatchObject({ v: 2, topics: {}, languages: {} });
	});
});

describe('saveProfile', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('round-trips through storage', () => {
		// Given a profile with both dimensions populated
		const profile: TasteProfile = {
			...withTopics({ rust: affinity(2, 8) }),
			languages: { Rust: affinity(1, 8) }
		};

		// When it is saved and read back
		saveProfile(profile);

		// Then nothing is lost across the reload
		expect(loadProfile()).toEqual(profile);
	});

	it('tolerates a full or blocked quota', () => {
		// Given storage that refuses writes, i.e. private mode
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError');
		});

		// When a profile is saved
		// When it fails, the profile still steers this session
		expect(() => saveProfile(emptyProfile())).not.toThrow();
	});
});

describe('applySessionDecay', () => {
	it('ages scores while leaving earned history alone', () => {
		// Given an affinity built over many sessions
		const profile = withTopics({ rust: affinity(2, 30) });

		// When a new session starts
		const decayed = applySessionDecay(profile, 1_000);

		// Then the score drifts but confidence does not, because a long-held
		// preference is not made unproven by the passage of a day
		expect(decayed.topics.rust.score).toBeCloseTo(2 * SESSION_DECAY, 10);
		expect(decayed.topics.rust.events).toBe(30);
		expect(decayed.updatedAt).toBe(1_000);
	});

	it('drops an affinity that has faded to noise', () => {
		// Given an affinity sitting just above the noise floor
		const profile = withTopics({
			rust: affinity(2, 30),
			ephemeral: affinity(AFFINITY_EPSILON, 1)
		});

		// When a new session starts
		const decayed = applySessionDecay(profile, 1_000);

		// Then it is forgotten rather than persisted forever
		expect(decayed.topics.ephemeral).toBeUndefined();
		expect(decayed.topics.rust).toBeDefined();
	});

	it('leaves the corpus and the caller profile untouched', () => {
		// Given a profile carrying observed frequencies
		const profile: TasteProfile = {
			...withTopics({ rust: affinity(2, 30) }),
			corpus: corpus(40, { rust: 12 })
		};
		const snapshot = JSON.parse(JSON.stringify(profile));

		// When a new session starts
		const decayed = applySessionDecay(profile, 1_000);

		// Then rarity keeps its calibration and the input is unmodified
		expect(decayed.corpus).toEqual(corpus(40, { rust: 12 }));
		expect(profile).toEqual(snapshot);
	});
});

describe('observeRepos', () => {
	it('counts each repository once per topic', () => {
		// Given a batch where a topic is repeated on one card, as GitHub sometimes
		// returns after casing differences
		const profile = observeRepos(emptyProfile(), [
			{ topics: ['Python', 'python', 'cli'] },
			{ topics: ['rust'] }
		]);

		// When the corpus is read
		// Then the document count is the batch size and no card inflates a topic
		expect(profile.corpus.documents).toBe(2);
		expect(profile.corpus.topics).toEqual({ python: 1, cli: 1, rust: 1 });
	});

	it('accumulates across batches without mutating the input', () => {
		// Given a corpus already holding an earlier batch
		const first = observeRepos(emptyProfile(), [{ topics: ['python'] }]);
		const snapshot = JSON.parse(JSON.stringify(first));

		// When another batch is folded in
		const second = observeRepos(first, [{ topics: ['python', 'cli'] }]);

		// Then rarity tracks the whole history and the caller's copy is untouched
		expect(second.corpus).toEqual(corpus(2, { python: 2, cli: 1 }));
		expect(first).toEqual(snapshot);
	});
});

describe('clearProfile', () => {
	it('forgets the stored profile and hands back an empty one', () => {
		// Given a profile with real history behind it
		saveProfile({
			...withTopics({ rust: affinity(4, 8) }),
			corpus: { topics: { rust: 12 }, documents: 30 }
		});

		// When the reader asks to start over
		const cleared = clearProfile();

		// Then nothing survives, including the corpus it was calibrated against
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(cleared.topics).toEqual({});
		expect(cleared.corpus.documents).toBe(0);
		expect(loadProfile()).toEqual(expect.objectContaining({ topics: {}, languages: {} }));
	});
});

describe('topAffinities', () => {
	it('ranks by earned score, not raw score', () => {
		// A single strong signal must not outrank a topic the reader has
		// confirmed repeatedly — that ordering is the whole point of confidence.
		const profile = withTopics({
			once: affinity(3, 1),
			repeatedly: affinity(3, 40)
		});

		expect(topAffinities(profile)).toEqual(['repeatedly', 'once']);
	});

	it('leaves out rejected topics', () => {
		const profile = withTopics({ liked: affinity(2, 5), rejected: affinity(-2, 5) });
		expect(topAffinities(profile)).toEqual(['liked']);
	});

	it('honours the limit', () => {
		const profile = withTopics({
			a: affinity(5, 9),
			b: affinity(4, 9),
			c: affinity(3, 9)
		});

		expect(topAffinities(profile, 2)).toEqual(['a', 'b']);
	});
});
