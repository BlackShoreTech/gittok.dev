<!--
  Purpose: The reader's explicit, reversible filter sheet for the feed
  Context: Opened from the feed header, never a route of its own. Reads and
           writes filterStore directly, so there is no value prop to wire and
           no change event to forget — closing is the only decision left to
           the parent. Distinct from taste learning: this is a hard, visible
           constraint the reader chose, can always see, and can undo in one
           tap. Picking a topic here must never quietly collapse the feed.
-->

<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { Search, X, Plus, Check, SlidersHorizontal, Star, ArrowRight } from 'lucide-svelte';
	import { filterStore, starBandOptions, isFilterActive, filterCount } from '$lib/stores/filter';
	import { languages, languageColors } from '$lib/github/feed';
	import { topics } from '$lib/topics';
	import TopicGroup from './TopicGroup.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	const { open, onClose }: Props = $props();

	let sheetEl = $state<HTMLElement | null>(null);
	let topicQuery = $state('');
	let previouslyFocused: HTMLElement | null = null;

	const selectedTopics = $derived(new Set($filterStore.topics));
	const activeCount = $derived(filterCount($filterStore));
	const hasActiveFilter = $derived(isFilterActive($filterStore));

	function flatten(node: unknown): string[] {
		if (Array.isArray(node)) return node as string[];
		if (node && typeof node === 'object') {
			return Object.entries(node).flatMap(([key, child]) => [key, ...flatten(child)]);
		}
		return [];
	}

	const allTopics = flatten(topics);

	const topicMatches = $derived.by(() => {
		const term = topicQuery.trim().toLowerCase();
		if (!term) return [];
		return [...new Set(allTopics)]
			.filter((topic) => topic.toLowerCase().includes(term) && !$filterStore.topics.includes(topic))
			.slice(0, 8);
	});

	const isNewTopic = $derived(
		topicQuery.trim().length > 0 &&
			!allTopics.includes(topicQuery.trim().toLowerCase()) &&
			!$filterStore.topics.includes(topicQuery.trim().toLowerCase())
	);

	const pretty = (value: string) => value.replace(/[-_]/g, ' ');

	function pickTopic(topic: string) {
		filterStore.toggleTopic(topic);
		topicQuery = '';
	}

	function submitTopic(event: Event) {
		event.preventDefault();
		const term = topicQuery.trim().toLowerCase();
		if (term) pickTopic(topicMatches[0] ?? term);
	}

	// `languages` values are GitHub qualifiers like "language:typescript"; the
	// display name lives in languageColors' keys, which are already properly
	// cased ("TypeScript", "C++"). Two slugs don't survive a bare lowercase
	// comparison, so they're aliased explicitly instead of guessed at.
	const LANGUAGE_ALIASES: Record<string, string> = { cpp: 'C++', csharp: 'C#' };

	function languageLabel(value: string): string {
		const slug = value.replace('language:', '');
		if (slug in LANGUAGE_ALIASES) return LANGUAGE_ALIASES[slug];
		return Object.keys(languageColors).find((name) => name.toLowerCase() === slug) ?? slug;
	}

	function languageDot(value: string): string {
		return languageColors[languageLabel(value) as keyof typeof languageColors] ?? '#8891a1';
	}

	/* --------------------------------------------------------------------- *
	 * Dialog lifecycle — the only real DOM work in this component: trap focus
	 * inside the sheet, close on Escape, lock background scroll, and hand
	 * focus back to whatever opened it. All of it lives in one effect keyed
	 * on `open` so there is exactly one cleanup path to reason about.
	 * --------------------------------------------------------------------- */
	$effect(() => {
		if (!open) return;

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
			if (event.key !== 'Tab') return;

			const items = focusable();
			if (!items.length) return;
			event.preventDefault();

			const current = document.activeElement as HTMLElement | null;
			const index = current ? items.indexOf(current) : -1;
			const delta = event.shiftKey ? -1 : 1;
			items[(index + delta + items.length) % items.length].focus();
		}

		document.addEventListener('keydown', onKeydown);

		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.body.style.overflow = previousOverflow;
			previouslyFocused?.focus();
		};
	});
</script>

{#if open}
	<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
		<button
			type="button"
			aria-label="Close filters"
			onclick={onClose}
			class="bg-ink-950/70 fixed inset-0 cursor-default backdrop-blur-sm"
			transition:fade={{ duration: 200, easing: quintOut }}
		></button>

		<div
			bind:this={sheetEl}
			role="dialog"
			aria-modal="true"
			aria-label="Filter the feed"
			tabindex="-1"
			class="surface rounded-t-card sm:rounded-card shadow-lift relative z-10 flex max-h-[88dvh]
				w-full flex-col outline-none sm:max-h-[85vh] sm:max-w-lg"
			transition:fly={{ y: 40, duration: 320, easing: quintOut }}
		>
			<!-- Header -->
			<div
				class="border-ink-50/8 flex flex-none items-center justify-between gap-3 border-b px-5
					py-4"
			>
				<div class="flex items-center gap-2.5">
					<SlidersHorizontal class="text-ink-400 h-4 w-4" aria-hidden="true" />
					<h2 class="text-ink-50 text-[15px] font-semibold">Filter the feed</h2>
				</div>
				<button
					type="button"
					onclick={onClose}
					aria-label="Close filters"
					class="border-ink-50/10 bg-ink-50/5 text-ink-300 hover:border-ink-50/25 hover:text-ink-50
						flex h-11 w-11 flex-none items-center justify-center rounded-full border
						transition-colors"
				>
					<X class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>

			<!-- Body: scrolls independently so the header and footer stay pinned -->
			<div class="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
				<!-- Topics: multi-select, search first, browse second -->
				<section>
					<h3 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">Topics</h3>

					<form onsubmit={submitTopic} class="relative mt-3">
						<Search
							class="text-ink-500 pointer-events-none absolute top-1/2 left-3.5 h-4 w-4
								-translate-y-1/2"
							aria-hidden="true"
						/>
						<input
							type="text"
							bind:value={topicQuery}
							placeholder="Search topics, or add your own"
							autocomplete="off"
							class="rounded-panel border-ink-50/10 bg-ink-850/70 text-ink-100 placeholder:text-ink-500
								hover:border-ink-50/20 focus:border-accent-500/50 min-h-11 w-full border py-3 pr-4
								pl-10 text-[0.9375rem] transition-colors focus:outline-none"
						/>

						{#if topicMatches.length || isNewTopic}
							<div
								class="rounded-panel border-ink-50/10 bg-ink-800/95 shadow-lift no-scrollbar
									absolute inset-x-0 top-full z-10 mt-2 max-h-56 overflow-y-auto border
									backdrop-blur-xl"
							>
								{#each topicMatches as topic (topic)}
									<button
										type="button"
										onclick={() => pickTopic(topic)}
										class="text-ink-200 hover:bg-ink-50/6 hover:text-ink-50 flex min-h-11 w-full
											items-center gap-2.5 px-4 py-2.5 text-left font-mono text-[13px]
											transition-colors"
									>
										<Plus class="text-ink-500 h-3.5 w-3.5 flex-none" aria-hidden="true" />
										<span class="min-w-0 truncate">{pretty(topic)}</span>
									</button>
								{/each}

								{#if isNewTopic}
									<button
										type="button"
										onclick={() => pickTopic(topicQuery.trim().toLowerCase())}
										class="border-ink-50/8 text-accent-300 hover:bg-accent-500/10 flex min-h-11
											w-full items-center gap-2.5 border-t px-4 py-2.5 text-left font-mono
											text-[13px] transition-colors"
									>
										<Plus class="h-3.5 w-3.5 flex-none" aria-hidden="true" />
										<span class="min-w-0 truncate">Add "{topicQuery.trim().toLowerCase()}"</span>
									</button>
								{/if}
							</div>
						{/if}
					</form>

					{#if $filterStore.topics.length}
						<ul class="no-scrollbar mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
							{#each $filterStore.topics as topic (topic)}
								<li class="max-w-full">
									<button
										type="button"
										onclick={() => filterStore.toggleTopic(topic)}
										aria-label="Remove {pretty(topic)}"
										class="group rounded-pill border-accent-500/40 bg-accent-500/15 text-accent-300
											hover:border-danger/50 hover:bg-danger/10 hover:text-danger flex min-h-11
											max-w-[220px] items-center gap-2 border py-1.5 pr-2 pl-3 font-mono
											text-[12px] transition-colors"
									>
										<span class="min-w-0 truncate">{pretty(topic)}</span>
										<X
											class="h-3.5 w-3.5 flex-none opacity-50 transition-opacity
												group-hover:opacity-100"
											aria-hidden="true"
										/>
									</button>
								</li>
							{/each}
						</ul>
					{/if}

					<div
						class="divide-ink-50/6 rounded-card border-ink-50/8 bg-ink-850/40 no-scrollbar mt-4
							max-h-72 divide-y overflow-y-auto border p-2"
					>
						{#each Object.entries(topics) as [label, node] (label)}
							<TopicGroup
								{label}
								node={node as string[] | Record<string, unknown>}
								selected={selectedTopics}
								onToggle={filterStore.toggleTopic}
							/>
						{/each}
					</div>
				</section>

				<!-- Language: single-select, "Any" always available -->
				<section class="mt-8">
					<h3 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">Language</h3>
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => filterStore.setLanguage(null)}
							aria-pressed={$filterStore.language === null}
							class="rounded-pill flex min-h-11 items-center gap-1.5 border px-3.5 py-2 font-mono
								text-[12px] transition-colors duration-150
								{$filterStore.language === null
								? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
								: 'border-ink-50/10 bg-ink-50/3 text-ink-300 hover:border-ink-50/25 hover:text-ink-100'}"
						>
							Any language
							{#if $filterStore.language === null}
								<Check class="h-3 w-3" aria-hidden="true" />
							{/if}
						</button>

						{#each languages as lang (lang)}
							{@const isActive = $filterStore.language === lang}
							<button
								type="button"
								onclick={() => filterStore.setLanguage(lang)}
								aria-pressed={isActive}
								class="rounded-pill flex min-h-11 items-center gap-1.5 border px-3.5 py-2 font-mono
									text-[12px] transition-colors duration-150
									{isActive
									? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
									: 'border-ink-50/10 bg-ink-50/3 text-ink-300 hover:border-ink-50/25 hover:text-ink-100'}"
							>
								<span
									class="h-2 w-2 flex-none rounded-full"
									style="background-color: {languageDot(lang)}"
									aria-hidden="true"
								></span>
								{languageLabel(lang)}
								{#if isActive}
									<Check class="h-3 w-3" aria-hidden="true" />
								{/if}
							</button>
						{/each}
					</div>
				</section>

				<!-- Size: the most valuable filter in the product — full rows, not a footnote -->
				<section class="mt-8">
					<h3
						class="text-ink-400 flex items-center gap-2 font-mono text-[11px] tracking-[0.12em]
							uppercase"
					>
						<Star class="text-spark h-3.5 w-3.5" aria-hidden="true" />
						Size
					</h3>

					<div class="mt-3 space-y-2">
						<button
							type="button"
							onclick={() => filterStore.setStarBand(null)}
							aria-pressed={$filterStore.starBand === null}
							class="rounded-panel flex min-h-11 w-full items-center justify-between gap-3 border
								px-4 py-3 text-left transition-colors
								{$filterStore.starBand === null
								? 'border-accent-500/50 bg-accent-500/10'
								: 'border-ink-50/10 bg-ink-50/3 hover:border-ink-50/25'}"
						>
							<span class="text-ink-100 text-sm font-medium">Any size</span>
							{#if $filterStore.starBand === null}
								<Check class="text-accent-300 h-4 w-4 flex-none" aria-hidden="true" />
							{/if}
						</button>

						{#each starBandOptions as option (option.value)}
							{@const isActive = $filterStore.starBand === option.value}
							<button
								type="button"
								onclick={() => filterStore.setStarBand(option.value)}
								aria-pressed={isActive}
								class="rounded-panel flex min-h-11 w-full items-center justify-between gap-3
									border px-4 py-3 text-left transition-colors
									{isActive
									? 'border-accent-500/50 bg-accent-500/10'
									: 'border-ink-50/10 bg-ink-50/3 hover:border-ink-50/25'}"
							>
								<span class="flex min-w-0 flex-col">
									<span class="text-ink-100 text-sm font-medium">{option.label}</span>
									<span class="text-ink-400 font-mono text-[11px]">{option.hint}</span>
								</span>
								{#if isActive}
									<Check class="text-accent-300 h-4 w-4 flex-none" aria-hidden="true" />
								{/if}
							</button>
						{/each}
					</div>
				</section>
			</div>

			<!-- Footer: pinned. The count is the only truth the reader needs at a glance. -->
			<div
				class="border-ink-50/8 flex flex-none flex-col border-t px-5 py-4"
				style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
			>
				<div class="flex items-center justify-between gap-4">
					<div class="flex min-w-0 flex-col items-start gap-1">
						<p aria-live="polite" class="text-ink-200 font-mono text-[12px] tabular-nums">
							{activeCount > 0
								? `${activeCount} filter${activeCount === 1 ? '' : 's'} applied`
								: 'No filters — showing everything'}
						</p>
						{#if hasActiveFilter}
							<button
								type="button"
								onclick={() => filterStore.clear()}
								class="text-ink-500 hover:text-danger -m-2 p-2 font-mono text-[11px]
									transition-colors"
							>
								Clear all
							</button>
						{/if}
					</div>

					<button
						type="button"
						onclick={onClose}
						class="rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex min-h-11 flex-none
							items-center justify-center gap-2 px-5 py-3 text-[0.9375rem] font-semibold
							transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]"
					>
						{activeCount > 0 ? 'Show results' : 'Done'}
					</button>
				</div>

				<!-- Not a filter — a separate, implicit system. Kept apart on purpose. -->
				<div class="border-ink-50/6 mt-3 flex justify-end border-t pt-3">
					<a
						href="/setup"
						class="text-ink-500 hover:text-ink-200 -m-2 flex min-h-11 items-center gap-1 p-2
							font-mono text-[11px] transition-colors"
					>
						Personalisation
						<ArrowRight class="h-3 w-3" aria-hidden="true" />
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}
