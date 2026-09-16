// Purpose: GitHub API operations for fetching stargazer and repository data
// Context: Separates API calls from database operations

import { Octokit } from "@octokit/rest";
import type { StargazerData } from "./types";

/**
 * How far back a run looks for new stars.
 *
 * This is deliberately much wider than the daily cron interval. GitHub queues
 * scheduled workflows and services them late — historical runs of this job
 * landed anywhere between 01:25 and 04:45 UTC for a 00:00 schedule — so a
 * literal 24 hour window drops every star that fell into the drift gap, and
 * a missed star is never reconsidered on a later run. The overlap makes the
 * job idempotent-by-replay: upserts re-process a star harmlessly, whereas a
 * gap loses it permanently.
 *
 * Override with STAR_LOOKBACK_DAYS to backfill after an outage.
 */
const DEFAULT_LOOKBACK_DAYS = 10;

export function getLookbackDays(): number {
  const raw = process.env.STAR_LOOKBACK_DAYS;
  if (!raw) return DEFAULT_LOOKBACK_DAYS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `Ignoring invalid STAR_LOOKBACK_DAYS=${raw}; using ${DEFAULT_LOOKBACK_DAYS} days.`
    );
    return DEFAULT_LOOKBACK_DAYS;
  }

  return parsed;
}

export function isWithinLastDays(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const daysAgo = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  return date >= daysAgo;
}

/**
 * Reads the highest page number out of a RFC 5988 Link header.
 *
 * The stargazers endpoint exposes no total count, so `rel="last"` is the only
 * way to locate the newest stars — see fetchAllRecentStargazers for why that
 * matters. A single-page result omits the header entirely.
 */
export function parseLastPage(linkHeader: string | undefined): number {
  if (!linkHeader) return 1;

  const lastLink = linkHeader
    .split(',')
    .find((part) => /rel="last"/.test(part));
  if (!lastLink) return 1;

  const page = lastLink.match(/[?&]page=(\d+)/)?.[1];
  return page ? Number(page) : 1;
}

export function toStargazerData(entry: unknown): StargazerData | null {
  if (typeof entry !== 'object' || entry === null) return null;

  const record = entry as Record<string, unknown>;
  const starredAt = typeof record.starred_at === 'string' ? record.starred_at : null;
  const rawUser = 'user' in record ? record.user : record;
  if (!starredAt || typeof rawUser !== 'object' || rawUser === null) return null;

  const user = rawUser as Record<string, unknown>;
  if (typeof user.id !== 'number' || typeof user.login !== 'string') return null;

  return {
    id: user.id,
    login: user.login,
    avatar_url: typeof user.avatar_url === 'string' ? user.avatar_url : '',
    html_url: typeof user.html_url === 'string' ? user.html_url : '',
    type: typeof user.type === 'string' ? user.type : 'User',
    starred_at: starredAt,
  };
}

export async function fetchStargazerPage(
  octokit: Octokit,
  owner: string,
  repo: string,
  page: number
): Promise<{ stargazers: StargazerData[]; lastPage: number }> {
  // `sort`/`direction` are deliberately absent: the stargazers endpoint ignores
  // them (verified — asc and desc return byte-identical payloads). Passing them
  // only creates the illusion of a newest-first ordering that does not exist.
  const response = await octokit.rest.activity.listStargazersForRepo({
    owner,
    repo,
    per_page: 100,
    page,
    headers: {
      Accept: 'application/vnd.github.v3.star+json'
    }
  });

  const stargazers = response.data
    .map(toStargazerData)
    .filter((entry): entry is StargazerData => entry !== null);

  return {
    stargazers,
    lastPage: parseLastPage(response.headers.link),
  };
}

/**
 * Collects stargazers who starred within the lookback window.
 *
 * The endpoint returns stars strictly oldest-first and ignores any attempt to
 * reverse that, so the newest stars live on the LAST page. This walks pages in
 * reverse and, within each page, entries in reverse, which yields a strictly
 * newest-first stream — only then is it safe to stop at the first star older
 * than the window.
 *
 * The previous implementation assumed newest-first ordering and broke on the
 * very first entry of page 1 (the oldest star in the repository), so it
 * returned zero stargazers on every run regardless of real activity.
 */
export async function fetchAllRecentStargazers(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<StargazerData[]> {
  const lookbackDays = getLookbackDays();
  const recent: StargazerData[] = [];

  const firstPage = await fetchStargazerPage(octokit, owner, repo, 1);
  let page = firstPage.lastPage;

  while (page >= 1) {
    console.log(`Fetching stargazers page ${page} of ${firstPage.lastPage}...`);

    const { stargazers } =
      page === 1 ? firstPage : await fetchStargazerPage(octokit, owner, repo, page);

    let reachedWindowEdge = false;
    for (const stargazer of [...stargazers].reverse()) {
      if (!isWithinLastDays(stargazer.starred_at, lookbackDays)) {
        reachedWindowEdge = true;
        break;
      }
      recent.push(stargazer);
    }

    if (reachedWindowEdge) break;
    page--;

    if (page >= 1) await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(
    `Found ${recent.length} stargazers for ${owner}/${repo} in the last ${lookbackDays} days.`
  );

  return recent;
} 