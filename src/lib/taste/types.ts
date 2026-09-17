// Purpose: The shared contract for filtering and taste learning
// Context: These are two deliberately separate systems that the old topic store
//          conflated. A *filter* is an explicit, exclusive constraint the reader
//          sets and can see. *Taste* is implicit, weighted, and must never be
//          exclusive — starring one Python repo should nudge the odds, not turn
//          the feed into Python. Everything below exists to keep that promise
//          mechanically true rather than merely intended.

/** A learned affinity for one topic or language. */
export interface Affinity {
	/** Accumulated signal. Unbounded on purpose — confidence and the share cap
	 *  tame it when it is read, so the raw history is never lost. */
	score: number;
	/** How many signals contributed. One event is not a preference; this is what
	 *  lets a single star count for a fraction of its face value. */
	events: number;
	/** Epoch ms of the last update, so idle affinities can decay. */
	updatedAt: number;
}

/**
 * Observed topic frequencies, accumulated from every repository the reader is
 * shown. This is what makes rarity weighting possible without shipping a
 * frequency table: the feed is its own corpus.
 */
export interface CorpusStats {
	/** How many shown repositories carried each topic. */
	topics: Record<string, number>;
	/** Total repositories observed, i.e. the document count for IDF. */
	documents: number;
}

export interface TasteProfile {
	/** Bumped when the shape changes so a stale profile is discarded, not crashed on. */
	v: 2;
	topics: Record<string, Affinity>;
	languages: Record<string, Affinity>;
	corpus: CorpusStats;
	updatedAt: number;
}

/**
 * What the reader did. Ordered roughly by how much intent each one proves:
 * a star is a deliberate act, a fast skip is barely an opinion at all.
 */
export type SignalKind =
	| 'star'
	| 'open'
	| 'share'
	| 'fork'
	| 'dwell_long'
	| 'dwell_medium'
	| 'skip_fast'
	| 'not_interested';

/**
 * Face value of each signal, before rarity splitting and confidence scaling.
 * Negatives are deliberately smaller in magnitude than positives: not reading
 * something is weak evidence, whereas starring it is strong evidence.
 */
export const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
	star: 1.0,
	open: 0.6,
	share: 0.6,
	fork: 0.5,
	dwell_long: 0.3,
	dwell_medium: 0.1,
	skip_fast: -0.25,
	not_interested: -1.0
};

export interface Signal {
	kind: SignalKind;
	/** The repository's topics, as returned by GitHub. */
	topics: readonly string[];
	language: string | null;
	/**
	 * Topics the reader did not really choose — the ones an active filter forced
	 * onto the screen. Crediting these would let a single filtering session
	 * permanently bias the ambient feed, so they are dropped from attribution
	 * while the rest of the repository's topics still count.
	 */
	suppressed?: readonly string[];
	/** Defaults to now; injectable so tests are not clock-dependent. */
	at?: number;
}

/* -------------------------------------------------------------------------- *
 * Tuning
 * All of the "one star must not flood the feed" guarantees live here, in one
 * place, so the behaviour can be reasoned about without reading the algorithms.
 * -------------------------------------------------------------------------- */

/**
 * Confidence half-point. An affinity reaches half its face value at this many
 * events: `score * n / (n + k)`. At k=5 a single star lands at ~17% of its
 * weight, which is the difference between "noticed" and "obsessed".
 */
export const CONFIDENCE_K = 5;

/**
 * Floor on the share of draws that ignore the profile completely. Without it a
 * discovery product converges on what the reader already likes and dies of
 * boredom; this is the budget that keeps finding them things they would never
 * have asked for. Real exploration is usually far higher than this, because the
 * exploit share is itself scaled by how much the profile has actually earned —
 * see PROFILE_STRENGTH_K.
 */
export const EXPLORATION_RATE = 0.25;

/**
 * Saturation point for how much the profile is trusted overall:
 * `strength = totalAffinity / (totalAffinity + k)`, and the exploit share of
 * draws is `(1 - EXPLORATION_RATE) * strength`.
 *
 * This is the guard that stops a nearly-empty profile from dominating. After a
 * single star the profile holds ~0.17 of total affinity, so strength is ~3% and
 * the feed is still ~97% exploration — the one starred topic gets a few tenths
 * of a percent of draws instead of three quarters of them. Only sustained
 * behaviour buys a sustained tilt.
 */
export const PROFILE_STRENGTH_K = 5;

/**
 * An affinity this negative means the reader actively rejected the topic, so it
 * is dropped from exploration too rather than merely disfavoured. Reached by an
 * explicit "not interested", never by skipping alone.
 */
export const NEGATIVE_MUTE_THRESHOLD = -0.5;

/**
 * Hard ceiling on any single topic's share of the sampling distribution, however
 * strong its affinity grows. This is what makes "all they see is python"
 * impossible rather than merely unlikely.
 */
export const MAX_TOPIC_SHARE = 0.15;

/**
 * Softmax temperature for converting affinities into draw probabilities. Higher
 * is flatter. Tuned so a well-established preference is clearly favoured without
 * starving everything else.
 */
export const SAMPLING_TEMPERATURE = 0.5;

/**
 * Multiplier applied to every affinity once per session, giving roughly a
 * 30-day half-life at daily use. Taste drifts; the profile should too.
 */
export const SESSION_DECAY = 0.977;

/** Below this, an affinity is noise and is dropped rather than persisted forever. */
export const AFFINITY_EPSILON = 0.005;

/**
 * Batch diversity guard. Readers perceive *clumps*, not distributions — a
 * statistically healthy 8% Python still feels like a flood when four land in a
 * row. No more than `DIVERSITY_MAX_PER_WINDOW` cards sharing a primary language
 * inside any rolling window of `DIVERSITY_WINDOW`.
 */
export const DIVERSITY_WINDOW = 10;
export const DIVERSITY_MAX_PER_WINDOW = 2;

/** Dwell thresholds in ms, measured from card entry to card exit. */
export const DWELL_LONG_MS = 12_000;
export const DWELL_MEDIUM_MS = 4_000;
export const DWELL_SKIP_MS = 1_500;

/**
 * Cap on how many of a repository's topics may receive credit. Repos tagged with
 * fifteen topics would otherwise spray thin, meaningless signal across the whole
 * profile; the rarest few carry almost all of the information anyway.
 */
export const MAX_CREDITED_TOPICS = 5;

export const emptyProfile = (): TasteProfile => ({
	v: 2,
	topics: {},
	languages: {},
	corpus: { topics: {}, documents: 0 },
	updatedAt: Date.now()
});
