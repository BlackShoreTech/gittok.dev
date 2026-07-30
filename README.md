# TikDev

TikDev is a mobile-first, swipeable browser for discovering public GitHub repositories.

## Portable GitHub Pages deployment

TikDev does not hardcode one owner, repository path, or website address.

The included GitHub Pages workflow automatically resolves:

1. A valid domain from `CNAME`, when that optional file exists.
2. Otherwise, the GitHub Pages base URL reported by GitHub for the current repository.
3. As a final fallback, `https://OWNER.github.io/REPOSITORY/`, or `https://OWNER.github.io/` for an account Pages repository.

The workflow injects the current fork's `OWNER/REPOSITORY` and resolved site URL into the deployed copy of `index.html`. The website also detects its URL from the browser, so it remains usable when published directly from a branch.

## Minimal structure

- `index.html` — the complete website, including HTML, CSS, JavaScript, and runtime URL fallback
- `.github/workflows/pages.yml` — portable GitHub Pages deployment and URL injection
- `README.md` — documentation
- `LICENSE` — original license and required attribution
- `CNAME` — optional; add only when using a custom domain

There is no package manager, framework, database, generated dependency folder, or separate build script.

## Features

- Full-screen vertical project feed
- Discover, Popular, Fresh, and Saved feeds
- GitHub repository search
- Topic-based personalization saved locally in the browser
- Repository statistics, topics, license, homepage, and update time
- Plain-text README preview loaded only when requested
- Browser-local saved projects
- Native sharing or clipboard fallback
- DedSec Project dark and light color themes
- Keyboard navigation with arrow keys, Page Up/Down, J/K, and `/` for search
- Adaptive layout for phones, tablets, foldables, laptops, desktops, ultrawide screens, and short landscape displays
- English-only interface
- No tracking or analytics

## Enable GitHub Pages

After uploading or forking the repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Open **Actions** and enable workflows if GitHub has disabled them in the fork.
4. Push to the repository's default branch, or run **Deploy TikDev to GitHub Pages** manually.

The workflow runs only for the current repository's default branch, so forks using a branch name other than `main` still work.

## Optional custom domain

Configure the custom domain in **Settings → Pages**. You may also create a root `CNAME` file containing only the hostname, for example:

```text
example.com
```

When `CNAME` exists, TikDev uses it for canonical metadata and the workflow's detected site address. The deployment environment still uses the final URL returned by GitHub Pages.

## API limits

TikDev uses GitHub's public REST API directly from the browser. Unauthenticated requests are rate-limited by GitHub. The interface shows an error when that limit is reached.

## Privacy

TikDev sends search and repository requests directly to GitHub. Topic choices, theme, and saved projects stay in browser local storage. This version contains no analytics, cookies, accounts, or backend.

## Credits and license

This project was rebuilt as a minimal static derivative of the original GitTok project. The upstream copyright and non-commercial license are preserved in `LICENSE`.
