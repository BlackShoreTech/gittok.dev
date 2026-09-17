// Purpose: Spend the profile — choose what to search for, and in what order
// Context: This is where the promise "learning increases likelihood but never
//          becomes exclusive" is either kept or broken. Three guards stack here:
//          the exploit budget is scaled by how much the profile has earned, every
//          topic is capped at a fixed share of draws however loved it is, and the
//          batch is de-clumped afterwards because readers perceive runs, not
//          distributions.

import { effectiveScore, profileStrength } from './profile';
import {
	DIVERSITY_MAX_PER_WINDOW,
	DIVERSITY_WINDOW,
	EXPLORATION_RATE,
	MAX_TOPIC_SHARE,
	NEGATIVE_MUTE_THRESHOLD,
	SAMPLING_TEMPERATURE,
	type TasteProfile
} from './types';

/** Redistribution can push another topic over the ceiling; bounded so it ends. */
const CAP_PASSES = 8;

const pick = <T>(values: readonly T[], random: () => number): T =>
	values[Math.floor(random() * values.length)];

const softmax = (scores: readonly number[]): number[] => {
	// Shifted by the maximum before exponentiating. Mathematically identical, and
	// the only form that survives a long-established affinity without overflowing.
	const highest = Math.max(...scores);
	const weights = scores.map((score) => Math.exp((score - highest) / SAMPLING_TEMPERATURE));
	const total = weights.reduce((sum, weight) => sum + weight, 0);

	return weights.map((weight) => weight / total);
};

const capShares = (probabilities: readonly number[], cap: number): number[] => {
	let shares = [...probabilities];

	for (let pass = 0; pass < CAP_PASSES; pass++) {
		const excess = shares.reduce((sum, share) => sum + Math.max(0, share - cap), 0);
		if (excess <= 0) break;

		const room = shares.reduce((sum, share) => sum + (share < cap ? share : 0), 0);

		// Nothing left inside the branch may legally take the excess — with a
		// single learned topic that is true at every cap below 1. Stop, and let
		// the clamp below leave the branch short of a whole unit of probability.
		if (room <= 0) break;

		shares = shares.map((share) => (share >= cap ? cap : share + (excess * share) / room));
	}

	// A no-op once the loop converged. When it could not, this is what enforces
	// the ceiling: the shortfall is `sampleTopic`'s cue to explore instead.
	return shares.map((share) => Math.min(share, cap));
};

const drawWeighted = <T>(
	values: readonly T[],
	shares: readonly number[],
	random: () => number
): T => {
	let roll = random() * shares.reduce((sum, share) => sum + share, 0);

	for (let index = 0; index < values.length; index++) {
		roll -= shares[index];
		if (roll < 0) return values[index];
	}

	return values[values.length - 1];
};

/**
 * Picks the topic the next search is built around. Most draws ignore the profile
 * entirely — exploration is the default and exploitation is the exception that
 * has to be earned.
 */
export function sampleTopic(
	profile: TasteProfile,
	pool: readonly string[],
	random: () => number = Math.random
): string {
	const learned = Object.entries(profile.topics).map(
		([topic, affinity]) => [topic, effectiveScore(affinity)] as const
	);

	const muted = new Set(
		learned.filter(([, score]) => score < NEGATIVE_MUTE_THRESHOLD).map(([topic]) => topic)
	);
	const unmuted = pool.filter((topic) => !muted.has(topic));

	// Muting the entire pool would leave a blank feed, which is worse than showing
	// something the reader once dismissed.
	const explorePool = unmuted.length > 0 ? unmuted : pool;

	const exploit = learned.filter(([, score]) => score > 0);
	if (exploit.length === 0) return pick(explorePool, random);

	// Scaled by profile strength, so a nearly-empty profile buys almost no tilt:
	// one star is worth about 2% of draws, not three quarters of them.
	const exploitShare = (1 - EXPLORATION_RATE) * profileStrength(profile);
	if (random() >= exploitShare) return pick(explorePool, random);

	// MAX_TOPIC_SHARE bounds a topic's share of *all* draws, and this branch is
	// only a slice of them, so the ceiling inside it is proportionally higher.
	const cap = Math.min(1, MAX_TOPIC_SHARE / exploitShare);
	const shares = capShares(softmax(exploit.map(([, score]) => score)), cap);
	const claimed = shares.reduce((sum, share) => sum + share, 0);

	// Whatever the ceiling took away has to go somewhere, and handing it back to
	// the topic it was taken from is how a reader who only ever stars one kind of
	// repository used to end up at 66% of draws. Exploration is always available,
	// so the shortfall goes there and the ceiling holds at any exploit-pool size.
	if (random() >= claimed) return pick(explorePool, random);

	return drawWeighted(
		exploit.map(([topic]) => topic),
		shares,
		random
	);
}

export function scoreProject(
	profile: TasteProfile,
	project: { topics: readonly string[]; language: string | null }
): number {
	// An unknown topic scores zero rather than negative: taste reorders a batch,
	// it never rules a card out. Ruling out is the explicit filter's job.
	const topics = project.topics.reduce((sum, topic) => {
		const affinity = profile.topics[topic.toLowerCase()];
		return affinity ? sum + effectiveScore(affinity) : sum;
	}, 0);

	const language = project.language === null ? undefined : profile.languages[project.language];

	return topics + (language ? effectiveScore(language) : 0);
}

const fitsWindow = <T extends { language: string | null }>(
	placed: readonly T[],
	candidate: T
): boolean => {
	if (candidate.language === null) return true;

	const window = placed.slice(Math.max(0, placed.length - (DIVERSITY_WINDOW - 1)));
	const sameLanguage = window.filter((project) => project.language === candidate.language);

	return sameLanguage.length < DIVERSITY_MAX_PER_WINDOW;
};

/**
 * Greedily reorders so no language clumps inside a rolling window. Best effort by
 * design: a batch that is ten Python repos has no legal ordering, and a reader
 * would rather see a clump than lose the cards.
 */
export function enforceDiversity<T extends { language: string | null }>(projects: T[]): T[] {
	const remaining = [...projects];
	const result: T[] = [];

	while (remaining.length > 0) {
		const next = remaining.findIndex((project) => fitsWindow(result, project));
		result.push(...remaining.splice(next === -1 ? 0 : next, 1));
	}

	return result;
}

export function rankBatch<T extends { topics: readonly string[]; language: string | null }>(
	profile: TasteProfile,
	projects: T[]
): T[] {
	const ranked = projects
		.map((project, index) => ({ project, index, score: scoreProject(profile, project) }))
		// Ties hold their arrival order, so a batch the profile says nothing about
		// reaches the feed exactly as the search returned it.
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((entry) => entry.project);

	return enforceDiversity(ranked);
}
