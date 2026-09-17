<!--
  Purpose: Solve cold start for the taste-learning engine, by recognition not recall
  Context: Entirely optional — the feed works without it, and door 3 always
           reaches it in one tap. Three doors, ranked by effort: import GitHub
           stars (years of judgement already recorded), the 20-second swipe
           taste test (fun, and a tutorial for the feed's own gesture), or just
           start scrolling. Topic filtering itself lives in the feed's
           FilterPanel now — this screen never applies a hard filter.
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { LogIn, Sparkles, ArrowRight, RefreshCw, Check, Brain, Trash2 } from 'lucide-svelte';
	import posthog from 'posthog-js';

	import AmbientBackdrop from '$lib/components/AmbientBackdrop.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import TasteTest, { type DeckEntry } from '$lib/components/TasteTest.svelte';

	import {
		loadProfile,
		saveProfile,
		clearProfile,
		topAffinities,
		observeRepos
	} from '$lib/taste/profile';
	import { applySignal } from '$lib/taste/attribution';
	import { importFromStars, type ImportResult } from '$lib/taste/import';
	import { isAuthConfigured } from '$lib/github/config';
	import { session, beginSignIn } from '$lib/github/auth';
	import { NotAuthenticatedError } from '$lib/github/stars';

	const authAvailable = isAuthConfigured();
	const pretty = (value: string) => value.replace(/[-_]/g, ' ');

	let profile = $state(loadProfile());

	/* --------------------------------------------------------------------- *
	 * Door 1 — import GitHub stars
	 * --------------------------------------------------------------------- */
	type ImportState = 'idle' | 'importing' | 'done' | 'error';

	let importState = $state<ImportState>('idle');
	let importResult = $state<ImportResult | null>(null);
	let importErrorMessage = $state<string | null>(null);

	async function handleImportStars() {
		if (!$session) {
			beginSignIn(window.location.pathname + window.location.search);
			return;
		}

		importState = 'importing';
		importErrorMessage = null;

		try {
			const result = await importFromStars(profile);
			profile = result.profile;
			saveProfile(profile);
			importResult = result;
			importState = 'done';
			justReset = false;
			posthog.capture('taste_import_completed', { imported: result.imported });
		} catch (error) {
			if (error instanceof NotAuthenticatedError) {
				beginSignIn(window.location.pathname + window.location.search);
				return;
			}
			importErrorMessage =
				error instanceof Error ? error.message : "Couldn't read your stars — try again.";
			importState = 'error';
			posthog.capture('taste_import_failed');
		}
	}

	/* --------------------------------------------------------------------- *
	 * Door 2 — swipe taste test
	 * --------------------------------------------------------------------- */
	let showTasteTest = $state(false);

	// Called the moment the test ends, not when the reader clicks through to the
	// feed. Dismissing the result screen used to throw away all eight answers —
	// the worst possible outcome for someone who just did the work.
	function handleTasteTestAnswers(result: { liked: DeckEntry[]; skipped: DeckEntry[] }) {
		const { liked, skipped } = result;
		if (!liked.length && !skipped.length) return;

		// Corpus first: rarity weighting needs a denominator before any signal
		// is attributed against it.
		profile = observeRepos(profile, [...liked, ...skipped]);
		for (const repo of liked) {
			profile = applySignal(profile, {
				kind: 'star',
				topics: repo.topics,
				language: repo.language
			});
		}
		for (const repo of skipped) {
			profile = applySignal(profile, {
				kind: 'not_interested',
				topics: repo.topics,
				language: repo.language
			});
		}
		saveProfile(profile);
		justReset = false;
	}

	/* --------------------------------------------------------------------- *
	 * "What GitTok has learned" — visibility + reset for the taste profile.
	 * Reset is destructive (doc 07, Tier 3), so it needs an explicit two-step
	 * confirm and explicit completion feedback rather than a silent wipe.
	 * --------------------------------------------------------------------- */
	let confirmingReset = $state(false);
	let justReset = $state(false);

	const learnedTopics = $derived(topAffinities(profile, 10));
	const hasLearned = $derived(learnedTopics.length > 0);

	function confirmReset() {
		profile = clearProfile();
		confirmingReset = false;
		justReset = true;
		posthog.capture('taste_profile_reset');
	}
</script>

<Seo
	title="Set Up Your Feed — GitTok"
	description="Give the feed a head start: import your GitHub stars, take a 20-second taste test, or just start scrolling."
	path="/setup"
	imageAlt="Give the GitTok feed a head start"
/>

<AmbientBackdrop />

<main class="mx-auto min-h-[100dvh] w-full max-w-xl px-5 pt-16 pb-16 sm:px-6">
	<header>
		<h1 class="text-ink-50 text-[2rem] leading-tight font-semibold sm:text-4xl">
			Give the feed a head start
		</h1>
		<p class="text-ink-300 mt-3 max-w-md text-[0.9375rem] leading-relaxed">
			Entirely optional, and skippable any time. Pick whichever gets you into repos fastest.
		</p>
	</header>

	<div class="mt-9 flex flex-col gap-4">
		<!-- Door 1: recommended — one tap, uses judgement already recorded -->
		{#if authAvailable}
			<section
				class="rounded-card border-accent-500/30 bg-ink-850/70 shadow-pop relative overflow-hidden
					border p-5 sm:p-6"
			>
				<span
					class="rounded-pill border-accent-500/40 bg-accent-500/15 text-accent-300 inline-flex
						items-center border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase"
				>
					Recommended · one tap
				</span>

				<div class="mt-4 flex items-start gap-4">
					<div
						class="border-accent-500/30 bg-accent-500/10 flex h-11 w-11 flex-none items-center
							justify-center rounded-full border"
					>
						<LogIn class="text-accent-300 h-5 w-5" aria-hidden="true" />
					</div>
					<div class="min-w-0">
						<h2 class="text-ink-50 text-lg font-semibold">Use my GitHub stars</h2>
						<p class="text-ink-300 mt-1 text-[0.875rem] leading-relaxed">
							Years of exactly this judgement, already recorded. We'll read what you've starred and
							skip the guesswork.
						</p>
					</div>
				</div>

				<div class="mt-5">
					{#if importState === 'idle'}
						<button
							type="button"
							onclick={handleImportStars}
							class="rounded-panel bg-ink-50 text-ink-950 ease-out-quint flex min-h-11 w-full
								items-center justify-center gap-2 px-5 py-3 text-[0.9375rem] font-semibold
								transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]"
						>
							{$session ? 'Import my stars' : 'Connect GitHub'}
							<ArrowRight class="h-4 w-4" aria-hidden="true" />
						</button>
					{:else if importState === 'importing'}
						<div
							class="border-ink-50/10 bg-ink-50/5 rounded-panel flex min-h-11 w-full
								items-center justify-center gap-2.5 border px-5 py-3"
							aria-busy="true"
						>
							<div
								class="border-ink-50/20 border-t-accent-400 h-4 w-4 animate-spin rounded-full
									border-2"
								aria-hidden="true"
							></div>
							<span class="text-ink-200 text-[0.875rem]">Reading your stars…</span>
						</div>
					{:else if importState === 'done' && importResult}
						<div class="border-signal/20 bg-signal/8 rounded-panel border px-4 py-3.5">
							<div class="flex items-center gap-2">
								<Check class="text-signal h-4 w-4 flex-none" aria-hidden="true" />
								<p class="text-ink-100 text-[0.875rem] font-medium">
									{importResult.imported > 0
										? `Imported ${importResult.imported} starred ${importResult.imported === 1 ? 'repo' : 'repos'}`
										: "Connected — didn't find enough tagged stars to learn from"}
								</p>
							</div>
							{#if importResult.topTopics.length}
								<ul class="mt-2.5 flex flex-wrap gap-1.5">
									{#each importResult.topTopics as topic (topic)}
										<li
											class="rounded-pill border-accent-500/30 bg-accent-500/10 text-accent-300
												border px-2.5 py-1 font-mono text-[11px]"
										>
											{pretty(topic)}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<button
							type="button"
							onclick={() => goto(resolve('/feed'))}
							class="rounded-panel bg-ink-50 text-ink-950 ease-out-quint mt-3 flex min-h-11 w-full
								items-center justify-center gap-2 px-5 py-3 text-[0.9375rem] font-semibold
								transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]"
						>
							Go to your feed
							<ArrowRight class="h-4 w-4" aria-hidden="true" />
						</button>
					{:else if importState === 'error'}
						<div class="border-danger/25 bg-danger/8 rounded-panel border px-4 py-3.5">
							<p class="text-ink-100 text-[0.875rem] leading-relaxed">
								{importErrorMessage}
							</p>
						</div>
						<button
							type="button"
							onclick={handleImportStars}
							class="rounded-panel border-ink-50/15 bg-ink-50/5 text-ink-100 hover:border-ink-50/25
								mt-3 flex min-h-11 w-full items-center justify-center gap-2 border px-5 py-2.5
								text-[0.875rem] font-medium transition-colors"
						>
							<RefreshCw class="h-4 w-4" aria-hidden="true" />
							Try again
						</button>
					{/if}
				</div>
			</section>
		{/if}

		<!-- Door 2: the fun path, and a tutorial for the feed's own gesture -->
		<section class="rounded-card border-ink-50/10 bg-ink-850/40 border p-5 sm:p-6">
			<div class="flex items-start gap-4">
				<div
					class="border-ink-50/12 bg-ink-50/5 flex h-11 w-11 flex-none items-center justify-center
						rounded-full border"
				>
					<Sparkles class="text-ink-300 h-5 w-5" aria-hidden="true" />
				</div>
				<div class="min-w-0">
					<h2 class="text-ink-100 text-[1.0625rem] font-semibold">Take the 20-second taste test</h2>
					<p class="text-ink-400 mt-1 text-[0.875rem] leading-relaxed">
						Eight repos, keep or skip. No setup — and it's the same gesture you'll use in the feed.
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={() => (showTasteTest = true)}
				class="rounded-panel border-ink-50/15 bg-ink-50/5 text-ink-100 hover:border-ink-50/25
					ease-out-quint mt-4 flex min-h-11 w-full items-center justify-center gap-2 border px-5
					py-3 text-[0.9375rem] font-medium transition-colors"
			>
				Start the test
			</button>
		</section>

		<!-- Door 3: never a failure state, never a booby prize -->
		<button
			type="button"
			onclick={() => goto(resolve('/feed'))}
			class="group text-ink-400 hover:text-ink-100 ease-out-quint flex min-h-11 items-center
				justify-center gap-2 py-3 text-[0.875rem] font-medium transition-colors"
		>
			Just start scrolling — no setup at all
			<ArrowRight
				class="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</button>
	</div>

	<!-- What GitTok has learned: quiet management, not another door -->
	<section class="border-ink-50/8 mt-10 border-t pt-8">
		<div class="flex items-center gap-2.5">
			<Brain class="text-ink-500 h-4 w-4" aria-hidden="true" />
			<h2 class="text-ink-400 font-mono text-[11px] tracking-[0.12em] uppercase">
				What GitTok has learned
			</h2>
		</div>

		{#if justReset}
			<div
				class="border-signal/20 bg-signal/8 rounded-panel mt-3 flex items-center gap-2 border px-4 py-3"
			>
				<Check class="text-signal h-4 w-4 flex-none" aria-hidden="true" />
				<p class="text-ink-200 text-[0.8125rem]">Forgotten — the feed starts fresh.</p>
			</div>
		{/if}

		{#if hasLearned}
			<p class="text-ink-400 mt-3 max-w-sm text-[0.8125rem] leading-relaxed">
				The feed leans toward these — it never restricts you to them.
			</p>
			<ul class="mt-3 flex flex-wrap gap-1.5">
				{#each learnedTopics as topic (topic)}
					<li
						class="rounded-pill border-ink-50/12 bg-ink-50/5 text-ink-200 max-w-[160px] truncate
							border px-2.5 py-1 font-mono text-[11px]"
					>
						{pretty(topic)}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-ink-400 mt-3 max-w-sm text-[0.8125rem] leading-relaxed">
				Nothing yet — GitTok learns quietly as you scroll. Star a repo or skip one you're not into,
				and the feed starts to lean your way.
			</p>
		{/if}

		<div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
			<button
				type="button"
				onclick={() => (showTasteTest = true)}
				class="text-ink-400 hover:text-ink-100 ease-out-quint -m-2 flex min-h-11 items-center
					gap-1.5 p-2 text-[0.8125rem] font-medium transition-colors"
			>
				<RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
				Retake the taste test
			</button>

			{#if hasLearned}
				{#if !confirmingReset}
					<button
						type="button"
						onclick={() => (confirmingReset = true)}
						class="text-ink-500 hover:text-danger ease-out-quint -m-2 flex min-h-11 items-center
							gap-1.5 p-2 text-[0.8125rem] font-medium transition-colors"
					>
						<Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
						Start over
					</button>
				{:else}
					<div class="flex min-h-11 flex-wrap items-center gap-3">
						<span class="text-ink-300 text-[0.8125rem]">Forget everything learned?</span>
						<button
							type="button"
							onclick={confirmReset}
							class="border-danger/30 bg-danger/15 text-danger hover:bg-danger/25 rounded-panel
								min-h-11 border px-3 text-[0.8125rem] font-semibold transition-colors"
						>
							Yes, forget it
						</button>
						<button
							type="button"
							onclick={() => (confirmingReset = false)}
							class="text-ink-400 hover:text-ink-100 min-h-11 px-2 text-[0.8125rem] font-medium
								transition-colors"
						>
							Cancel
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</section>
</main>

<TasteTest
	open={showTasteTest}
	onClose={() => (showTasteTest = false)}
	onAnswers={handleTasteTestAnswers}
	onDone={() => {
		showTasteTest = false;
		goto(resolve('/feed'));
	}}
/>
