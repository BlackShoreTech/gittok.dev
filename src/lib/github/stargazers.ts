// Purpose: Functions for fetching and processing GitHub stargazer data
// Context: Used to fetch and store stargazer information and their repositories

import { Octokit } from "@octokit/rest";
import { fetchAllRecentStargazers, getLookbackDays } from "./api";
import { upsertStargazer, processStargazerRepositories, printRecentStatistics } from "./db";

export async function fetchRecentStargazers(octokit: Octokit, owner: string, repo: string) {
  try {
    const stargazers = await fetchAllRecentStargazers(octokit, owner, repo);


    // Process each stargazer and their repositories
    for (const stargazer of stargazers) {
      console.log(`Processing user ${stargazer.login} who starred at ${stargazer.starred_at}...`);
      
      // Store stargazer data
      await upsertStargazer(stargazer);

      // Process and store repositories
      await processStargazerRepositories(octokit, stargazer);
    }

    await printRecentStatistics(getLookbackDays());

  } catch (error) {
    console.error('Error fetching or processing stargazers:', error);
    throw error;
  }
} 