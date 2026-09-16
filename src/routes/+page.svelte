<!--
  Purpose: Landing page — convince someone to start scrolling, in one screen
  Context: One job, one primary action. The product itself is the argument, so
           a real repository card does the selling instead of a feature list.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { Star, GitFork, ArrowRight, MessageSquareQuote } from 'lucide-svelte';
	import GithubIcon from '$lib/components/icons/GithubIcon.svelte';
	import AmbientBackdrop from '$lib/components/AmbientBackdrop.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { topicsStore } from '$lib/stores/topics';

	const structuredData = {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'GitTok',
		url: 'https://gittok.dev/',
		applicationCategory: 'DeveloperApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires JavaScript.',
		description:
			'A full-screen, swipeable feed of GitHub repositories. Read the README, star what is good, keep scrolling.',
		image: 'https://gittok.dev/og-image.png',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
		author: { '@type': 'Person', name: 'Brendan Scullion' }
	};

	let currentQuote = $state(0);
	let returning = $state(false);

	const quotes = [
		{
			text: 'I spent 2 hours scrolling again. But this time, it was neither mindlessly, nor a waste of time.',
			author: 'WittyWithoutWorry'
		},
		{ text: 'Actually addicting lol', author: 'AkhilSundaram' },
		{
			text: 'Very cool idea, was fun scrolling through it for a bit',
			author: 'Previous-Tune-8896'
		},
		{
			text: 'Pretty cool. Would love to be able to filter by tags, keywords etc.',
			author: 'AvidCoco'
		}
	];

	onMount(() => {
		returning = localStorage.getItem('hasVisitedGitTok') === 'true';
		localStorage.setItem('hasVisitedGitTok', 'true');

		const interval = setInterval(() => {
			currentQuote = (currentQuote + 1) % quotes.length;
		}, 6000);
		return () => clearInterval(interval);
	});
</script>

<Seo
	title="GitTok — Discover Trending GitHub Projects"
	description="A full-screen, swipeable feed of GitHub repositories. Read the README, star what's good, keep scrolling. The same habit, pointed somewhere useful."
	path="/"
	imageAlt="GitTok — a TikTok-style feed for discovering GitHub repositories"
/>

<svelte:head>
	{@html `<script type="application/ld+json">${JSON.stringify(structuredData)}<\/script>`}
</svelte:head>

<AmbientBackdrop />

<main class="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-14">
	<div class="w-full max-w-5xl" in:fade={{ duration: 400 }}>
		<div class="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
			<!-- Pitch -->
			<div class="text-center lg:text-left">
				<span
					class="rounded-pill border-ink-50/10 bg-ink-50/4 text-ink-300 inline-flex items-center gap-2
						border px-3 py-1.5 font-mono text-[11px]"
				>
					<span class="bg-signal h-1.5 w-1.5 rounded-full"></span>
					Fresh repositories, every scroll
				</span>

				<h1
					class="text-ink-50 mt-6 text-[2.75rem] leading-[1.05] font-semibold sm:text-6xl
						lg:text-[4rem]"
				>
					Get addicted
					<span
						class="from-accent-300 to-accent-500 block bg-gradient-to-r bg-clip-text text-transparent"
					>
						to code
					</span>
				</h1>

				<p class="text-ink-300 mx-auto mt-5 max-w-md text-base leading-relaxed lg:mx-0 lg:text-lg">
					A full-screen feed of GitHub repositories. Read the README, star what's good, keep
					scrolling. The same habit, pointed somewhere useful.
				</p>

				<div
					class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center
						lg:justify-start"
				>
					<a
						href="/feed"
						class="group rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex w-full items-center
							justify-center gap-2 px-6 py-3.5 text-[0.9375rem] font-semibold
							transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99] sm:w-auto"
					>
						{returning ? 'Keep scrolling' : 'Start scrolling'}
						<ArrowRight
							class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
						/>
					</a>

					<a
						href="/setup"
						class="rounded-panel border-ink-50/12 text-ink-200 hover:border-ink-50/25 hover:text-ink-50 flex w-full
							items-center justify-center gap-2 border px-6 py-3.5
							text-[0.9375rem] transition-colors sm:w-auto"
					>
						{$topicsStore.size > 0 ? `${$topicsStore.size} topics picked` : 'Pick your topics'}
					</a>
				</div>

				<!-- Social proof: real quotes, one at a time, no carousel chrome -->
				<div class="mt-10 h-24 lg:h-20">
					{#key currentQuote}
						<figure class="relative pl-7 text-left" in:fly={{ y: 8, duration: 450 }}>
							<MessageSquareQuote class="text-ink-500 absolute top-0.5 left-0 h-4 w-4" />
							<blockquote class="text-ink-200 text-sm leading-relaxed">
								"{quotes[currentQuote].text}"
							</blockquote>
							<figcaption class="text-ink-500 mt-1.5 font-mono text-[11px]">
								{quotes[currentQuote].author} &middot; r/programming
							</figcaption>
						</figure>
					{/key}
				</div>
			</div>

			<!-- Proof: a real card, cropped, so the product sells itself -->
			<div class="relative hidden lg:block" in:fly={{ y: 24, duration: 700, delay: 120 }}>
				<div class="surface rounded-card shadow-lift overflow-hidden" aria-hidden="true">
					<div class="px-6 pt-6">
						<div class="flex items-center gap-2.5">
							<div
								class="from-accent-400 to-accent-600 h-7 w-7 rounded-full bg-gradient-to-br"
							></div>
							<span class="text-ink-300 font-mono text-[13px]">sveltejs</span>
						</div>

						<h2 class="text-ink-50 mt-3 text-3xl font-semibold">svelte</h2>
						<p class="text-ink-200 mt-2 text-[0.9375rem]">Web development for the rest of us</p>

						<div
							class="text-ink-300 mt-4 flex items-center gap-4 font-mono text-[12px] tabular-nums"
						>
							<span class="flex items-center gap-1.5">
								<span class="h-2 w-2 rounded-full" style="background-color:#ff3e00"></span>
								Svelte
							</span>
							<span class="flex items-center gap-1.5">
								<Star class="text-spark h-3.5 w-3.5" />
								<span class="text-ink-100">82k</span>
							</span>
							<span class="flex items-center gap-1.5">
								<GitFork class="h-3.5 w-3.5" />
								4.4k
							</span>
							<span class="flex items-center gap-1.5">
								<span class="bg-signal h-1.5 w-1.5 rounded-full"></span>
								today
							</span>
						</div>
					</div>

					<div class="readme-content mask-fade-b mt-5 max-h-64 overflow-hidden px-6">
						<h2>Svelte</h2>
						<p>
							Svelte is a new way to build web applications. It's a compiler that takes your
							declarative components and converts them into efficient JavaScript that surgically
							updates the DOM.
						</p>
						<pre><code>npm create svelte@latest my-app</code></pre>
						<h3>Why Svelte?</h3>
						<p>No virtual DOM, no runtime overhead, and markup that stays close to HTML.</p>
					</div>

					<div class="px-6 pt-3 pb-6">
						<div
							class="rounded-panel bg-ink-50 text-ink-950 flex items-center justify-center gap-2 px-5
								py-3 text-[0.9375rem] font-semibold"
						>
							Open on GitHub
						</div>
					</div>
				</div>

				<!-- The next card, peeking, to communicate the scroll idiom -->
				<div
					class="surface rounded-card absolute inset-x-6 -bottom-5 -z-10 h-16 opacity-60"
					aria-hidden="true"
				></div>
			</div>
		</div>

		<footer
			class="border-ink-50/6 text-ink-500 mt-14 flex flex-col items-center gap-3 border-t pt-6
				text-center font-mono text-[11px] sm:flex-row sm:justify-between sm:text-left"
		>
			<span>Built by Brendan Scullion</span>
			<a
				href="https://github.com/BlackShoreTech/gittok.dev"
				target="_blank"
				rel="noopener noreferrer"
				class="hover:text-ink-200 flex items-center gap-1.5 transition-colors"
			>
				<GithubIcon class="h-3.5 w-3.5" />
				Source on GitHub
			</a>
		</footer>
	</div>
</main>
