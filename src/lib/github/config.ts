// Purpose: Public configuration for the GitHub sign-in flow
// Context: Both values are public by design — the client ID is visible in every
// authorize URL, and the worker URL is a public endpoint. The client SECRET is
// never here; it lives only in the Cloudflare Worker. See
// docs/project/cloudflare-setup.md.

/** OAuth App client ID. Must match `GH_CLIENT_ID` in the Worker's wrangler.jsonc. */
export const GITHUB_CLIENT_ID = 'Ov23liuH1nFFy60YDhXu';

/** Deployed token-exchange Worker. */
export const AUTH_WORKER_URL = 'https://gittok-auth.brendan-a6b.workers.dev';

/**
 * Sign-in stays hidden until both values are set, so an unconfigured deploy
 * shows no broken button rather than a dead-end redirect.
 */
export const isAuthConfigured = (): boolean =>
	!GITHUB_CLIENT_ID.startsWith('REPLACE_') && !AUTH_WORKER_URL.startsWith('REPLACE_');
