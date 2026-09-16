<!--
  Purpose: Per-route SEO and social-share metadata
  Context: These tags used to live in app.html, which meant every route shipped
           the homepage's title and a canonical pointing at "/" — telling search
           engines that /about and /feed were duplicates of the landing page.
           Owning them per route is what makes the individual pages indexable.
-->

<script lang="ts">
	interface Props {
		title: string;
		description: string;
		/** Route path, leading slash, no origin. The canonical is built from it. */
		path: string;
		imageAlt?: string;
		noindex?: boolean;
	}

	let { title, description, path, imageAlt, noindex = false }: Props = $props();

	const SITE_URL = 'https://gittok.dev';
	const SITE_NAME = 'GitTok';
	const OG_IMAGE = `${SITE_URL}/og-image.png`;

	// Trailing slash only for the root, matching what the sitemap declares.
	// A canonical that disagrees with the sitemap splits ranking signals.
	const canonical = $derived(path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={imageAlt ?? title} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={OG_IMAGE} />
	<meta name="twitter:image:alt" content={imageAlt ?? title} />
</svelte:head>
