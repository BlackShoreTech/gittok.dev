// Purpose: Root layout configuration for static site generation
// Context: Needed to enable prerendering for GitHub Pages deployment
import posthog from 'posthog-js';
import { browser } from '$app/environment';

export const prerender = true;
export const ssr = false;

/**
 * The OAuth callback lands on `/auth/callback?code=…&state=…`. Session replay is
 * enabled on this project, so the URL must be scrubbed before any event carries
 * it. The code is single-use and PKCE-bound, but it should never reach a replay.
 */
const OAUTH_PARAMS = ['code', 'state'] as const;
const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url'] as const;

const scrubOAuthParams = (value: unknown): unknown => {
	if (typeof value !== 'string' || !URL.canParse(value)) return value;

	const url = new URL(value);
	if (!OAUTH_PARAMS.some((param) => url.searchParams.has(param))) return value;
	for (const param of OAUTH_PARAMS) url.searchParams.delete(param);
	return url.toString();
};

export const load = async () => {
	if (browser) {
		posthog.init('phc_Fcp58Qw6TH48to35dd0wtJxZ8QpBxbLjsOqHER6OpJq', {
			api_host: 'https://eu.i.posthog.com',
			defaults: '2025-05-24',
			person_profiles: 'always', // or 'always' to create profiles for anonymous users as well
			sanitize_properties: (properties) => {
				for (const key of URL_PROPERTIES) {
					if (key in properties) properties[key] = scrubOAuthParams(properties[key]);
				}
				return properties;
			}
		});
	}

	return;
};
