<!--
  Purpose: X (formerly Twitter) logo mark
  Context: Lucide removed brand icons in v1, and its `Twitter` icon was the old
           bird anyway. Self-hosted. Drop-in for a lucide icon.
-->

<script lang="ts">
	type Props = { class?: string };
	const { class: className = 'h-4 w-4' }: Props = $props();
</script>

<svg viewBox="0 0 24 24" fill="currentColor" class={className} aria-hidden="true" focusable="false">
	<path
		d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
	/>
</svg>
