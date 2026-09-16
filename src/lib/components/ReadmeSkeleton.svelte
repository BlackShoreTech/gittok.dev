<!--
  Purpose: Structural placeholder shown while a README is in flight
  Context: Mirrors the real shape of README content (heading, badge row, prose,
           code block) so the card doesn't reflow when content lands.
-->

<div class="space-y-4" aria-hidden="true">
	<div class="bg-ink-50/8 h-6 w-2/5 rounded"></div>

	<div class="flex gap-2">
		<div class="bg-ink-50/6 h-4 w-16 rounded"></div>
		<div class="bg-ink-50/6 h-4 w-20 rounded"></div>
		<div class="bg-ink-50/6 h-4 w-14 rounded"></div>
	</div>

	<div class="space-y-2.5 pt-2">
		<div class="bg-ink-50/6 h-3.5 w-full rounded"></div>
		<div class="bg-ink-50/6 h-3.5 w-11/12 rounded"></div>
		<div class="bg-ink-50/6 h-3.5 w-4/5 rounded"></div>
	</div>

	<div class="rounded-panel border-ink-50/6 bg-ink-950/60 h-24 border"></div>

	<div class="space-y-2.5">
		<div class="bg-ink-50/6 h-3.5 w-full rounded"></div>
		<div class="bg-ink-50/6 h-3.5 w-3/4 rounded"></div>
	</div>
</div>

<style>
	div > :global(div) {
		animation: shimmer 1.6s ease-in-out infinite;
	}

	/* A calm breath, not a strobe — the card is full-screen. */
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
		div > :global(div) {
			animation: none;
		}
	}
</style>
