import { afterEach, describe, expect, it, vi } from 'vitest';

import { doubleTap, type TapPoint } from './double-tap';

/**
 * jsdom has no `PointerEvent`, and `timeStamp` is read-only on a real one, so
 * taps are built from a `MouseEvent` with the two fields the action reads
 * pinned on. Fixing the clock here is the point: the gesture is defined by
 * timing, and a test that depended on the real one would be flaky by design.
 */
const tap = (
	node: HTMLElement,
	options: {
		at?: TapPoint;
		time?: number;
		type?: string;
		on?: Element;
		event?: 'pointerup' | 'pointercancel';
	} = {}
) => {
	const { at = { x: 100, y: 100 }, time = 0, type = 'touch', on = node } = options;

	const event = new MouseEvent(options.event ?? 'pointerup', {
		clientX: at.x,
		clientY: at.y,
		bubbles: true
	});
	Object.defineProperty(event, 'pointerType', { value: type });
	Object.defineProperty(event, 'timeStamp', { value: time });

	on.dispatchEvent(event);
};

const mount = () => {
	const node = document.createElement('article');
	const link = document.createElement('a');
	node.append(link);
	document.body.append(node);

	const ondoubletap = vi.fn();
	const handle = doubleTap(node, { ondoubletap });

	return { node, link, ondoubletap, handle };
};

afterEach(() => {
	document.body.replaceChildren();
});

describe('doubleTap', () => {
	it('fires when the same spot is tapped twice in quick succession', () => {
		// Given a card under the thumb
		const { node, ondoubletap } = mount();

		// When it is tapped twice, near enough and fast enough
		tap(node, { at: { x: 120, y: 200 }, time: 0 });
		tap(node, { at: { x: 124, y: 206 }, time: 140 });

		// Then the gesture is recognised, at the second tap's position so the
		// feedback can land under the finger
		expect(ondoubletap).toHaveBeenCalledTimes(1);
		expect(ondoubletap).toHaveBeenCalledWith({ x: 124, y: 206 });
	});

	it('ignores a pair of taps too far apart in time', () => {
		// Given two taps a reader would experience as separate
		const { node, ondoubletap } = mount();

		tap(node, { time: 0 });
		tap(node, { time: 600 });

		// Then nothing is starred by accident
		expect(ondoubletap).not.toHaveBeenCalled();
	});

	it('ignores a pair of taps too far apart on screen', () => {
		// Given a fast pair, but at opposite ends of the card
		const { node, ondoubletap } = mount();

		tap(node, { at: { x: 40, y: 40 }, time: 0 });
		tap(node, { at: { x: 300, y: 400 }, time: 120 });

		// Then it reads as two separate taps, which is what it looked like
		expect(ondoubletap).not.toHaveBeenCalled();
	});

	it('treats a slow tap as the start of the next gesture, not a dead end', () => {
		// Given a first tap that timed out
		const { node, ondoubletap } = mount();
		tap(node, { time: 0 });
		tap(node, { time: 600 });

		// When the reader taps again promptly
		tap(node, { time: 700 });

		// Then the pair that was actually fast counts
		expect(ondoubletap).toHaveBeenCalledTimes(1);
	});

	it('does not let a third tap start a second gesture', () => {
		// Given a recognised double tap
		const { node, ondoubletap } = mount();
		tap(node, { time: 0 });
		tap(node, { time: 120 });

		// When a stray third tap follows
		tap(node, { time: 240 });

		// Then it does not pair with the consumed one and star twice
		expect(ondoubletap).toHaveBeenCalledTimes(1);
	});

	it('leaves mouse input to the explicit control', () => {
		// Given a double-click, which on a pointer device means "select this word"
		const { node, ondoubletap } = mount();

		tap(node, { time: 0, type: 'mouse' });
		tap(node, { time: 120, type: 'mouse' });

		// Then copying an install command out of a README stars nothing
		expect(ondoubletap).not.toHaveBeenCalled();
	});

	it('leaves taps on links and buttons alone', () => {
		// Given a reader jabbing at a link inside the README
		const { node, link, ondoubletap } = mount();

		tap(node, { time: 0, on: link });
		tap(node, { time: 120, on: link });

		// Then the link is all that happens
		expect(ondoubletap).not.toHaveBeenCalled();
	});

	it('does not pair a tap with one that landed on a link', () => {
		// Given a tap on a link followed by a tap on the card
		const { node, link, ondoubletap } = mount();

		tap(node, { time: 0, on: link });
		tap(node, { time: 120 });

		// Then the link tap is discarded rather than counted as the first half
		expect(ondoubletap).not.toHaveBeenCalled();
	});

	it('forgets a tap the browser cancelled', () => {
		// Given a touch that turned into a scroll — the browser cancels it
		const { node, ondoubletap } = mount();
		tap(node, { time: 0 });
		tap(node, { time: 20, event: 'pointercancel' });

		// When the reader taps once on whatever card they landed on
		tap(node, { time: 120 });

		// Then flicking through the feed does not star things
		expect(ondoubletap).not.toHaveBeenCalled();
	});

	it('stops listening once the card is torn down', () => {
		// Given a card that has been recycled out of the feed
		const { node, ondoubletap, handle } = mount();
		handle?.destroy?.();

		// When taps keep arriving
		tap(node, { time: 0 });
		tap(node, { time: 120 });

		// Then a detached card cannot star anything
		expect(ondoubletap).not.toHaveBeenCalled();
	});
});
