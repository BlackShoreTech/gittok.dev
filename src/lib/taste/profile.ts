// Purpose: Persist the reader's taste profile and read affinities honestly
// Context: Everything here is about *reading* accumulated signal, not collecting
//          it — attribution.ts owns that. The raw `score` on an affinity is
//          deliberately unbounded, so nothing in the product may consume it
//          directly; `effectiveScore` is the only sanctioned reading, because it
//          is where a single star is discounted to a fraction of its face value.

import { browser } from '$app/environment';

import {
	AFFINITY_EPSILON,
	CONFIDENCE_K,
	PROFILE_STRENGTH_K,
	SESSION_DECAY,
	emptyProfile,
	type Affinity,
	type CorpusStats,
	type TasteProfile
} from './types';

const STORAGE_KEY = 'gittok:taste-v2';

/** How much of an affinity's face value its history has earned. */
export const confidence = (affinity: Affinity): number =>
	affinity.events / (affinity.events + CONFIDENCE_K);

/** The only value callers should rank, sample or display on. */
export const effectiveScore = (affinity: Affinity): number => affinity.score * confidence(affinity);

/**
 * Inverse document frequency over the repositories the reader has been shown.
 * Offset by 1 so it is always positive: an unseen topic scores highest, which is
 * correct — a tag nothing else carries is the most informative thing on a card.
 */
export const topicIdf = (corpus: CorpusStats, topic: string): number =>
	Math.log((corpus.documents + 1) / ((corpus.topics[topic] ?? 0) + 1)) + 1;

/**
 * How far the profile as a whole may be trusted, in 0..1. Languages are excluded
 * on purpose: they are far coarser than topics, so counting them would let two
 * stars on Python repos buy the tilt that twenty topic signals should.
 */
export const profileStrength = (profile: TasteProfile): number => {
	const total = Object.values(profile.topics).reduce(
		(sum, affinity) => sum + Math.abs(effectiveScore(affinity)),
		0
	);

	return total / (total + PROFILE_STRENGTH_K);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isAffinity = (value: unknown): value is Affinity =>
	isRecord(value) &&
	typeof value.score === 'number' &&
	typeof value.events === 'number' &&
	typeof value.updatedAt === 'number';

const isAffinityMap = (value: unknown): value is Record<string, Affinity> =>
	isRecord(value) && Object.values(value).every(isAffinity);

const isCorpus = (value: unknown): value is CorpusStats =>
	isRecord(value) &&
	typeof value.documents === 'number' &&
	isRecord(value.topics) &&
	Object.values(value.topics).every((count) => typeof count === 'number');

const isTasteProfile = (value: unknown): value is TasteProfile =>
	isRecord(value) &&
	value.v === 2 &&
	isAffinityMap(value.topics) &&
	isAffinityMap(value.languages) &&
	isCorpus(value.corpus) &&
	typeof value.updatedAt === 'number';

export function loadProfile(): TasteProfile {
	if (!browser) return emptyProfile();

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return emptyProfile();

		const parsed: unknown = JSON.parse(stored);

		// A profile from an older shape is discarded rather than migrated: it is
		// rebuilt within a session of scrolling, and a half-read profile would
		// mis-weight the feed in ways nobody could debug.
		return isTasteProfile(parsed) ? parsed : emptyProfile();
	} catch {
		return emptyProfile();
	}
}

export function saveProfile(profile: TasteProfile): void {
	if (!browser) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
	} catch {
		// Quota or private mode. The profile still steers this session.
	}
}

const decayAll = (affinities: Record<string, Affinity>): Record<string, Affinity> => {
	const next: Record<string, Affinity> = {};

	for (const [key, affinity] of Object.entries(affinities)) {
		const score = affinity.score * SESSION_DECAY;

		// `events` is untouched: confidence is earned history. Decaying it too
		// would make a two-year-old preference look as unproven as a first tap.
		if (Math.abs(score) >= AFFINITY_EPSILON) next[key] = { ...affinity, score };
	}

	return next;
};

/** Ages every affinity once per session, dropping whatever has faded to noise. */
export function applySessionDecay(profile: TasteProfile, now = Date.now()): TasteProfile {
	return {
		...profile,
		topics: decayAll(profile.topics),
		languages: decayAll(profile.languages),
		updatedAt: now
	};
}

/**
 * Folds a batch of shown repositories into the corpus. This is what makes rarity
 * self-calibrating: the feed the reader actually gets is the frequency table,
 * so `cli` is rare or common according to their world rather than ours.
 */
export function observeRepos(
	profile: TasteProfile,
	repos: readonly { topics: readonly string[] }[]
): TasteProfile {
	const topics = { ...profile.corpus.topics };

	for (const repo of repos) {
		// Deduped per repository so a document counts once per topic, which is
		// what the IDF ratio assumes.
		for (const topic of new Set(repo.topics.map((entry) => entry.toLowerCase()))) {
			topics[topic] = (topics[topic] ?? 0) + 1;
		}
	}

	return {
		...profile,
		corpus: { topics, documents: profile.corpus.documents + repos.length }
	};
}
