import { describe, expect, it } from 'vitest';

import { applySignal } from './attribution';
import { enforceDiversity, rankBatch, sampleTopic, scoreProject } from './ranking';
import {
	DIVERSITY_MAX_PER_WINDOW,
	DIVERSITY_WINDOW,
	MAX_TOPIC_SHARE,
	emptyProfile,
	type SignalKind,
	type TasteProfile
} from './types';

/** mulberry32. Seeded so every guarantee below is a fact about the algorithm
 *  rather than a fact about today's luck. */
const mulberry32 = (seed: number): (() => number) => {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), state | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

/** The curated topic list the feed draws from. A smaller pool would flatter
 *  exploration by making every random draw look deliberate. */
const POOL_SIZE = 823;

const DRAWS = 5000;

/**
 * MAX_TOPIC_SHARE bounds the sampling *distribution*; an observed share of 5000
 * Bernoulli draws at p = 0.15 has a standard deviation of ~0.005, so a finite
 * sample sits within roughly four of those of the ceiling.
 */
const SAMPLING_SLACK = 0.02;

const poolWith = (...topics: string[]): string[] => [
	...topics,
	...Array.from({ length: POOL_SIZE - topics.length }, (_, index) => `topic-${index}`)
];

const drawTopics = (
	profile: TasteProfile,
	pool: readonly string[],
	seed: number
): Map<string, number> => {
	const random = mulberry32(seed);
	const counts = new Map<string, number>();

	for (let draw = 0; draw < DRAWS; draw++) {
		const topic = sampleTopic(profile, pool, random);
		counts.set(topic, (counts.get(topic) ?? 0) + 1);
	}

	return counts;
};

const starred = (topics: readonly string[][], times: number, kind: SignalKind = 'star') => {
	let profile = emptyProfile();

	for (let signal = 0; signal < times; signal++) {
		profile = applySignal(profile, {
			kind,
			topics: topics[signal % topics.length],
			language: 'Rust',
			at: 0
		});
	}

	return profile;
};

/** A realistically tagged Python CLI tool — the exact card the product owner
 *  named when they said one star must not turn the feed into python. */
const PYTHON_REPO = ['python', 'cli', 'automation', 'scripting', 'developer-tools'];

const RUST_REPOS = [
	['rust', 'systems-programming', 'cli'],
	['rust', 'wasm', 'webassembly'],
	['rust', 'async', 'cli']
];

describe('sampleTopic — one star must not flood the feed', () => {
	it('keeps a single starred topic under 1% of draws', () => {
		// Given a brand new reader who has starred exactly one Python repository
		const profile = applySignal(emptyProfile(), {
			kind: 'star',
			topics: PYTHON_REPO,
			language: 'Python',
			at: 0
		});

		// When the next 5000 searches choose the topic they are built around
		const counts = drawTopics(profile, poolWith(...PYTHON_REPO), 20_260_917);
		const python = (counts.get('python') ?? 0) / DRAWS;

		// Then python is a nudge and nothing more. This is the regression test for
		// the headline requirement: a nearly-empty profile earns almost no tilt,
		// and the credit it does earn is split across the card's rarest topics.
		expect(python).toBeLessThan(0.01);
		expect(counts.size).toBeGreaterThan(500);
	});
});

describe('sampleTopic', () => {
	it('draws evenly for a reader it knows nothing about', () => {
		// Given a first-time reader
		// When 5000 searches choose their topic
		const counts = drawTopics(emptyProfile(), poolWith(), 99);

		// Then nothing is favoured, because there is nothing yet to favour
		expect(Math.max(...counts.values()) / DRAWS).toBeLessThan(0.01);
	});

	it('caps even a heavily earned topic at its share of draws', () => {
		// Given a reader who has starred 25 Rust repositories, so the profile is
		// about as concentrated as sustained behaviour can make it
		const profile = starred(RUST_REPOS, 25);

		// When 5000 searches choose their topic
		const counts = drawTopics(profile, poolWith(...new Set(RUST_REPOS.flat())), 7_777);
		const top = Math.max(...counts.values()) / DRAWS;

		// Then the ceiling holds. Softmax alone would hand rust 99% of the exploit
		// branch, i.e. roughly 59% of every draw; the cap is what turns "unlikely"
		// into "impossible".
		expect(top).toBeLessThan(MAX_TOPIC_SHARE + SAMPLING_SLACK);
		expect(top).toBeLessThan(0.25);
	});

	it('a single-topic exploit pool still respects the share ceiling', () => {
		// Given a reader who has starred 40 repositories carrying exactly one topic
		// each, so the exploit pool has no second entry to hand capped excess to.
		// The redistribution loop used to give that excess straight back to the
		// topic it had just taken it from, which put rust at ~66% of every draw.
		const profile = starred([['rust']], 40);

		// When 5000 searches choose their topic
		const counts = drawTopics(profile, poolWith('rust'), 5_150);
		const share = (counts.get('rust') ?? 0) / DRAWS;

		// Then the ceiling holds regardless of how few topics the reader has
		// taught the profile, because the shortfall falls through to exploration
		expect(share).toBeLessThan(MAX_TOPIC_SHARE + SAMPLING_SLACK);
		expect(counts.size).toBeGreaterThan(500);
	});

	it('holds the ceiling when every topic in the exploit pool is capped', () => {
		// Given an exploit pool of two equally loved topics: the ceiling admits at
		// most 0.15 each, so no ordering of them can fill the branch either
		const profile = starred([['rust', 'wasm']], 40);

		// When 5000 searches choose their topic
		const counts = drawTopics(profile, poolWith('rust', 'wasm'), 8_610);

		// Then neither is over the line — the excess leaves the branch entirely
		// rather than being shuffled between the topics that are already capped
		expect(Math.max(...counts.values()) / DRAWS).toBeLessThan(MAX_TOPIC_SHARE + SAMPLING_SLACK);
	});

	it('still spends most draws on things the reader never asked for', () => {
		// Given that same well-established profile
		const profile = starred(RUST_REPOS, 25);

		// When 5000 searches choose their topic
		const counts = drawTopics(profile, poolWith(...new Set(RUST_REPOS.flat())), 7_777);
		const unlearned = [...counts.keys()].filter((topic) => !(topic in profile.topics));
		const explored = unlearned.reduce((sum, topic) => sum + (counts.get(topic) ?? 0), 0);

		// Then a discovery product is still discovering: most of the feed is
		// topics with no affinity at all
		expect(unlearned.length).toBeGreaterThan(500);
		expect(explored / DRAWS).toBeGreaterThan(0.3);
	});

	it('stops showing a topic the reader explicitly rejected', () => {
		// Given a reader who dismissed the same topic three times
		const profile = starred([['crypto']], 3, 'not_interested');

		// When 5000 searches choose their topic
		const counts = drawTopics(profile, poolWith('crypto'), 4_242);

		// Then it leaves exploration entirely, rather than merely appearing less —
		// this is the one place taste is allowed to be exclusive
		expect(counts.get('crypto')).toBeUndefined();
		expect(counts.size).toBeGreaterThan(500);
	});

	it('keeps drawing when every topic in the pool is muted', () => {
		// Given a pool holding nothing but a rejected topic
		const profile = starred([['crypto']], 3, 'not_interested');

		// When a search chooses its topic
		// Then a topic they disliked once beats a blank feed
		expect(sampleTopic(profile, ['crypto'], mulberry32(1))).toBe('crypto');
	});
});

describe('scoreProject', () => {
	const learned = (): TasteProfile => ({
		...emptyProfile(),
		topics: { rust: { score: 6, events: 30, updatedAt: 0 } },
		languages: { Rust: { score: 3, events: 30, updatedAt: 0 } }
	});

	it('adds up both dimensions of what it recognises', () => {
		// Given a card matching a learned topic and a learned language
		// When it is scored
		const score = scoreProject(learned(), { topics: ['rust', 'cli'], language: 'Rust' });

		// Then both count, discounted by confidence, and the unknown topic is neutral
		expect(score).toBeCloseTo(6 * (30 / 35) + 3 * (30 / 35), 10);
	});

	it('scores an unrecognised card at zero rather than below it', () => {
		// Given a card the profile says nothing about
		// When it is scored
		// Then taste reorders a batch; ruling a card out is the filter's job
		expect(scoreProject(learned(), { topics: ['elixir'], language: 'Elixir' })).toBe(0);
	});

	it('matches topics regardless of how GitHub cased them', () => {
		// Given a card whose topic arrives capitalised
		// When it is scored
		// Then it matches the profile, which stores topics folded to lower case
		expect(scoreProject(learned(), { topics: ['Rust'], language: null })).toBeGreaterThan(0);
	});
});

describe('rankBatch', () => {
	it('leads with the card the profile scores highest, leaving the batch alone', () => {
		// Given a batch where one card matches a well-established affinity
		const profile: TasteProfile = {
			...emptyProfile(),
			topics: { rust: { score: 6, events: 30, updatedAt: 0 } }
		};
		const batch = [
			{ id: 'plain', topics: ['php'], language: null },
			{ id: 'loved', topics: ['rust'], language: null }
		];
		const snapshot = [...batch];

		// When the batch is ranked
		const ranked = rankBatch(profile, batch);

		// Then the best match opens the feed and the caller's array is untouched
		expect(ranked.map((project) => project.id)).toEqual(['loved', 'plain']);
		expect(batch).toEqual(snapshot);
	});

	it('holds arrival order for cards it cannot tell apart', () => {
		// Given a batch the profile says nothing about
		const batch = ['a', 'b', 'c', 'd'].map((id) => ({ id, topics: [], language: null }));

		// When it is ranked
		const ranked = rankBatch(emptyProfile(), batch);

		// Then the search's own ordering survives rather than being quietly shuffled
		expect(ranked.map((project) => project.id)).toEqual(['a', 'b', 'c', 'd']);
	});
});

const worstWindow = (projects: readonly { language: string | null }[]): number => {
	let worst = 0;

	for (let start = 0; start + DIVERSITY_WINDOW <= projects.length; start++) {
		const counts = new Map<string, number>();

		for (const project of projects.slice(start, start + DIVERSITY_WINDOW)) {
			if (project.language === null) continue;
			counts.set(project.language, (counts.get(project.language) ?? 0) + 1);
		}

		worst = Math.max(worst, ...counts.values());
	}

	return worst;
};

const cards = (languages: readonly string[]) =>
	languages.map((language, index) => ({ id: `card-${index}`, language }));

describe('enforceDiversity', () => {
	it('breaks up a clump when the batch offers alternatives', () => {
		// Given a batch arriving grouped by language, which is what a scored sort
		// produces: four each of five languages, all in runs
		const grouped = ['Python', 'Go', 'Rust', 'Java', 'C'].flatMap((language) =>
			Array.from({ length: 4 }, () => language)
		);

		// When the batch is de-clumped
		const result = enforceDiversity(cards(grouped));

		// Then no window of ten holds more than two of any language, and every
		// card the reader was owed is still there
		expect(worstWindow(result)).toBeLessThanOrEqual(DIVERSITY_MAX_PER_WINDOW);
		expect(result).toHaveLength(grouped.length);
		expect(result.map((project) => project.id).sort()).toEqual(
			cards(grouped)
				.map((project) => project.id)
				.sort()
		);
	});

	it('keeps every card when the batch is all one language', () => {
		// Given ten Python repositories, which have no ordering that satisfies the
		// window at all
		const batch = cards(Array.from({ length: 10 }, () => 'Python'));

		// When the batch is de-clumped
		const result = enforceDiversity(batch);

		// Then clumping is preferred over dropping cards the reader would have seen
		expect(result).toHaveLength(10);
		expect(result).toEqual(batch);
	});

	it('never counts a card GitHub reports no language for', () => {
		// Given a batch of docs and awesome-list repositories
		const batch = Array.from({ length: 12 }, (_, index) => ({
			id: `card-${index}`,
			language: null
		}));

		// When the batch is de-clumped
		const result = enforceDiversity(batch);

		// Then nothing is reordered, because null is not a clump
		expect(result).toEqual(batch);
	});

	it('preserves length and membership for any batch', () => {
		// Given a pathological mix: one dominant language, a little variety, and
		// cards with no language at all
		const batch = cards(
			Array.from({ length: 30 }, (_, index) => (index % 7 === 0 ? 'Go' : 'Python'))
		);
		const snapshot = [...batch];

		// When the batch is de-clumped
		const result = enforceDiversity(batch);

		// Then nothing is lost, nothing is duplicated, and the input is untouched
		expect(result).toHaveLength(batch.length);
		expect(new Set(result)).toEqual(new Set(batch));
		expect(batch).toEqual(snapshot);
	});
});
