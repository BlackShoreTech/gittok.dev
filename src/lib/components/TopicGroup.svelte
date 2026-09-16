<!--
  Purpose: One collapsible category of selectable topics
  Context: Recursive, so the topic tree renders at any depth without the
           copy-pasted three-level ladder it replaced.
-->

<script lang="ts">
	import { ChevronRight, Check } from 'lucide-svelte';
	import { topicsStore } from '$lib/stores/topics';
	import Self from './TopicGroup.svelte';

	type TopicNode = string[] | Record<string, unknown>;

	type Props = {
		label: string;
		node: TopicNode;
		depth?: number;
	};

	const { label, node, depth = 0 }: Props = $props();

	let open = $state(false);

	const leaves = $derived(Array.isArray(node) ? node : []);
	const branches = $derived(Array.isArray(node) ? [] : Object.entries(node));

	// A category is "on" when anything inside it is selected — the reason to
	// open it should be visible without opening it.
	const selectedCount = $derived(countSelected(node, $topicsStore));

	function countSelected(value: TopicNode, selected: Set<string>): number {
		if (Array.isArray(value)) return value.filter((t) => selected.has(t)).length;
		return Object.entries(value).reduce(
			(total, [key, child]) =>
				total + (selected.has(key) ? 1 : 0) + countSelected(child as TopicNode, selected),
			0
		);
	}

	const pretty = (value: string) => value.replace(/[-_]/g, ' ');
</script>

<div class={depth > 0 ? 'border-ink-50/8 border-l pl-4' : ''}>
	<button
		onclick={() => (open = !open)}
		aria-expanded={open}
		class="group rounded-panel hover:bg-ink-50/4 flex w-full items-center gap-2 px-2 py-2
			text-left transition-colors"
	>
		<ChevronRight
			class="text-ink-500 h-4 w-4 flex-none transition-transform duration-200
				{open ? 'rotate-90' : ''}"
		/>
		<span class="text-ink-100 flex-1 text-sm font-medium capitalize">{pretty(label)}</span>
		{#if selectedCount > 0}
			<span
				class="rounded-pill bg-accent-500/15 text-accent-300 px-2 py-0.5 font-mono text-[11px]
					tabular-nums"
			>
				{selectedCount}
			</span>
		{/if}
	</button>

	{#if open}
		<div class="mt-1 mb-3 space-y-1 pl-6">
			{#if leaves.length}
				<div class="flex flex-wrap gap-1.5 py-1">
					{#each leaves as topic (topic)}
						{@const selected = $topicsStore.has(topic)}
						<button
							onclick={() => topicsStore.toggle(topic)}
							aria-pressed={selected}
							class="rounded-pill flex items-center gap-1.5 border px-3 py-1.5 font-mono
								text-[12px] transition-colors duration-150
								{selected
								? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
								: 'border-ink-50/10 bg-ink-50/3 text-ink-300 hover:border-ink-50/25 hover:text-ink-100'}"
						>
							{#if selected}
								<Check class="h-3 w-3" />
							{/if}
							{pretty(topic)}
						</button>
					{/each}
				</div>
			{/if}

			{#each branches as [childLabel, childNode] (childLabel)}
				<Self label={childLabel} node={childNode as TopicNode} depth={depth + 1} />
			{/each}
		</div>
	{/if}
</div>
