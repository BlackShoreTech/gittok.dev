<!--
  Purpose: The feed — one repository per screen, endlessly scrollable
  Context: The core product surface. Everything here serves one job: let someone
           judge a repository in a few seconds and move on without friction.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import { topicsStore } from '$lib/stores/topics';
	import { topics as allTopics } from '$lib/all_topics';
	import { Octokit } from '@octokit/rest';
	import { markedEmoji } from 'marked-emoji';
	import { Info, SlidersHorizontal, ChevronDown, RefreshCw, LogIn, LogOut } from 'lucide-svelte';
	import type { FeedProject } from '$lib/github/feed';
	import {
		fetchProject,
		fetchReadme,
		getRandomSearchQuery,
		searchRepositories
	} from '$lib/github/feed';
	import { session, beginSignIn, disconnect, restoreSession } from '$lib/github/auth';
	import { isAuthConfigured } from '$lib/github/config';
	import { resolveReadmeUrls, type RepoRef } from '$lib/github/readme-urls';

	import Seo from '$lib/components/Seo.svelte';
	import RepoCard from '$lib/components/RepoCard.svelte';
	import SpecialMessageCard from '$lib/components/SpecialMessageCard.svelte';
	import FeedCardSkeleton from '$lib/components/FeedCardSkeleton.svelte';
	import AmbientBackdrop from '$lib/components/AmbientBackdrop.svelte';

	const FOLLOW_CARD = '-1';
	const PROMOTED_CARD = '-2';
	const FEATURED_CTA_CARD = '-4';

	let projects = $state<FeedProject[]>([]);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let showScrollHint = $state(true);
	let scroller = $state<HTMLElement | null>(null);
	let activeIndex = $state(0);

	const authAvailable = isAuthConfigured();

	// Reactive so the "seen" counter tracks it directly instead of being mirrored.
	const viewedIndices = new SvelteSet<number>();
	const viewedCount = $derived(viewedIndices.size);

	let hasShownFollowMessage = false;
	let hasShownFeaturedMessage = false;
	let featuredRepos: FeedProject[] = [];
	let seenQueries: Record<string, { current_page: number; total_projects: number }> = {};

	const topicLabel = $derived(
		$topicsStore.size > 0
			? `${$topicsStore.size} topic${$topicsStore.size === 1 ? '' : 's'}`
			: 'All topics'
	);

	/* --------------------------------------------------------------------- *
	 * Loading
	 * --------------------------------------------------------------------- */

	const nextQuery = () =>
		getRandomSearchQuery($topicsStore.size > 0 ? [...$topicsStore] : allTopics, seenQueries);

	const loadMoreProjects = async (index: number) => {
		if (isLoading) return;

		isLoading = true;
		try {
			const octokit = new Octokit();
			const newProjects = await searchRepositories(octokit, nextQuery().toString());
			if (!newProjects.length) return;

			// Shuffle incoming repos into what's left ahead of the reader, so the
			// feed never settles into visible topic-shaped blocks.
			const combined = [...projects.slice(index + 1), ...newProjects];
			for (let i = combined.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[combined[i], combined[j]] = [combined[j], combined[i]];
			}

			projects = [...projects.slice(0, index + 1), ...combined];
			loadError = null;
		} catch (error) {
			console.error('Error loading more projects:', error);
			// Only surface an error when there is nothing to read; mid-feed failures
			// are silent because the reader still has cards ahead of them.
			if (!projects.length) loadError = describeError(error);
		} finally {
			isLoading = false;
		}
	};

	const describeError = (error: unknown) =>
		error instanceof Error && /rate limit/i.test(error.message)
			? "GitHub's rate limit is maxed out for your network. It resets within the hour."
			: "Couldn't reach GitHub. Check your connection and try again.";

	const loadReadme = async (index: number) => {
		const project = projects[index];
		if (!project || project.readmeSnippet || project.readmeError) return;

		try {
			project.readmeSnippet = await fetchReadme(
				project.full_name.split('/')[0],
				project.name,
				project.default_branch
			);
			project.readmeError = false;
		} catch {
			project.readmeError = true;
		}
	};

	const retryReadme = (index: number) => {
		projects[index].readmeError = false;
		loadReadme(index);
	};

	const loadFeaturedRepos = async (): Promise<FeedProject[]> => {
		try {
			const response = await fetch('/data/featured_repos.json');
			if (!response.ok) throw new Error(`Failed to fetch featured repos: ${response.status}`);

			const data = await response.json();
			return data.map((repo: Record<string, never>): FeedProject => ({
				id: PROMOTED_CARD,
				name: repo.name,
				full_name: repo.full_name,
				description: repo.description || '',
				html_url: repo.html_url,
				language: repo.language,
				stargazers_count: repo.stargazers_count ?? 0,
				fork: 0,
				forks_count: repo.forks_count ?? 0,
				topics: repo.topics ?? [],
				created_at: repo.created_at,
				updated_at: repo.pushed_at ?? repo.updated_at,
				is_pinned: repo.is_pinned,
				owner_id: repo.owner_id,
				fetched_at: repo.fetched_at,
				readmeSnippet: null,
				avatar: repo.avatar_url,
				stargazersUrl: `${repo.html_url}/stargazers`,
				forksUrl: `${repo.html_url}/fork`,
				default_branch: repo.default_branch
			}));
		} catch (error) {
			console.error('Error loading featured repos:', error);
			return [];
		}
	};

	/* --------------------------------------------------------------------- *
	 * Interjected cards
	 * --------------------------------------------------------------------- */

	const insertAfter = (index: number, card: FeedProject) => {
		projects = [...projects.slice(0, index + 1), card, ...projects.slice(index + 1)];
	};

	const makeCard = (overrides: Partial<FeedProject> & { id: string }): FeedProject => ({
		name: '',
		full_name: '',
		description: '',
		html_url: '',
		language: null,
		stargazers_count: 0,
		fork: 0,
		forks_count: 0,
		topics: [],
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		is_pinned: 1,
		owner_id: 0,
		fetched_at: new Date().toISOString(),
		readmeSnippet: '',
		avatar: '',
		stargazersUrl: '',
		forksUrl: '',
		default_branch: '',
		...overrides
	});

	const interject = (index: number) => {
		if (viewedCount === 5 && !hasShownFeaturedMessage) {
			hasShownFeaturedMessage = true;
			insertAfter(
				index,
				makeCard({
					id: FEATURED_CTA_CARD,
					name: 'Get your project featured',
					full_name: 'BlackShoreTech/gittok.dev',
					description:
						'Want your open source project in this feed? Here is how to get it in front of people.',
					html_url: 'https://github.com/BlackShoreTech/gittok.dev',
					avatar: 'https://avatars.githubusercontent.com/u/583231?v=4'
				})
			);
			return;
		}

		if (viewedCount === 10 && !hasShownFollowMessage) {
			hasShownFollowMessage = true;
			insertAfter(
				index,
				makeCard({
					id: FOLLOW_CARD,
					name: 'Enjoying GitTok?',
					full_name: '@brsc2909/gittok',
					description:
						"If you're getting something out of this, follow along for more projects like these.",
					html_url: 'https://twitter.com/brsc2909',
					avatar: 'https://avatars.githubusercontent.com/u/1?v=4'
				})
			);
			return;
		}

		// A promoted placement every tenth card, never more often.
		if ((index + 1) % 10 === 0 && featuredRepos.length) {
			insertAfter(index, featuredRepos[Math.floor(index / 10) % featuredRepos.length]);
		}
	};

	/* --------------------------------------------------------------------- *
	 * Navigation
	 * --------------------------------------------------------------------- */

	const setUrlParams = (project: FeedProject) => {
		if (!project.name || !project.full_name.includes('/')) return;
		const url = new URL(window.location.href);
		url.searchParams.set('project', project.name);
		url.searchParams.set('author', project.full_name.split('/')[0]);
		window.history.replaceState({}, '', url.toString());
	};

	const observeElement = (element: HTMLElement, index: number) => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;

					activeIndex = index;
					setUrlParams(projects[index]);
					if (index > 0) showScrollHint = false;

					if (!viewedIndices.has(index)) {
						viewedIndices.add(index);
						interject(index);
					}

					// Fetch the current README, then warm the next two so the reader
					// never waits on the thing they are about to scroll to.
					loadReadme(index).then(() => {
						loadReadme(index + 1).then(() => loadReadme(index + 2));
					});

					if (index >= projects.length - 8) loadMoreProjects(index);
				}
			},
			{ threshold: 0.5 }
		);

		observer.observe(element);
		return { destroy: () => observer.disconnect() };
	};

	const scrollBy = (direction: 1 | -1) => {
		scroller?.scrollBy({ top: direction * scroller.clientHeight, behavior: 'smooth' });
	};

	const onKeydown = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

		if (event.key === 'ArrowDown' || event.key === 'j' || event.key === ' ') {
			event.preventDefault();
			scrollBy(1);
		} else if (event.key === 'ArrowUp' || event.key === 'k') {
			event.preventDefault();
			scrollBy(-1);
		}
	};

	/* --------------------------------------------------------------------- *
	 * Boot
	 * --------------------------------------------------------------------- */

	const loadInitial = async () => {
		isLoading = true;
		loadError = null;
		try {
			const octokit = new Octokit();
			const initial: FeedProject[] = [];

			// A shared link should open on the repository it points at.
			const url = new URL(window.location.href);
			const project = url.searchParams.get('project');
			const author = url.searchParams.get('author');
			if (project && author) {
				try {
					initial.push(await fetchProject(author, project));
				} catch (error) {
					console.error('Error loading shared project:', error);
				}
			}

			initial.push(...(await searchRepositories(octokit, nextQuery().toString())));
			projects = initial;
			if (!initial.length) loadError = 'No repositories came back for these topics.';
		} catch (error) {
			console.error('Error loading feed:', error);
			loadError = describeError(error);
		} finally {
			isLoading = false;
		}
	};

	onMount(() => {
		marked.use({ gfm: true });
		restoreSession();
		loadInitial();

		// Cosmetic extras are fired off separately: neither should be able to
		// keep the feed itself from rendering.
		loadFeaturedRepos().then((repos) => (featuredRepos = repos));
		new Octokit().rest.emojis
			.get()
			.then((res) =>
				marked.use(
					markedEmoji({
						emojis: res.data,
						renderer: (token) =>
							`<img alt="${token.name}" src="${token.emoji}" class="marked-emoji-img">`
					})
				)
			)
			.catch(() => {});
	});

	/* --------------------------------------------------------------------- *
	 * Rendering
	 * --------------------------------------------------------------------- */

	const renderMarkdown = (content: string, ref: RepoRef): string => {
		const rawHtml = marked.parse(content, { async: false }) as string;

		// Sanitise to a fragment rather than a string so relative paths can be
		// resolved on real elements afterwards. Doing it here instead of via a
		// markdown base URL is what catches raw <img> tags embedded in a README.
		const fragment = DOMPurify.sanitize(rawHtml, {
			RETURN_DOM_FRAGMENT: true,
			USE_PROFILES: { html: true },
			ALLOWED_TAGS: [
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'p',
				'a',
				'ul',
				'ol',
				'li',
				'code',
				'pre',
				'strong',
				'em',
				'del',
				'blockquote',
				'table',
				'thead',
				'tbody',
				'tr',
				'th',
				'td',
				'br',
				'hr',
				'img',
				'sup',
				'sub',
				'details',
				'summary'
			],
			// Images are allowed so README badges and emoji survive; they are the
			// texture that makes a README recognisable at a glance.
			ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height', 'align']
		});

		resolveReadmeUrls(fragment, ref);

		const holder = document.createElement('div');
		holder.append(fragment);
		return holder.innerHTML;
	};

	const shareProject = async (project: FeedProject) => {
		const shareUrl = `https://gittok.dev/feed?project=${project.name}&author=${project.full_name.split('/')[0]}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: project.name,
					text: `Check out ${project.name} on gittok.dev`,
					url: shareUrl
				});
				return;
			} catch (err) {
				if (err instanceof Error && err.name === 'AbortError') return;
			}
		}

		await navigator.clipboard.writeText(shareUrl);
	};
</script>

<Seo
	title="The Feed — Trending GitHub Repositories | GitTok"
	description="Scroll a full-screen feed of GitHub repositories. Read the README, star what's good, and keep going."
	path="/feed"
	imageAlt="The GitTok feed — one GitHub repository per screen"
/>

<svelte:window onkeydown={onKeydown} />

<AmbientBackdrop />

<div
	bind:this={scroller}
	class="no-scrollbar h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll"
	role="list"
	aria-label="GitHub repositories"
>
	<!-- Chrome: identity, current filter, escape hatches. Nothing else. -->
	<header
		class="from-ink-950/90 pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center
			justify-between gap-3 bg-gradient-to-b to-transparent px-4 pt-4 pb-8 sm:px-6"
	>
		<a
			href="/"
			class="text-ink-100 hover:text-ink-50 pointer-events-auto text-[15px] font-semibold
				tracking-tight transition-colors"
		>
			GitTok
		</a>

		<div class="pointer-events-auto flex items-center gap-2">
			{#if viewedCount > 0}
				<span
					class="text-ink-400 hidden font-mono text-[11px] tabular-nums sm:inline"
					aria-live="polite"
				>
					{viewedCount} seen
				</span>
			{/if}

			<a
				href="/setup"
				class="rounded-pill border-ink-50/10 bg-ink-850/70 text-ink-200 hover:border-ink-50/25 hover:text-ink-50 flex
					items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px]
					backdrop-blur-md transition-colors"
			>
				<SlidersHorizontal class="h-3.5 w-3.5" />
				{topicLabel}
			</a>

			{#if authAvailable}
				{#if $session}
					<button
						onclick={disconnect}
						class="border-ink-50/10 bg-ink-850/70 text-ink-300 hover:border-ink-50/25 hover:text-ink-50 relative flex
							h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md
							transition-colors"
						aria-label="Signed in with GitHub. Disconnect account"
					>
						<span
							class="bg-signal absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
							aria-hidden="true"
						></span>
						<LogOut class="h-4 w-4" />
					</button>
				{:else}
					<button
						onclick={() => beginSignIn(window.location.pathname + window.location.search)}
						class="rounded-pill border-ink-50/10 bg-ink-850/70 text-ink-200 hover:border-ink-50/25 hover:text-ink-50 flex
							items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px]
							backdrop-blur-md transition-colors"
					>
						<LogIn class="h-3.5 w-3.5" />
						Sign in
					</button>
				{/if}
			{/if}

			<a
				href="/about"
				class="border-ink-50/10 bg-ink-850/70 text-ink-300 hover:border-ink-50/25 hover:text-ink-50 flex h-8 w-8
					items-center justify-center rounded-full border backdrop-blur-md
					transition-colors"
				aria-label="About GitTok"
			>
				<Info class="h-4 w-4" />
			</a>
		</div>
	</header>

	{#if loadError && !projects.length}
		<section class="flex h-[100dvh] w-full items-center justify-center px-6">
			<div class="max-w-sm text-center">
				<h2 class="text-ink-50 text-xl font-semibold">Nothing to scroll</h2>
				<p class="text-ink-300 mt-2 text-sm leading-relaxed">{loadError}</p>
				<button
					onclick={loadInitial}
					class="rounded-panel bg-ink-50 text-ink-950 mt-5 inline-flex items-center gap-2 px-4
						py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
				>
					<RefreshCw class="h-4 w-4" />
					Try again
				</button>
			</div>
		</section>
	{:else if !projects.length}
		<section class="flex h-[100dvh] w-full snap-start items-center justify-center">
			<div
				class="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pt-16 pb-4 sm:px-6 sm:pt-20 sm:pb-6"
			>
				<FeedCardSkeleton />
			</div>
		</section>
	{/if}

	{#each projects as project, index (`${project.id}-${index}`)}
		<section
			class="relative flex h-[100dvh] w-full snap-start items-center justify-center"
			use:observeElement={index}
		>
			<div
				class="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pt-16 sm:px-6 sm:pt-20
					{index === 0 && showScrollHint ? 'pb-11 sm:pb-14' : 'pb-4 sm:pb-6'}"
			>
				{#if project.id === FOLLOW_CARD || project.id === FEATURED_CTA_CARD}
					<SpecialMessageCard {project} />
				{:else}
					<RepoCard
						{project}
						{renderMarkdown}
						{shareProject}
						promoted={project.id === PROMOTED_CARD}
						retryReadme={() => retryReadme(index)}
						active={index === activeIndex}
					/>
				{/if}
			</div>

			<!-- Shown once, on the first card, then never again -->
			{#if index === 0 && showScrollHint}
				<button
					onclick={() => scrollBy(1)}
					class="text-ink-400 hover:text-ink-200 absolute inset-x-0 bottom-3.5 mx-auto flex w-fit
						items-center gap-1.5 font-mono text-[11px] transition-colors"
				>
					<ChevronDown class="h-3.5 w-3.5 animate-bounce" />
					Scroll for more
				</button>
			{/if}
		</section>
	{/each}

	{#if isLoading && projects.length > 0}
		<section class="flex h-[100dvh] w-full snap-start items-center justify-center">
			<div
				class="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pt-16 pb-4 sm:px-6 sm:pt-20 sm:pb-6"
			>
				<FeedCardSkeleton />
			</div>
		</section>
	{/if}
</div>
