import { describe, expect, it } from 'vitest';

import { applySignal, creditsFor } from './attribution';
import { effectiveScore } from './profile';
import {
	AFFINITY_EPSILON,
	MAX_CREDITED_TOPICS,
	SIGNAL_WEIGHTS,
	emptyProfile,
	type CorpusStats,
	type Signal,
	type TasteProfile
} from './types';

/** A corpus in which python is everywhere, cli is uncommon and automation is rare. */
const LOPSIDED: CorpusStats = {
	documents: 1000,
	topics: { python: 800, cli: 60, automation: 8 }
};

const EMPTY_CORPUS: CorpusStats = { documents: 0, topics: {} };

const star = (topics: string[], overrides: Partial<Signal> = {}): Signal => ({
	kind: 'star',
	topics,
	language: 'Python',
	at: 1_000,
	...overrides
});

const snapshot = (profile: TasteProfile): TasteProfile => JSON.parse(JSON.stringify(profile));

describe('creditsFor', () => {
	it('credits what was distinctive about the card, not what was obvious', () => {
		// Given a star on a Python CLI tool, in a world where python is on most
		// cards and automation is on almost none
		const { topics } = creditsFor(star(['python', 'cli', 'automation']), LOPSIDED);

		// When the credit is read
		// Then the reader is recorded as liking automation and cli — the reason
		// they stopped — rather than the language half of GitHub is written in
		expect(topics.automation).toBeGreaterThan(topics.cli);
		expect(topics.cli).toBeGreaterThan(topics.python);
		expect(topics.automation / topics.python).toBeGreaterThan(3);
	});

	it('spends exactly the signal weight, however many topics share it', () => {
		// Given the same star against two very different corpora
		const lopsided = creditsFor(star(['python', 'cli', 'automation']), LOPSIDED);
		const flat = creditsFor(star(['python', 'cli', 'automation']), EMPTY_CORPUS);

		// When the credits are totalled
		const total = (topics: Record<string, number>) =>
			Object.values(topics).reduce((sum, value) => sum + value, 0);

		// Then rarity changes the split, never the size of the signal — a repo
		// tagged fifteen ways cannot out-shout one tagged twice
		expect(total(lopsided.topics)).toBeCloseTo(SIGNAL_WEIGHTS.star, 10);
		expect(total(flat.topics)).toBeCloseTo(SIGNAL_WEIGHTS.star, 10);
	});

	it('splits an unknown corpus evenly', () => {
		// Given a first-ever signal, when nothing is known about rarity
		const { topics } = creditsFor(star(['python', 'cli']), EMPTY_CORPUS);

		// When the credit is read
		// Then neither topic is guessed at
		expect(topics.python).toBeCloseTo(topics.cli, 10);
	});

	it('keeps only the rarest few topics on an over-tagged repository', () => {
		// Given a card tagged far past the point of meaning, against a corpus that
		// ranks every one of those tags
		const graded: CorpusStats = {
			documents: 1000,
			topics: {
				python: 800,
				tool: 500,
				utility: 400,
				shell: 300,
				devops: 100,
				cli: 60,
				automation: 8
			}
		};
		const tags = ['python', 'tool', 'utility', 'shell', 'devops', 'cli', 'automation'];

		// When the credit is read
		const { topics } = creditsFor(star(tags), graded);

		// Then thin signal is not sprayed across the whole profile: the commonest
		// tags are the ones that lose their place
		expect(Object.keys(topics).sort()).toEqual(['automation', 'cli', 'devops', 'shell', 'utility']);
		expect(Object.keys(topics)).toHaveLength(MAX_CREDITED_TOPICS);
	});

	it('gives the language its full weight rather than a slice', () => {
		// Given a star on a repository with several topics
		const { languageDelta } = creditsFor(star(['python', 'cli', 'automation']), LOPSIDED);

		// When the language credit is read
		// Then it is undiluted, because language is its own dimension of the
		// profile rather than another share of the topic pie
		expect(languageDelta).toBe(SIGNAL_WEIGHTS.star);
	});

	it('carries a dislike through with the same split', () => {
		// Given an explicit rejection
		const { topics, languageDelta } = creditsFor(
			star(['python', 'automation'], { kind: 'not_interested' }),
			LOPSIDED
		);

		// When the credit is read
		// Then the rarest topic takes the most blame, as it took the most credit
		expect(languageDelta).toBe(SIGNAL_WEIGHTS.not_interested);
		expect(topics.automation).toBeLessThan(topics.python);
		expect(topics.python).toBeLessThan(0);
	});

	it('gives suppressed topics nothing while the rest still count', () => {
		// Given a card the reader only saw because their filter demanded python
		const { topics, languageDelta } = creditsFor(
			star(['python', 'cli', 'automation'], { suppressed: ['python'] }),
			LOPSIDED
		);

		// When the credit is read
		// Then a filtering session cannot permanently bias the ambient feed, and
		// the topics they did choose are credited as usual
		expect(topics.python).toBeUndefined();
		expect(topics.cli).toBeGreaterThan(0);
		expect(topics.automation).toBeGreaterThan(0);
		expect(languageDelta).toBe(SIGNAL_WEIGHTS.star);
	});

	it('still records the language when every topic was suppressed', () => {
		// Given a card whose only topic was the one the filter forced
		const { topics, languageDelta } = creditsFor(
			star(['python'], { suppressed: ['Python'] }),
			LOPSIDED
		);

		// When the credit is read
		// Then nothing is credited on the topic dimension, but the signal is not
		// thrown away wholesale
		expect(topics).toEqual({});
		expect(languageDelta).toBe(SIGNAL_WEIGHTS.star);
	});
});

describe('applySignal', () => {
	it('leaves the profile it was given untouched', () => {
		// Given a profile the feed still holds a reference to
		const profile: TasteProfile = {
			...emptyProfile(),
			topics: { cli: { score: 0.4, events: 2, updatedAt: 0 } },
			corpus: LOPSIDED
		};
		const before = snapshot(profile);

		// When a signal is applied
		applySignal(profile, star(['python', 'cli']));

		// Then the caller decides when the new profile replaces the old one
		expect(profile).toEqual(before);
	});

	it('accumulates score and events on both dimensions', () => {
		// Given a reader starring the same repository twice, e.g. after a reload
		const signal = star(['python', 'cli', 'automation']);
		const profile = applySignal(
			applySignal({ ...emptyProfile(), corpus: LOPSIDED }, signal),
			signal
		);

		// When the profile is read
		// Then the second signal doubles the raw score and buys real confidence,
		// which is what separates a habit from an accident
		expect(profile.topics.automation.events).toBe(2);
		expect(profile.languages.Python).toEqual({ score: 2, events: 2, updatedAt: 1_000 });
		expect(effectiveScore(profile.topics.automation)).toBeGreaterThan(0);
		expect(profile.updatedAt).toBe(1_000);
	});

	it('forgets a preference a later dislike cancels out', () => {
		// Given a topic liked exactly as hard as it was later rejected
		const liked = applySignal(emptyProfile(), star(['pixel-art'], { kind: 'star' }));
		const profile = applySignal(liked, star(['pixel-art'], { kind: 'not_interested' }));

		// When the profile is read
		// Then a zero is dropped rather than persisted, because a stored nothing
		// still counts toward profile strength
		expect(profile.topics['pixel-art']).toBeUndefined();
		expect(Math.abs(liked.topics['pixel-art'].score)).toBeGreaterThan(AFFINITY_EPSILON);
	});

	it('records nothing on the language dimension when GitHub reports none', () => {
		// Given a docs repository, which GitHub often returns with a null language
		const profile = applySignal(emptyProfile(), star(['awesome-list'], { language: null }));

		// When the profile is read
		// Then no bogus language key is invented
		expect(profile.languages).toEqual({});
		expect(profile.topics['awesome-list']).toBeDefined();
	});

	it('normalises topic casing so one preference cannot split in two', () => {
		// Given the same topic arriving in two casings
		const first = applySignal(emptyProfile(), star(['Machine-Learning'], { language: null }));
		const profile = applySignal(first, star(['machine-learning'], { language: null }));

		// When the profile is read
		// Then it is one preference with two events, not two half-preferences
		expect(Object.keys(profile.topics)).toEqual(['machine-learning']);
		expect(profile.topics['machine-learning'].events).toBe(2);
	});
});
