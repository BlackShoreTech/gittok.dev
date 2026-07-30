# TikDev

TikDev is a portable, English-only GitHub Pages application for discovering public open-source repositories in a swipeable feed.

## Files

- `index.html` — complete interface, styles, search, feed logic, preferences, fullscreen controls, and optional music player
- `dedsec-butterfly.png` — DedSec Project butterfly used as the favicon and social/embed preview image
- `.github/workflows/pages.yml` — fork-safe GitHub Pages deployment
- `LICENSE` — project license

## DedSec Project repository rotation

Every three minutes TikDev can place one of these repositories near the visitor's current position in Discover, Popular, Fresh, or search feeds:

- `dedsec1121fk/Corrupted-Files-Project`
- `dedsec1121fk/Pocket-AI`
- `dedsec1121fk/DedSec`
- `dedsec1121fk/Offline-Survival-Project`
- `dedsec1121fk/dedsec1121fk.github.io`

The rotation ignores interest filters. It keeps at most one featured card in the feed at a time and does not run in the Saved feed.

A static website cannot read the visitor's private GitHub login session. For accurate filtering, the visitor can enter a public GitHub username under **Interests and categories**. TikDev then checks that account's public starred-repository list without requesting a password or token. Selecting **Open to star** also records that repository locally so it is not promoted again in that browser.

## Search

TikDev supports normal terms, repository URLs, `owner/repository`, `#topic`, and GitHub qualifiers such as `owner:`, `language:`, `license:`, and `stars:`. Normal terms search repository names, descriptions, and README content.

## GitHub Pages

1. Upload all files and folders to the repository root.
2. Open **Settings → Pages**.
3. Select **GitHub Actions** as the source.
4. Run the deployment workflow or push to the repository's default branch.

The workflow detects the current fork, default branch, GitHub Pages base URL, and optional `CNAME`. It also generates the correct absolute Open Graph and Twitter preview-image URL.

## Privacy

TikDev has no analytics, account system, advertising tracker, or database. Interests, saved repositories, optional GitHub username, promotion timing, and locally recorded stars stay in browser storage. Repository content and public star lists are requested directly from GitHub's public API. The optional focus-radio player uses the official Lofi Girl live stream and contacts YouTube only after the visitor starts it. Feed scrolling uses natural touch movement and a guarded one-card wheel step on desktop to prevent accidental multi-card jumps.
