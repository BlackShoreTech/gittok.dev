<!--
  Purpose: Choose the topics that shape the feed
  Context: Entirely optional — the feed works without it. So this screen has to
           be fast to use and even faster to leave. Selections save instantly;
           there is no save button to forget.
-->

<script lang="ts">
	import { topics } from '$lib/topics';
	import { topicsStore } from '$lib/stores/topics';
	import { goto } from '$app/navigation';
	import { Search, X, ArrowRight, Plus, Sparkles } from 'lucide-svelte';
	import TopicGroup from '$lib/components/TopicGroup.svelte';
	import AmbientBackdrop from '$lib/components/AmbientBackdrop.svelte';

	// A short, opinionated starting set beats an empty search box.
	const popular = [
		'react',
		'python',
		'rust',
		'typescript',
		'machine-learning',
		'cli',
		'self-hosted',
		'devops',
		'game-development',
		'security'
	];

	let query = $state('');

	const allTopics = flatten(topics);

	function flatten(node: unknown): string[] {
		if (Array.isArray(node)) return node as string[];
		if (node && typeof node === 'object') {
			return Object.entries(node).flatMap(([key, child]) => [key, ...flatten(child)]);
		}
		return [];
	}

	const matches = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return [];
		return [...new Set(allTopics)]
			.filter((topic) => topic.toLowerCase().includes(term) && !$topicsStore.has(topic))
			.slice(0, 8);
	});

	const isNewTopic = $derived(
		query.trim().length > 0 &&
			!allTopics.includes(query.trim().toLowerCase()) &&
			!$topicsStore.has(query.trim().toLowerCase())
	);

	const selected = $derived([...$topicsStore]);
	const pretty = (value: string) => value.replace(/[-_]/g, ' ');

	function pick(topic: string) {
		topicsStore.toggle(topic);
		query = '';
	}

	function submit(event: Event) {
		event.preventDefault();
		const term = query.trim().toLowerCase();
		if (term) pick(matches[0] ?? term);
	}
</script>

<AmbientBackdrop />

<main class="mx-auto min-h-[100dvh] w-full max-w-3xl px-5 pt-16 pb-36 sm:px-6">
	<header>
		<h1 class="text-ink-50 text-[2rem] leading-tight font-semibold sm:text-4xl">
			What are you into?
		</h1>
		<p class="text-ink-300 mt-3 max-w-lg text-[0.9375rem] leading-relaxed">
			Pick a few topics and the feed will lean towards them. Skip it and you'll get everything — you
			can change this at any time.
		</p>
	</header>

	<!-- Search first: the fastest path for anyone who already knows -->
	<form onsubmit={submit} class="relative mt-8">
		<Search
			class="text-ink-500 pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
		/>
		<input
			type="text"
			bind:value={query}
			placeholder="Search topics, or add your own"
			autocomplete="off"
			class="rounded-panel border-ink-50/10 bg-ink-850/70 text-ink-100 placeholder:text-ink-500 hover:border-ink-50/20 focus:border-accent-500/50 w-full
				border py-3.5 pr-4 pl-11
				text-[0.9375rem] backdrop-blur-md transition-colors
				focus:outline-none"
		/>

		{#if matches.length || isNewTopic}
			<div
				class="rounded-panel border-ink-50/10 bg-ink-800/95 shadow-lift absolute inset-x-0 top-full z-20
					mt-2 overflow-hidden border backdrop-blur-xl"
			>
				{#each matches as topic (topic)}
					<button
						type="button"
						onclick={() => pick(topic)}
						class="text-ink-200 hover:bg-ink-50/6 hover:text-ink-50 flex w-full items-center gap-2.5 px-4 py-2.5
							text-left font-mono text-[13px] transition-colors"
					>
						<Plus class="text-ink-500 h-3.5 w-3.5" />
						{pretty(topic)}
					</button>
				{/each}

				{#if isNewTopic}
					<button
						type="button"
						onclick={() => pick(query.trim().toLowerCase())}
						class="border-ink-50/8 text-accent-300 hover:bg-accent-500/10 flex w-full items-center gap-2.5 border-t
							px-4 py-2.5 text-left font-mono text-[13px]
							transition-colors"
					>
						<Plus class="h-3.5 w-3.5" />
						Add "{query.trim().toLowerCase()}"
					</button>
				{/if}
			</div>
		{/if}
	</form>

	<!-- Selected: always visible, always removable -->
	{#if selected.length}
		<section class="mt-8">
			<div class="flex items-center justify-between">
				<h2 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">Selected</h2>
				<button
					onclick={() => topicsStore.reset()}
					class="text-ink-500 hover:text-danger font-mono text-[11px] transition-colors"
				>
					Clear all
				</button>
			</div>

			<ul class="mt-3 flex flex-wrap gap-2">
				{#each selected as topic (topic)}
					<li>
						<button
							onclick={() => topicsStore.toggle(topic)}
							class="group rounded-pill border-accent-500/40 bg-accent-500/15 text-accent-300 hover:border-danger/50 hover:bg-danger/10
								hover:text-danger flex items-center gap-2 border py-1.5 pr-2
								pl-3 font-mono text-[12px] transition-colors"
							aria-label="Remove {pretty(topic)}"
						>
							{pretty(topic)}
							<X class="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<section class="mt-8">
			<h2
				class="text-ink-400 flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] uppercase"
			>
				<Sparkles class="h-3.5 w-3.5" />
				Popular starting points
			</h2>
			<ul class="mt-3 flex flex-wrap gap-2">
				{#each popular as topic (topic)}
					<li>
						<button
							onclick={() => topicsStore.toggle(topic)}
							class="rounded-pill border-ink-50/10 bg-ink-50/3 text-ink-300 hover:border-ink-50/25 hover:text-ink-100 border
								px-3 py-1.5 font-mono text-[12px]
								transition-colors"
						>
							{pretty(topic)}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Browse: secondary to search, so it reads quietly -->
	<section class="mt-10">
		<h2 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">
			Browse everything
		</h2>
		<div
			class="divide-ink-50/6 rounded-card border-ink-50/8 bg-ink-850/40 mt-3 divide-y border p-2"
		>
			{#each Object.entries(topics) as [label, node] (label)}
				<TopicGroup {label} node={node as string[] | Record<string, unknown>} />
			{/each}
		</div>
	</section>
</main>

<!-- Commit bar: the count is the feedback, so nothing needs to be confirmed -->
<div class="border-ink-50/8 bg-ink-900/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl">
	<div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
		<p class="text-ink-400 font-mono text-[12px]" aria-live="polite">
			{selected.length
				? `${selected.length} topic${selected.length === 1 ? '' : 's'} selected`
				: 'No topics — you’ll see everything'}
		</p>

		<button
			onclick={() => goto('/feed')}
			class="group rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex items-center gap-2 px-5
				py-2.5 text-sm font-semibold transition-transform duration-150
				hover:scale-[1.02] active:scale-[0.99]"
		>
			{selected.length ? 'Start scrolling' : 'Skip for now'}
			<ArrowRight class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
		</button>
	</div>
</div>
