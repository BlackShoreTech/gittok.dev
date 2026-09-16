<!--
  Purpose: Full-card placeholder for a repository that hasn't arrived yet
  Context: Shown on first load and while paginating, so the feed always has
           shape instead of a black screen with a line of text on it.
-->

<script lang="ts">
	import ReadmeSkeleton from './ReadmeSkeleton.svelte';
</script>

<div class="surface rounded-card shadow-lift flex h-full min-h-0 flex-col overflow-hidden">
	<div class="flex-none px-5 pt-5 sm:px-7 sm:pt-6" aria-hidden="true">
		<div class="flex items-center gap-2.5">
			<div class="bg-ink-50/8 pulse h-7 w-7 flex-none rounded-full"></div>
			<div class="bg-ink-50/8 pulse h-3 w-24 rounded"></div>
		</div>

		<div class="bg-ink-50/8 pulse mt-4 h-8 w-3/5 rounded sm:h-9"></div>

		<div class="mt-3.5 space-y-2">
			<div class="bg-ink-50/6 pulse h-3.5 w-full rounded"></div>
			<div class="bg-ink-50/6 pulse h-3.5 w-4/5 rounded"></div>
		</div>

		<div class="mt-4 flex gap-4">
			<div class="bg-ink-50/6 pulse h-3 w-16 rounded"></div>
			<div class="bg-ink-50/6 pulse h-3 w-12 rounded"></div>
			<div class="bg-ink-50/6 pulse h-3 w-14 rounded"></div>
		</div>
	</div>

	<div class="mask-fade-b mt-5 min-h-0 flex-1 overflow-hidden px-5 sm:px-7">
		<ReadmeSkeleton />
	</div>

	<div class="flex-none px-5 pt-3 pb-5 sm:px-7 sm:pb-6" aria-hidden="true">
		<div class="rounded-panel bg-ink-50/8 pulse h-11 w-full"></div>
	</div>

	<span class="sr-only" role="status">Loading repositories</span>
</div>

<style>
	:global(.pulse) {
		animation: shimmer 1.6s ease-in-out infinite;
	}

	@keyframes shimmer {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.pulse) {
			animation: none;
		}
	}
</style>
