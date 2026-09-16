<!--
  Purpose: Test page to demonstrate database connectivity and stargazer data fetching
  Context: Created as a test implementation to verify database client functionality
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { initDatabase, getStargazers } from '$lib/db/client';
  import type { Stargazer } from '$lib/db/types';

  let stargazers: Stargazer[] = [];
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      // Initialize the database with a test URL
      await initDatabase('/data/db.sqlite');
      
      // Fetch stargazers with some test parameters
      stargazers = await getStargazers({
        limit: 10,
        orderBy: 'starred_at',
        order: 'desc'
      });
      
      loading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'An unknown error occurred';
      loading = false;
    }
  });
</script>

<!-- A development scratch route. It prerenders real content now that SSR is on,
     so it needs an explicit noindex; robots.txt Disallow stops crawling but does
     not stop indexing on its own. -->
<svelte:head>
  <title>Database Test · GitTok</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gradient-to-b from-gray-900 to-black text-gray-100 p-6">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-4xl font-serif mb-8">Database Test Page</h1>
    
    {#if loading}
      <div class="backdrop-blur-sm bg-gray-800/50 p-6 rounded-lg">
        <p class="font-mono text-blue-400">Loading stargazers data...</p>
      </div>
    {:else if error}
      <div class="backdrop-blur-sm bg-red-900/50 p-6 rounded-lg">
        <p class="font-mono text-red-400">Error: {error}</p>
      </div>
    {:else}
      <div class="space-y-4">
        <h2 class="text-2xl font-serif mb-4">Recent Stargazers</h2>
        <div class="grid gap-4">
          {#each stargazers as stargazer (stargazer.id)}
            <div class="backdrop-blur-sm bg-gray-800/50 p-6 rounded-lg hover:bg-gray-700/50 transition-colors">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                  <img
                    src={stargazer.avatar_url}
                    alt={stargazer.login}
                    class="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h3 class="font-mono text-blue-400">{stargazer.login}</h3>
                    <p class="text-sm text-gray-400">{stargazer.starred_at ? new Date(stargazer.starred_at).toLocaleDateString() : 'Unknown date'}</p>
                  </div>
                </div>
                <div class="text-right">
                  <span class="font-mono text-yellow-400">{stargazer.type}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
        
        <div class="mt-6 text-center font-mono text-gray-400">
          Total Stargazers Shown: {stargazers.length}
        </div>
      </div>
    {/if}
  </div>
</div> 