// Purpose: Script to fetch recent GitHub stargazers and their repositories
// Context: Maintains the list of users who starred this repository within the
//          lookback window defined in src/lib/github/api.ts (not 24 hours —
//          see the note on DEFAULT_LOOKBACK_DAYS there).

import { Octokit } from "@octokit/rest";
import { fetchRecentStargazers } from "../src/lib/github/stargazers";

async function main() {
  const auth = process.env.GITHUB_TOKEN;

  // The stargazers endpoint rejects anonymous requests with a 401 that surfaces
  // as an opaque Octokit stack trace. Failing here instead names the cause.
  if (!auth) {
    throw new Error(
      'GITHUB_TOKEN is not set. The GitHub stargazers API rejects unauthenticated ' +
        'requests with 401. In CI, pass it through with:\n' +
        '  env:\n' +
        '    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}'
    );
  }

  const octokit = new Octokit({ auth });

  await fetchRecentStargazers(octokit, "BlackShoreTech", "gittok.dev");
}

main().catch(error => {
  console.error('Error running script:', error);
  process.exit(1);
});