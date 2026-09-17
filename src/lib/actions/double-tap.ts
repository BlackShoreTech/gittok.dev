// Purpose: Recognise a deliberate double tap on an element
// Context: The feed is a thumb surface, and the gesture people already know
// from TikTok is "tap it twice to like it". Detection lives here rather than in
// the card because the hard part is not the counting — it is refusing every
// near-miss: a scroll, a drag, a tap on a link, a slow pair of unrelated taps.
// Attaching imperatively also keeps pointer handlers off a non-interactive
// <article>, which would otherwise be an accessibility smell.

import type { Action } from 'svelte/action';

/** Longest pause that still reads as one gesture rather than two taps. */
const MAX_GAP_MS = 320;

/**
 * How far the second tap may land from the first. Sized to a fingertip — the
 * same 44px used for touch targets — so resting-hand jitter still counts and a
 * tap on the other side of the card does not.
 */
const MAX_DRIFT_PX = 44;

/** Offset from the element's top-left, so callers can place feedback at the tap. */
export type TapPoint = { x: number; y: number };

export type DoubleTapOptions = {
	ondoubletap: (point: TapPoint) => void;
};

/**
 * Calls `ondoubletap` when the same spot is tapped twice in quick succession.
 *
 * Mouse input is deliberately ignored. A double-click already means "select
 * this word", and READMEs are full of install commands people copy that way —
 * a pointer device gets the explicit control instead.
 */
export const doubleTap: Action<HTMLElement, DoubleTapOptions> = (node, options) => {
	let handler = options.ondoubletap;
	let previous: { time: number; x: number; y: number } | null = null;

	const onPointerUp = (event: PointerEvent) => {
		if (event.pointerType === 'mouse') return;

		// Links and buttons own their taps; double-tapping "Open on GitHub"
		// should open GitHub twice at worst, never star behind the reader's back.
		if (event.target instanceof Element && event.target.closest('a, button')) {
			previous = null;
			return;
		}

		const current = { time: event.timeStamp, x: event.clientX, y: event.clientY };

		if (
			previous &&
			current.time - previous.time <= MAX_GAP_MS &&
			Math.hypot(current.x - previous.x, current.y - previous.y) <= MAX_DRIFT_PX
		) {
			// Cleared rather than carried forward, so three taps are one gesture
			// plus a stray — not two overlapping gestures.
			previous = null;

			const rect = node.getBoundingClientRect();
			handler({ x: current.x - rect.left, y: current.y - rect.top });
			return;
		}

		previous = current;
	};

	// A touch that turns into a scroll is cancelled, never released. That is what
	// keeps flicking through the feed from registering as a stream of taps.
	const onPointerCancel = () => {
		previous = null;
	};

	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerCancel);

	return {
		update: (next: DoubleTapOptions) => {
			handler = next.ondoubletap;
		},
		destroy: () => {
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerCancel);
		}
	};
};
