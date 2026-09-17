<!--
  Purpose: The 20-second swipe-to-learn taste test, door 2 of onboarding
  Context: A reader cannot reliably recall which topics they like, but they can
           always recognise one. Eight cards, one per cluster so consecutive
           cards genuinely disagree, keep/skip by tap or arrow key, an inline
           reveal after every answer so the model feels alive, and a result
           card framed as an outcome rather than a redirect. The gesture here
           is the feed's own gesture, so finishing the test teaches the
           product. Profile writing belongs to the caller — this component
           only reports what happened.
-->

<script module lang="ts">
	export interface DeckEntry {
		id: string;
		cluster: string;
		name: string;
		full_name: string;
		description: string | null;
		html_url: string;
		language: string | null;
		stargazers_count: number;
		topics: string[];
		avatar: string;
		default_branch: string;
	}
</script>

<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { X, Heart, ArrowLeft, ArrowRight, RefreshCw, Sparkles } from 'lucide-svelte';
	import { formatCount } from '$lib/format';
	import posthog from 'posthog-js';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** Fires as soon as the test ends, so answers survive a dismissal. */
		onAnswers: (result: { liked: DeckEntry[]; skipped: DeckEntry[] }) => void;
		/** Fires when the reader chooses to leave the result screen for the feed. */
		onDone: () => void;
	}

	const { open, onClose, onAnswers, onDone }: Props = $props();

	const ROUND_COUNT = 8;
	const REVEAL_DELAY_MS = 650;

	type Phase = 'loading' | 'error' | 'playing' | 'result';

	let phase = $state<Phase>('loading');
	let deck = $state<DeckEntry[]>([]);
	let index = $state(0);
	let liked = $state<DeckEntry[]>([]);
	let skipped = $state<DeckEntry[]>([]);
	let revealTopics = $state<string[] | null>(null);
	let revealing = $state(false);
	let loadedOnce = false;

	let sheetEl = $state<HTMLElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;
	let revealTimer: ReturnType<typeof setTimeout> | null = null;

	const current = $derived(deck[index] ?? null);
	const progress = $derived(deck.length ? index / deck.length : 0);

	const topTopics = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const entry of liked) {
			for (const topic of entry.topics) counts[topic] = (counts[topic] ?? 0) + 1;
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([topic]) => topic);
	});

	const pretty = (value: string) => value.replace(/[-_]/g, ' ');

	function shuffle<T>(items: readonly T[]): T[] {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	// One card per cluster so consecutive cards genuinely disagree — a deck of
	// eight frontend repos would teach the profile nothing.
	function sampleDeck(entries: readonly DeckEntry[]): DeckEntry[] {
		const byCluster: Record<string, DeckEntry[]> = {};
		for (const entry of entries) {
			const list = byCluster[entry.cluster];
			if (list) list.push(entry);
			else byCluster[entry.cluster] = [entry];
		}
		return shuffle(Object.keys(byCluster))
			.slice(0, ROUND_COUNT)
			.map((cluster) => {
				const options = byCluster[cluster] ?? [];
				return options[Math.floor(Math.random() * options.length)];
			});
	}

	function resetRun() {
		index = 0;
		liked = [];
		skipped = [];
		revealTopics = null;
		revealing = false;
	}

	async function loadDeck() {
		phase = 'loading';
		try {
			const response = await fetch('/data/taste_deck.json');
			if (!response.ok) throw new Error(`deck_fetch_${response.status}`);
			const entries: unknown = await response.json();
			if (!Array.isArray(entries) || entries.length === 0) throw new Error('deck_empty');

			resetRun();
			deck = sampleDeck(entries as DeckEntry[]);
			phase = deck.length > 0 ? 'playing' : 'error';
		} catch {
			phase = 'error';
		}
	}

	function clearRevealTimer() {
		if (revealTimer !== null) {
			clearTimeout(revealTimer);
			revealTimer = null;
		}
	}

	function finish() {
		clearRevealTimer();
		revealing = false;
		phase = 'result';

		// Persist before the result screen is even shown. Whatever the reader does
		// next — click through, hit Escape, close the tab — the work is already in.
		onAnswers({ liked, skipped });

		posthog.capture('taste_test_completed', {
			answered: liked.length + skipped.length,
			liked: liked.length
		});
	}

	function answer(kept: boolean) {
		if (phase !== 'playing' || revealing || current === null) return;

		const entry = current;
		if (kept) liked = [...liked, entry];
		else skipped = [...skipped, entry];

		revealTopics = entry.topics.slice(0, 3);
		revealing = true;

		clearRevealTimer();
		revealTimer = setTimeout(() => {
			revealTimer = null;
			revealing = false;
			revealTopics = null;
			if (index + 1 >= deck.length) finish();
			else index += 1;
		}, REVEAL_DELAY_MS);
	}

	function skipTheRest() {
		clearRevealTimer();
		finish();
	}

	function startOver() {
		void loadDeck();
	}

	function skipToFeed() {
		onDone();
	}

	function finishTest() {
		onDone();
	}

	/* --------------------------------------------------------------------- *
	 * Dialog lifecycle — mirrors FilterPanel.svelte: trap focus inside the
	 * sheet, close on Escape, lock background scroll, restore focus on close.
	 * Loads the deck on first open rather than eagerly, since the test may
	 * never be opened in a given session.
	 * --------------------------------------------------------------------- */
	$effect(() => {
		if (!open) return;

		if (!loadedOnce) {
			loadedOnce = true;
			void loadDeck();
		}

		previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		const node = sheetEl;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const focusable = (): HTMLElement[] =>
			node
				? Array.from(
						node.querySelectorAll<HTMLElement>(
							'a[href], button, input, textarea, select, [tabindex]'
						)
					).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)
				: [];

		(focusable()[0] ?? node)?.focus();

		function onKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
				return;
			}

			if (phase === 'playing' && !revealing) {
				if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'y') {
					event.preventDefault();
					answer(true);
					return;
				}
				if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'n') {
					event.preventDefault();
					answer(false);
					return;
				}
			}

			if (event.key !== 'Tab') return;

			const items = focusable();
			if (!items.length) return;
			event.preventDefault();

			const activeEl = document.activeElement as HTMLElement | null;
			const at = activeEl ? items.indexOf(activeEl) : -1;
			const delta = event.shiftKey ? -1 : 1;
			items[(at + delta + items.length) % items.length].focus();
		}

		document.addEventListener('keydown', onKeydown);

		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.body.style.overflow = previousOverflow;
			clearRevealTimer();
			previouslyFocused?.focus();
		};
	});
</script>

{#if open}
	<div class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
		<button
			type="button"
			aria-label="Close taste test"
			onclick={onClose}
			class="bg-ink-950/80 fixed inset-0 cursor-default backdrop-blur-sm"
			transition:fade={{ duration: 200, easing: quintOut }}
		></button>

		<div
			bind:this={sheetEl}
			role="dialog"
			aria-modal="true"
			aria-label="Taste test"
			tabindex="-1"
			class="surface rounded-t-card sm:rounded-card shadow-lift relative z-10 flex max-h-[92dvh]
				w-full flex-col outline-none sm:max-h-[42rem] sm:max-w-md"
			transition:fly={{ y: 40, duration: 320, easing: quintOut }}
		>
			<!-- Header -->
			<div
				class="border-ink-50/8 flex flex-none items-center justify-between gap-3 border-b px-5
					py-4"
			>
				<div class="flex min-w-0 items-center gap-2.5">
					<Sparkles class="text-accent-300 h-4 w-4 flex-none" aria-hidden="true" />
					<h2 class="text-ink-50 truncate text-[15px] font-semibold">Taste test</h2>
				</div>
				<button
					type="button"
					onclick={onClose}
					aria-label="Close taste test"
					class="border-ink-50/10 bg-ink-50/5 text-ink-300 hover:border-ink-50/25 hover:text-ink-50
						flex h-11 w-11 flex-none items-center justify-center rounded-full border
						transition-colors"
				>
					<X class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>

			<!-- Body -->
			<div class="flex min-h-0 flex-1 flex-col px-5 py-5">
				{#if phase === 'loading'}
					<div class="flex flex-1 flex-col items-center justify-center gap-3 py-10">
						<div
							class="border-ink-50/15 border-t-accent-400 h-8 w-8 animate-spin rounded-full border-2"
							aria-hidden="true"
						></div>
						<p class="text-ink-400 font-mono text-[12px]">Shuffling the deck…</p>
					</div>
				{:else if phase === 'error'}
					<div class="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
						<p class="text-ink-100 text-[0.9375rem] leading-relaxed">
							Couldn't load the taste test deck — worth another shot, or skip it entirely.
						</p>
						<div class="flex w-full flex-col gap-2.5">
							<button
								type="button"
								onclick={startOver}
								class="rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex min-h-11 items-center
									justify-center gap-2 px-5 py-3 text-[0.9375rem] font-semibold transition-transform
									duration-150 hover:scale-[1.02] active:scale-[0.99]"
							>
								<RefreshCw class="h-4 w-4" aria-hidden="true" />
								Try again
							</button>
							<button
								type="button"
								onclick={skipToFeed}
								class="rounded-panel border-ink-50/15 bg-ink-50/5 text-ink-100 hover:border-ink-50/25
									flex min-h-11 items-center justify-center gap-2 border px-5 py-2.5
									text-[0.875rem] font-medium transition-colors"
							>
								Just start scrolling
							</button>
							<button
								type="button"
								onclick={onClose}
								class="text-ink-400 hover:text-ink-100 min-h-11 px-5 py-2 font-mono text-[12px]
									transition-colors"
							>
								Back to sign-in options
							</button>
						</div>
					</div>
				{:else if phase === 'playing' && current}
					<!-- Round counter + progress -->
					<div class="flex-none">
						<div class="flex items-center justify-between">
							<p class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">
								Round {index + 1} of {deck.length}
							</p>
							<button
								type="button"
								onclick={skipTheRest}
								class="text-ink-500 hover:text-ink-200 font-mono text-[11px] transition-colors"
							>
								Skip the rest
							</button>
						</div>
						<div class="bg-ink-50/10 rounded-pill mt-2.5 h-1 w-full overflow-hidden">
							<div
								class="bg-accent-500 ease-out-quint rounded-pill h-full transition-all duration-300"
								style="width: {progress * 100}%"
							></div>
						</div>
					</div>

					<!-- Card: echoes RepoCard's anatomy so the gesture teaches the feed -->
					<div class="mt-5 flex min-h-0 flex-1 flex-col">
						{#key current.id}
							<div
								class="rounded-card border-ink-50/10 bg-ink-850/60 flex min-h-0 flex-1 flex-col
									border p-5"
								transition:fade={{ duration: 180, easing: quintOut }}
							>
								<div class="flex items-center gap-2.5">
									<img
										src={current.avatar}
										alt=""
										loading="lazy"
										class="ring-ink-50/10 h-7 w-7 flex-none rounded-full ring-1"
									/>
									<span class="text-ink-300 min-w-0 truncate font-mono text-[13px]">
										{current.full_name.split('/')[0]}
									</span>
								</div>

								<h3 class="text-ink-50 mt-3 truncate text-xl font-semibold">
									{current.name}
								</h3>

								<p class="text-ink-200 mt-2 line-clamp-2 text-[0.875rem] leading-relaxed">
									{current.description || 'No description provided.'}
								</p>

								<dl
									class="text-ink-300 mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5
										font-mono text-[11px] tabular-nums"
								>
									{#if current.language}
										<div class="flex items-center gap-1.5">
											<dt class="sr-only">Language</dt>
											<span class="bg-ink-300 h-2 w-2 flex-none rounded-full"></span>
											<dd>{current.language}</dd>
										</div>
									{/if}
									<div class="flex items-center gap-1.5">
										<dt class="sr-only">Stars</dt>
										<span class="text-spark">★</span>
										<dd class="text-ink-100">{formatCount(current.stargazers_count)}</dd>
									</div>
								</dl>

								{#if current.topics.length}
									<ul class="mt-3.5 flex flex-wrap gap-1.5">
										{#each current.topics.slice(0, 4) as topic (topic)}
											<li
												class="rounded-pill border-ink-50/8 bg-ink-50/4 text-ink-300 border
													px-2.5 py-1 font-mono text-[11px]"
											>
												{topic}
											</li>
										{/each}
									</ul>
								{/if}

								<!-- Inline reveal: the payoff loop that makes the model feel alive -->
								<div class="mt-auto min-h-6 pt-3">
									{#if revealing && revealTopics}
										<p
											class="text-accent-300 font-mono text-[12px]"
											in:fade={{ duration: 150 }}
											aria-live="polite"
										>
											{revealTopics.map((topic) => `+${pretty(topic)}`).join(' ')}
										</p>
									{/if}
								</div>
							</div>
						{/key}
					</div>

					<!-- Keep / skip, reachable by tap or arrow key -->
					<div class="mt-5 flex flex-none items-center gap-3">
						<button
							type="button"
							disabled={revealing}
							onclick={() => answer(false)}
							aria-label="Skip {current.name}"
							class="rounded-panel border-ink-50/15 bg-ink-50/5 text-ink-100 hover:border-danger/40
								hover:text-danger ease-out-quint flex min-h-11 flex-1 items-center justify-center
								gap-2 border py-3 text-[0.9375rem] font-medium transition-colors
								disabled:pointer-events-none disabled:opacity-50"
						>
							<ArrowLeft class="h-4 w-4" aria-hidden="true" />
							Skip
						</button>
						<button
							type="button"
							disabled={revealing}
							onclick={() => answer(true)}
							aria-label="Keep {current.name}"
							class="rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex min-h-11 flex-1
								items-center justify-center gap-2 py-3 text-[0.9375rem] font-semibold
								transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]
								disabled:pointer-events-none disabled:opacity-70"
						>
							<Heart class="h-4 w-4" aria-hidden="true" />
							Keep
						</button>
					</div>
					<p class="text-ink-500 mt-2.5 flex-none text-center font-mono text-[11px]">
						← / N to skip · → / Y to keep
					</p>
				{:else if phase === 'result'}
					<div class="flex flex-1 flex-col items-center justify-center gap-5 py-4 text-center">
						<div
							class="border-accent-500/40 bg-accent-500/10 flex h-14 w-14 items-center
								justify-center rounded-full border"
						>
							<Sparkles class="text-accent-300 h-6 w-6" aria-hidden="true" />
						</div>

						<div>
							<h3 class="text-ink-50 text-xl font-semibold">
								{topTopics.length
									? `You're into ${topTopics.map(pretty).join(', ')}`
									: "You've got range"}
							</h3>
							<p class="text-ink-300 mt-2 text-[0.9375rem] leading-relaxed">
								{topTopics.length
									? "We'll lean the feed towards this, without boxing you in."
									: 'The feed will keep learning from what you scroll past.'}
							</p>
						</div>

						<button
							type="button"
							onclick={finishTest}
							class="rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex min-h-11 w-full
								items-center justify-center gap-2 px-5 py-3 text-[0.9375rem] font-semibold
								transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]"
						>
							Go to your feed
							<ArrowRight class="h-4 w-4" aria-hidden="true" />
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
