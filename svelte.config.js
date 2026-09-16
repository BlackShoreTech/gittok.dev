import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Enable SPA fallback
			fallback: '200.html',
			// Pages will be built into this directory
			pages: 'build',
			// Assets will be built into this directory
			assets: 'build',
			// Precompress files
			precompress: false,
			// Strict mode ensures all pages are prerenderable
			strict: true
		}),
		// Add paths configuration for GitHub Pages
		paths: {
			base: ''
		},

		// The feed renders README HTML from arbitrary third-party repositories.
		// DOMPurify is the first line of defence; this is the second. `connect-src`
		// matters most: it is what stops a sanitiser bypass from exfiltrating the
		// GitHub token in localStorage to an attacker-controlled host.
		// GitHub Pages cannot set response headers, so SvelteKit emits this as a
		// <meta> tag — which means frame-ancestors/report-uri would be ignored and
		// are deliberately omitted.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': [
					'self',
					'https://www.googletagmanager.com',
					'https://eu-assets.i.posthog.com'
				],
				'connect-src': [
					'self',
					'https://api.github.com',
					'https://raw.githubusercontent.com',
					'https://gittok-auth.brendan-a6b.workers.dev',
					'https://eu.i.posthog.com',
					'https://eu-assets.i.posthog.com',
					'https://*.google-analytics.com',
					'https://*.analytics.google.com',
					'https://*.googletagmanager.com'
				],
				// README badges come from shields.io, badgen, custom hosts — an
				// allowlist is not possible, so any https image is permitted.
				// Plenty of READMEs still link badges over plain http, which a
				// browser blocks as mixed content; upgrade-insecure-requests
				// rewrites those to https so the badge renders instead of breaking.
				// Caveat: it also upgrades same-origin requests, so a plain-http
				// preview (DISABLE_HTTPS=1) will fail to load. Dev and production
				// are both https, so test against those.
				'img-src': ['self', 'data:', 'https:'],
				'upgrade-insecure-requests': true,
				'style-src': ['self', 'unsafe-inline'],
				'font-src': ['self', 'data:'],
				'worker-src': ['self', 'blob:'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'object-src': ['none']
			}
		}
	}
};

export default config;
