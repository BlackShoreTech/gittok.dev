import { describe, expect, it } from 'vitest';

import { resolveAssetUrl, resolveLinkUrl, resolveReadmeUrls, type RepoRef } from './readme-urls';

const REF: RepoRef = { owner: 'sveltejs', repo: 'svelte', branch: 'main' };

const fragmentFrom = (html: string): DocumentFragment => {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
};

describe('resolveAssetUrl', () => {
	it('points a relative image at raw content, which is what serves bytes', () => {
		// Given the relative path svelte's README actually uses
		const value = 'assets/banner.png';

		// When it is resolved as an image
		const result = resolveAssetUrl(value, REF);

		// Then it addresses the raw host, not the repo web page
		expect(result).toBe('https://raw.githubusercontent.com/sveltejs/svelte/main/assets/banner.png');
	});

	it('normalises a leading ./', () => {
		// Given a dot-slash prefixed path
		const value = './images/logo.svg';

		// When it is resolved
		const result = resolveAssetUrl(value, REF);

		// Then the prefix is collapsed
		expect(result).toBe('https://raw.githubusercontent.com/sveltejs/svelte/main/images/logo.svg');
	});

	it('leaves an absolute badge URL untouched', () => {
		// Given a shields.io badge
		const value = 'https://img.shields.io/npm/l/svelte.svg';

		// When it is resolved
		const result = resolveAssetUrl(value, REF);

		// Then it is unchanged
		expect(result).toBe(value);
	});

	it('falls back to HEAD when the branch is unknown', () => {
		// Given a repo whose default branch was not resolved
		const ref: RepoRef = { owner: 'a', repo: 'b', branch: '' };

		// When a relative asset is resolved
		const result = resolveAssetUrl('x.png', ref);

		// Then HEAD stands in, which raw content accepts
		expect(result).toBe('https://raw.githubusercontent.com/a/b/HEAD/x.png');
	});
});

describe('resolveLinkUrl', () => {
	it('points a relative link at the file page, not the raw bytes', () => {
		// Given a link to a sibling document
		const value = 'CONTRIBUTING.md';

		// When it is resolved as a link
		const result = resolveLinkUrl(value, REF);

		// Then it opens the blob view a reader expects
		expect(result).toBe('https://github.com/sveltejs/svelte/blob/main/CONTRIBUTING.md');
	});

	it('leaves an in-page anchor alone', () => {
		// Given a link to a heading inside the README
		const value = '#installation';

		// When it is resolved
		const result = resolveLinkUrl(value, REF);

		// Then it is untouched, because the target lives in the rendered text
		expect(result).toBe(value);
	});

	it('leaves mailto links alone', () => {
		// Given a contact link
		const value = 'mailto:hi@example.com';

		// When it is resolved
		const result = resolveLinkUrl(value, REF);

		// Then it stays a mail link
		expect(result).toBe(value);
	});
});

describe('scheme safety', () => {
	it('never rewrites a javascript: URL into something that survives', () => {
		// Given a scripted href that DOMPurify would already have stripped
		const value = 'javascript:alert(1)';

		// When it is resolved
		const result = resolveLinkUrl(value, REF);

		// Then it is passed through untouched rather than laundered into an https URL
		expect(result).toBe(value);
	});

	it('cannot synthesise a non-http scheme from a relative path', () => {
		// Given assorted relative paths
		const values = ['a.png', './a.png', '../a.png', '/a.png', 'a b.png'];

		// When each is resolved
		const results = values.map((value) => resolveAssetUrl(value, REF));

		// Then every result is https
		expect(results.every((result) => result.startsWith('https://'))).toBe(true);
	});

	it('does not silently repoint a protocol-relative URL at GitHub', () => {
		// Given a protocol-relative path, which a browser already treats as absolute
		const value = '//example.com/tracker.png';

		// When it is resolved
		const result = resolveAssetUrl(value, REF);

		// Then it keeps its own host, matching what the browser would have done
		expect(result).toBe('https://example.com/tracker.png');
	});
});

describe('resolveReadmeUrls', () => {
	it('rewrites a raw <img> tag, which a markdown-level base URL misses', () => {
		// Given README markup containing a raw HTML image, as svelte's does
		const fragment = fragmentFrom('<p><img src="assets/banner.png" alt="banner"></p>');

		// When the fragment is resolved
		resolveReadmeUrls(fragment, REF);

		// Then the image points at raw content instead of our own origin
		expect(fragment.querySelector('img')?.getAttribute('src')).toBe(
			'https://raw.githubusercontent.com/sveltejs/svelte/main/assets/banner.png'
		);
	});

	it('rewrites images and links in one pass, each to its own base', () => {
		// Given markup mixing a relative image and a relative link
		const fragment = fragmentFrom(
			'<img src="logo.png"><a href="docs/guide.md">Guide</a><a href="https://svelte.dev">Site</a>'
		);

		// When the fragment is resolved
		resolveReadmeUrls(fragment, REF);

		// Then each gets the correct host, and the absolute link is passed through
		// byte-for-byte rather than normalised
		expect(fragment.querySelector('img')?.getAttribute('src')).toBe(
			'https://raw.githubusercontent.com/sveltejs/svelte/main/logo.png'
		);
		const links = [...fragment.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(links).toEqual([
			'https://github.com/sveltejs/svelte/blob/main/docs/guide.md',
			'https://svelte.dev'
		]);
	});
});
