// Purpose: Resolve relative paths inside a README against the repo they came from
// Context: A README is written to be read on github.com, so its paths are relative
// to the repo root. Rendered on gittok.dev they resolve against gittok.dev and 404.
// Images and links need DIFFERENT bases: an image must come from raw content, while
// a link should open the file's page on github.com.

export type RepoRef = {
	readonly owner: string;
	readonly repo: string;
	readonly branch: string;
};

const RAW_HOST = 'https://raw.githubusercontent.com';
const WEB_HOST = 'https://github.com';

const assetBase = (ref: RepoRef): string =>
	`${RAW_HOST}/${ref.owner}/${ref.repo}/${ref.branch || 'HEAD'}/`;

const linkBase = (ref: RepoRef): string =>
	`${WEB_HOST}/${ref.owner}/${ref.repo}/blob/${ref.branch || 'HEAD'}/`;

/**
 * Only paths that are not already absolute get rewritten.
 *
 * `URL.canParse` is what makes this safe to run after sanitisation: anything
 * carrying a scheme (`https:`, and critically `javascript:`) parses, so it is
 * left exactly as DOMPurify left it. Only scheme-less paths are resolved, and
 * resolving against an https base can only ever produce an https URL.
 */
const resolveAgainst = (value: string, base: string): string => {
	const trimmed = value.trim();

	// In-page anchors belong to the README's own headings; there is nothing on
	// github.com to point them at once the text has been truncated.
	if (trimmed === '' || trimmed.startsWith('#')) return value;
	if (URL.canParse(trimmed)) return value;

	return new URL(trimmed, base).toString();
};

/** For `<img src>` — resolves to raw content, which is what actually serves bytes. */
export const resolveAssetUrl = (value: string, ref: RepoRef): string =>
	resolveAgainst(value, assetBase(ref));

/** For `<a href>` — resolves to the file's page on github.com. */
export const resolveLinkUrl = (value: string, ref: RepoRef): string =>
	resolveAgainst(value, linkBase(ref));

/**
 * Rewrites every relative `src`/`href` in already-sanitised README markup.
 *
 * Runs on the DOM rather than the markdown tokens so that raw `<img>` tags
 * embedded in a README are covered too — a markdown-level base URL silently
 * misses those, which is how `<img src="assets/banner.png">` ended up
 * resolving against gittok.dev.
 */
export const resolveReadmeUrls = (fragment: DocumentFragment, ref: RepoRef): void => {
	for (const image of fragment.querySelectorAll('img')) {
		const src = image.getAttribute('src');
		if (src !== null) image.setAttribute('src', resolveAssetUrl(src, ref));
	}

	for (const anchor of fragment.querySelectorAll('a')) {
		const href = anchor.getAttribute('href');
		if (href !== null) anchor.setAttribute('href', resolveLinkUrl(href, ref));
	}
};
