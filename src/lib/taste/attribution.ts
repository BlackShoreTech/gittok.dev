// Purpose: Turn one reader action into credit spread across a repository's topics
// Context: The naive version — give every topic on the card the signal's full
//          weight — is what makes recommenders collapse. Star one Python CLI tool
//          and `python` gains as much as `cli`, except `python` is on a fifth of
//          GitHub, so it wins every subsequent draw. Splitting the signal by
//          rarity credits what was actually distinctive about the card instead.

import { topicIdf } from './profile';
import {
	AFFINITY_EPSILON,
	MAX_CREDITED_TOPICS,
	SIGNAL_WEIGHTS,
	type Affinity,
	type CorpusStats,
	type Signal,
	type TasteProfile
} from './types';

/**
 * Splits a signal's face value across the rarest topics on the card, and hands
 * the language its full weight — language is a separate dimension of the profile,
 * not another slice of the same pie.
 */
export function creditsFor(
	signal: Signal,
	corpus: CorpusStats
): { topics: Record<string, number>; languageDelta: number } {
	const weight = SIGNAL_WEIGHTS[signal.kind];
	const suppressed = new Set((signal.suppressed ?? []).map((topic) => topic.toLowerCase()));

	const candidates = [...new Set(signal.topics.map((topic) => topic.toLowerCase()))].filter(
		(topic) => !suppressed.has(topic)
	);

	// A card tagged fifteen ways would otherwise spray meaningless signal over the
	// whole profile; the rarest few carry nearly all of the information anyway.
	const credited = candidates
		.map((topic) => ({ topic, idf: topicIdf(corpus, topic) }))
		.sort((a, b) => b.idf - a.idf)
		.slice(0, MAX_CREDITED_TOPICS);

	const totalIdf = credited.reduce((sum, entry) => sum + entry.idf, 0);
	const topics: Record<string, number> = {};

	for (const entry of credited) {
		topics[entry.topic] = weight * (entry.idf / totalIdf);
	}

	return { topics, languageDelta: weight };
}

const creditAll = (
	affinities: Record<string, Affinity>,
	deltas: Record<string, number>,
	at: number
): Record<string, Affinity> => {
	const next = { ...affinities };

	for (const [key, delta] of Object.entries(deltas)) {
		const current = next[key] ?? { score: 0, events: 0, updatedAt: at };
		const score = current.score + delta;

		// A dislike that cancels an earlier like out leaves a zero behind. Drop it
		// rather than persist noise that still counts toward profile strength.
		if (Math.abs(score) < AFFINITY_EPSILON) delete next[key];
		else next[key] = { score, events: current.events + 1, updatedAt: at };
	}

	return next;
};

/** Pure: returns the profile the signal produces, leaving the input untouched. */
export function applySignal(profile: TasteProfile, signal: Signal): TasteProfile {
	const { topics, languageDelta } = creditsFor(signal, profile.corpus);
	const at = signal.at ?? Date.now();

	return {
		...profile,
		topics: creditAll(profile.topics, topics, at),
		languages: creditAll(
			profile.languages,
			signal.language === null ? {} : { [signal.language]: languageDelta },
			at
		),
		updatedAt: at
	};
}
