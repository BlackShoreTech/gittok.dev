<!--
  Purpose: Lands the GitHub OAuth redirect and trades the code for a token
  Context: A transient screen. It should resolve fast enough that most users
           never read it, so it says one thing and then leaves.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { completeSignIn, consumeReturnTo, SignInError } from '$lib/github/auth';

	let failure = $state<string | null>(null);

	const MESSAGES: Record<string, string> = {
		state_mismatch: "That sign-in link didn't start here. Try again from the feed.",
		missing_verifier: 'This sign-in expired. Try again from the feed.',
		exchange_failed: "GitHub couldn't complete the sign-in.",
		denied: 'Sign-in was cancelled.'
	};

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get('code');
		const state = params.get('state');

		// Drop the code from the URL before it can reach history, a screenshot,
		// or an analytics pageview. It is single-use, but it should not linger.
		history.replaceState(null, '', window.location.pathname);

		if (params.get('error') !== null || code === null || state === null) {
			failure = MESSAGES.denied;
			return;
		}

		try {
			await completeSignIn(code, state);
			// A full navigation rather than goto(): it drops this transient page from
			// history and guarantees the feed remounts with the new session.
			window.location.replace(consumeReturnTo());
		} catch (e) {
			if (e instanceof SignInError) {
				failure = MESSAGES[e.reason] ?? MESSAGES.exchange_failed;
				return;
			}
			throw e;
		}
	});
</script>

<svelte:head>
	<title>Signing in · GitTok</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="flex min-h-dvh items-center justify-center px-6">
	{#if failure === null}
		<p class="text-ink-300 font-mono text-sm">Signing you in…</p>
	{:else}
		<div class="flex flex-col items-center gap-4 text-center">
			<p class="text-ink-100 text-[0.9375rem]">{failure}</p>
			<a
				href="/feed"
				class="rounded-pill border-ink-50/12 text-ink-100 hover:bg-ink-50/6 border px-4 py-2
					font-mono text-xs transition-colors"
			>
				Back to the feed
			</a>
		</div>
	{/if}
</main>
