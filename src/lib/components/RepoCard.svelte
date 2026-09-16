<!--
  Purpose: The primary feed surface — one repository, one screen
  Context: Answers a single question: "is this repo worth my attention?"
           Identity and proof sit above the fold; the README is the evidence;
           opening it on GitHub is the single dominant action.
-->

<script lang="ts">
	import { Star, GitFork, Share2, ArrowUpRight, RefreshCw } from 'lucide-svelte';
	import type { FeedProject } from '$lib/github/feed';
	import { languageColors } from '$lib/github/feed';
	import { formatCount, timeAgo, isActive } from '$lib/format';
	import ReadmeSkeleton from './ReadmeSkeleton.svelte';
	import posthog from 'posthog-js';

	type Props = {
		project: FeedProject;
		renderMarkdown: (content: string, repo: string) => string;
		shareProject: (project: FeedProject) => Promise<void>;
		retryReadme?: () => void;
		/** Highlights the card as promoted placement. Must stay visibly labelled. */
		promoted?: boolean;
	};

	const { project, renderMarkdown, shareProject, retryReadme, promoted = false }: Props = $props();

	const owner = $derived(project.full_name.split('/')[0]);
	const repoUrl = $derived(`https://github.com/${owner}/${project.name}`);
	const languageColor = $derived(
		project.language
			? (languageColors[project.language as keyof typeof languageColors] ?? '#8891a1')
			: '#8891a1'
	);
	const topics = $derived((project.topics ?? []).slice(0, 4));

	// Keep the README pinned to its opening lines when a card is recycled.
	const scrollToTop = (node: HTMLElement) => {
		node.scrollTop = 0;
		return { update: () => void (node.scrollTop = 0) };
	};
</script>

<div class="relative flex h-full min-h-0 flex-col">
	<article
		class="surface rounded-card shadow-lift relative flex min-h-0 flex-1 flex-col overflow-hidden
			{promoted ? 'ring-accent-500/40 ring-1' : ''}"
	>
		<!-- Identity: who made this, how healthy is it -->
		<header class="flex-none px-5 pt-5 sm:px-7 sm:pt-6">
			<div class="flex items-center gap-2.5">
				<img
					src={project.avatar}
					alt=""
					loading="lazy"
					class="ring-ink-50/10 h-7 w-7 rounded-full ring-1"
				/>
				<span class="text-ink-300 min-w-0 truncate font-mono text-[13px]">
					{owner}
				</span>
				{#if promoted}
					<span
						class="rounded-pill border-accent-500/40 bg-accent-500/10 text-accent-300 ml-auto flex-none
							border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase"
					>
						Promoted
					</span>
				{/if}
			</div>

			<h1 class="text-ink-50 mt-3 text-[1.75rem] leading-[1.1] font-semibold sm:text-4xl">
				{project.name}
			</h1>

			{#if project.description}
				<p class="text-ink-200 mt-2.5 line-clamp-2 text-[0.9375rem] leading-relaxed sm:text-base">
					{project.description}
				</p>
			{/if}

			<!-- Proof strip: scannable in one pass, tabular so it never jitters -->
			<dl
				class="text-ink-300 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px]
					tabular-nums"
			>
				{#if project.language}
					<div class="flex items-center gap-1.5">
						<dt class="sr-only">Language</dt>
						<span class="h-2 w-2 flex-none rounded-full" style="background-color: {languageColor}"
						></span>
						<dd>{project.language}</dd>
					</div>
				{/if}
				<div class="flex items-center gap-1.5">
					<dt class="sr-only">Stars</dt>
					<Star class="text-spark h-3.5 w-3.5" aria-hidden="true" />
					<dd class="text-ink-100">{formatCount(project.stargazers_count)}</dd>
				</div>
				{#if project.forks_count > 0}
					<div class="flex items-center gap-1.5">
						<dt class="sr-only">Forks</dt>
						<GitFork class="h-3.5 w-3.5" aria-hidden="true" />
						<dd>{formatCount(project.forks_count)}</dd>
					</div>
				{/if}
				{#if project.updated_at}
					<div class="flex items-center gap-1.5">
						<dt class="sr-only">Last push</dt>
						{#if isActive(project.updated_at)}
							<span class="bg-signal h-1.5 w-1.5 rounded-full" aria-hidden="true"></span>
						{/if}
						<dd>{timeAgo(project.updated_at)}</dd>
					</div>
				{/if}
			</dl>

			{#if topics.length}
				<ul class="mt-3.5 flex flex-wrap gap-1.5">
					{#each topics as topic (topic)}
						<li
							class="rounded-pill border-ink-50/8 bg-ink-50/4 text-ink-300 border px-2.5
								py-1 font-mono text-[11px]"
						>
							{topic}
						</li>
					{/each}
				</ul>
			{/if}
		</header>

		<!-- Evidence: the README does the convincing -->
		<div class="relative mt-5 min-h-0 flex-1">
			<div
				use:scrollToTop
				class="no-scrollbar mask-fade-b h-full overflow-hidden px-5 pe-16 pb-8 sm:px-7 sm:pe-20
					lg:pe-7"
			>
				{#if project.readmeError}
					<div class="flex h-full flex-col items-start justify-center gap-3">
						<p class="text-ink-300 text-sm">This README couldn't be loaded.</p>
						{#if retryReadme}
							<button
								onclick={retryReadme}
								class="rounded-pill border-ink-50/12 text-ink-100 hover:bg-ink-50/6 flex items-center gap-2 border
									px-3.5 py-1.5 font-mono text-xs transition-colors"
							>
								<RefreshCw class="h-3.5 w-3.5" />
								Try again
							</button>
						{/if}
					</div>
				{:else if !project.readmeSnippet}
					<ReadmeSkeleton />
				{:else}
					<div class="readme-content">
						<!-- renderMarkdown runs every README through DOMPurify with an explicit
							 tag and attribute allowlist before it reaches here. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderMarkdown(
							project.readmeSnippet,
							`https://github.com/${owner}/${project.name}/${project.default_branch}/`
						)}
					</div>
				{/if}
			</div>
		</div>

		<!-- The single dominant action -->
		<footer class="flex-none px-5 pt-3 pb-5 sm:px-7 sm:pb-6">
			<a
				href={repoUrl}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => posthog.capture('view_repository', { repository: project.full_name })}
				class="group rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex w-full items-center
					justify-center gap-2 px-5 py-3 text-[0.9375rem] font-semibold
					transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]"
			>
				Open on GitHub
				<ArrowUpRight
					class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5
						group-hover:-translate-y-0.5"
				/>
			</a>
		</footer>
	</article>

	<!-- Action rail: overlays the card on narrow screens, sits in the gutter on wide ones -->
	<div
		class="absolute right-3 bottom-24 flex flex-col items-center gap-3 sm:right-4 lg:-right-[4.5rem]
			lg:bottom-28"
	>
		<div class="flex flex-col items-center gap-1">
			<a
				href={project.stargazersUrl}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => posthog.capture('star_repository', { repository: project.full_name })}
				class="border-ink-50/10 bg-ink-800/80 ease-out-quint hover:border-spark/40 flex h-11 w-11 items-center
					justify-center rounded-full border backdrop-blur-md transition-all
					duration-150 hover:scale-110 active:scale-95"
				aria-label="Star {project.name} on GitHub ({formatCount(project.stargazers_count)} stars)"
			>
				<Star class="text-spark h-5 w-5" />
			</a>
			<span class="text-ink-300 font-mono text-[11px] tabular-nums">
				{formatCount(project.stargazers_count)}
			</span>
		</div>

		<div class="flex flex-col items-center gap-1">
			<a
				href={project.forksUrl}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => posthog.capture('fork_repository', { repository: project.full_name })}
				class="border-ink-50/10 bg-ink-800/80 ease-out-quint hover:border-ink-50/25 flex h-11 w-11 items-center
					justify-center rounded-full border backdrop-blur-md transition-all
					duration-150 hover:scale-110 active:scale-95"
				aria-label="Fork {project.name} on GitHub"
			>
				<GitFork class="text-ink-200 h-5 w-5" />
			</a>
			<span class="text-ink-300 font-mono text-[11px] tabular-nums">
				{project.forks_count > 0 ? formatCount(project.forks_count) : 'Fork'}
			</span>
		</div>

		<div class="flex flex-col items-center gap-1">
			<button
				onclick={() => {
					posthog.capture('share_repository', { repository: project.full_name });
					shareProject(project);
				}}
				class="border-ink-50/10 bg-ink-800/80 ease-out-quint hover:border-accent-400/40 flex h-11 w-11 items-center
					justify-center rounded-full border backdrop-blur-md transition-all
					duration-150 hover:scale-110 active:scale-95"
				aria-label="Share {project.name}"
			>
				<Share2 class="text-ink-200 h-5 w-5" />
			</button>
			<span class="text-ink-300 font-mono text-[11px]">Share</span>
		</div>
	</div>
</div>
