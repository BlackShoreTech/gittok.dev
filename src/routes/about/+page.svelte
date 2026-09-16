<!--
  Purpose: Explain what GitTok is, how to get a project featured, and who built it
  Context: The feed links here, so this page has to lead somewhere — a way back
           sits at the top. One primary action only: starring the repo, which is
           the entire featuring mechanism.
-->

<script lang="ts">
	import {
		ArrowLeft,
		ArrowUpRight,
		GitPullRequest,
		Github,
		Globe,
		Share2,
		Star,
		Twitter
	} from 'lucide-svelte';
	import AmbientBackdrop from '$lib/components/AmbientBackdrop.svelte';

	const REPO = 'https://github.com/BlackShoreTech/gittok.dev';

	// Secondary asks — genuinely optional, so they read as a quiet list
	const extras = [
		{
			icon: GitPullRequest,
			title: 'Open a pull request',
			detail: 'Add your project’s details so it can be described properly.',
			href: REPO
		},
		{
			icon: Share2,
			title: 'Share GitTok',
			detail: 'More people scrolling means more eyes on the repositories in the feed.',
			href: null
		},
		{
			icon: Twitter,
			title: 'Follow along',
			detail: 'New features get posted first on Twitter.',
			href: 'https://twitter.com/brsc2909'
		}
	];

	const links = [
		{ icon: Globe, label: 'coso.ai', detail: 'Social media co-pilot', href: 'https://coso.ai' },
		{
			icon: Globe,
			label: 'brendanscullion.com',
			detail: 'Personal site',
			href: 'https://brendanscullion.com'
		},
		{
			icon: Twitter,
			label: '@brsc2909',
			detail: 'Twitter',
			href: 'https://twitter.com/brsc2909'
		}
	];
</script>

<AmbientBackdrop />

<main class="mx-auto min-h-[100dvh] w-full max-w-3xl px-5 pt-16 pb-24 sm:px-6">
	<!-- The feed sends people here; this is the way out -->
	<a
		href="/feed"
		class="group text-ink-400 hover:text-ink-100 inline-flex items-center gap-2 font-mono
			text-[12px] transition-colors"
	>
		<ArrowLeft class="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
		Back to feed
	</a>

	<header class="mt-8">
		<h1 class="text-ink-50 text-[2rem] leading-tight font-semibold sm:text-4xl">About GitTok</h1>
		<p class="text-ink-300 mt-3 max-w-lg text-[0.9375rem] leading-relaxed">
			A TikTok-style interface for discovering GitHub repositories. Scroll the feed, read the
			README, and find the project you didn’t know you were looking for.
		</p>
	</header>

	<!-- Featuring: one requirement, stated plainly, with the action attached -->
	<section class="mt-12">
		<h2 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">
			Get your project featured
		</h2>

		<div class="surface rounded-card shadow-lift mt-3 p-5 sm:p-6">
			<div class="flex items-start gap-3">
				<Star class="text-spark mt-0.5 h-4 w-4 flex-none" />
				<div>
					<p class="text-ink-100 text-[0.9375rem] leading-relaxed">
						Star the GitTok repository. That’s all of it.
					</p>
					<p class="text-ink-300 mt-2 text-[0.9375rem] leading-relaxed">
						Once you’ve starred it, your pinned repositories become eligible to appear in the feed.
						There is no form and no waiting list.
					</p>
				</div>
			</div>

			<a
				href={REPO}
				target="_blank"
				rel="noopener noreferrer"
				class="group rounded-panel bg-ink-50 text-ink-950 ease-out-quint mt-5 flex w-full items-center
					justify-center gap-2 px-6 py-3.5 text-[0.9375rem] font-semibold
					transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99] sm:w-auto"
			>
				<Github class="h-4 w-4" />
				Star on GitHub
			</a>
		</div>
	</section>

	<!-- Everything below is optional, and reads that way -->
	<section class="mt-10">
		<h2 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">Also appreciated</h2>

		<ul class="divide-ink-50/6 rounded-card border-ink-50/8 bg-ink-850/40 mt-3 divide-y border">
			{#each extras as item (item.title)}
				<li>
					{#if item.href}
						<a
							href={item.href}
							target="_blank"
							rel="noopener noreferrer"
							class="group hover:bg-ink-50/4 flex items-start gap-3 px-4 py-3.5 transition-colors"
						>
							<item.icon class="text-ink-500 mt-0.5 h-4 w-4 flex-none" />
							<div class="min-w-0 flex-1">
								<span class="text-ink-100 text-[0.9375rem]">{item.title}</span>
								<p class="text-ink-400 mt-0.5 text-sm leading-relaxed">{item.detail}</p>
							</div>
							<ArrowUpRight
								class="text-ink-600 group-hover:text-ink-300 mt-0.5 h-3.5 w-3.5 flex-none
									transition-colors"
							/>
						</a>
					{:else}
						<div class="flex items-start gap-3 px-4 py-3.5">
							<item.icon class="text-ink-500 mt-0.5 h-4 w-4 flex-none" />
							<div class="min-w-0 flex-1">
								<span class="text-ink-100 text-[0.9375rem]">{item.title}</span>
								<p class="text-ink-400 mt-0.5 text-sm leading-relaxed">{item.detail}</p>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-10">
		<h2 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">Creator</h2>

		<p class="text-ink-300 mt-3 max-w-lg text-[0.9375rem] leading-relaxed">
			Built by Brendan Scullion, who wanted to find out whether scrolling GitHub could be as
			addictive as scrolling anything else. It can.
		</p>

		<ul class="mt-4 flex flex-col gap-2">
			{#each links as link (link.href)}
				<li>
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="group rounded-panel border-ink-50/8 bg-ink-50/3 hover:border-ink-50/20 flex items-center
							gap-3 border px-4 py-3 transition-colors"
					>
						<link.icon class="text-ink-500 h-4 w-4 flex-none" />
						<span
							class="text-ink-200 group-hover:text-ink-50 font-mono text-[12px] transition-colors"
						>
							{link.label}
						</span>
						<span class="text-ink-500 truncate font-mono text-[11px]">{link.detail}</span>
						<ArrowUpRight
							class="text-ink-600 group-hover:text-ink-300 ml-auto h-3.5 w-3.5 flex-none
								transition-colors"
						/>
					</a>
				</li>
			{/each}
		</ul>
	</section>

	<footer
		class="border-ink-50/6 text-ink-500 mt-14 flex flex-col items-center gap-3 border-t pt-6
			text-center font-mono text-[11px] sm:flex-row sm:justify-between sm:text-left"
	>
		<span>Built by Brendan Scullion</span>
		<a
			href={REPO}
			target="_blank"
			rel="noopener noreferrer"
			class="hover:text-ink-200 flex items-center gap-1.5 transition-colors"
		>
			<Github class="h-3.5 w-3.5" />
			Source on GitHub
		</a>
	</footer>
</main>
