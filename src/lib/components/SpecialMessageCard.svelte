<!--
  Purpose: Interjected message cards (get featured, follow along)
  Context: These are asks, not content. They earn a place in the feed by being
           short, clearly labelled as ours, and trivially scrollable past.
-->

<script lang="ts">
	import { Star, Github, ArrowUpRight, ChevronDown } from 'lucide-svelte';
	import type { FeedProject } from '$lib/github/feed';

	type Props = { project: FeedProject };
	const { project }: Props = $props();

	const isGetFeatured = $derived(
		project.name.toLowerCase().includes('featured') ||
			(project.description ?? '').toLowerCase().includes('featured')
	);
	const isTwitter = $derived(project.html_url.includes('twitter.com'));
	const handle = $derived(project.html_url.split('/').pop());
</script>

<article
	class="surface rounded-card shadow-lift relative flex h-full min-h-0 flex-col
		justify-center overflow-hidden px-6 py-10 text-center sm:px-10"
>
	<span
		class="rounded-pill border-ink-50/10 bg-ink-50/5 text-ink-400 absolute top-5 left-1/2
			-translate-x-1/2 border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase"
	>
		From GitTok
	</span>

	<div class="mx-auto flex w-full max-w-md flex-col items-center">
		<h1 class="text-ink-50 text-[1.75rem] leading-tight font-semibold sm:text-4xl">
			{project.name}
		</h1>

		{#if project.description}
			<p class="text-ink-200 mt-3 text-[0.9375rem] leading-relaxed sm:text-base">
				{project.description}
			</p>
		{/if}

		{#if isGetFeatured}
			<ol class="mt-7 w-full space-y-3 text-left">
				<li class="flex items-start gap-3">
					<Star class="text-spark mt-0.5 h-4 w-4 flex-none" />
					<span class="text-ink-200 text-sm leading-relaxed">
						<span class="text-ink-50 font-medium">Star the repo.</span>
						Your pinned projects become eligible for featuring — that's the whole requirement.
					</span>
				</li>
				<li class="flex items-start gap-3">
					<Github class="text-ink-400 mt-0.5 h-4 w-4 flex-none" />
					<span class="text-ink-300 text-sm leading-relaxed">
						Optionally open a PR with your project's details to improve how it's presented.
					</span>
				</li>
			</ol>

			<a
				href="https://github.com/BlackShoreTech/gittok.dev"
				target="_blank"
				rel="noopener noreferrer"
				class="group rounded-panel bg-ink-50 text-ink-950 mt-8 flex w-full items-center justify-center
					gap-2 px-5 py-3 text-[0.9375rem] font-semibold transition-transform
					duration-150 hover:scale-[1.01] active:scale-[0.99]"
			>
				<Star class="h-4 w-4" />
				Star on GitHub
			</a>
		{:else}
			<a
				href={project.html_url}
				target="_blank"
				rel="noopener noreferrer"
				class="group rounded-panel bg-ink-50 text-ink-950 mt-8 flex w-full items-center justify-center
					gap-2 px-5 py-3 text-[0.9375rem] font-semibold transition-transform
					duration-150 hover:scale-[1.01] active:scale-[0.99]"
			>
				{isTwitter ? `Follow @${handle}` : 'Learn more'}
				<ArrowUpRight
					class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5
						group-hover:-translate-y-0.5"
				/>
			</a>
		{/if}

		<p class="text-ink-400 mt-6 flex items-center gap-1.5 font-mono text-[11px]">
			<ChevronDown class="h-3.5 w-3.5" />
			Keep scrolling
		</p>
	</div>
</article>
