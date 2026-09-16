import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
// From 'vitest/config' rather than 'vite': Vitest 4+ no longer augments Vite's
// own config type with the `test` key.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { promises as fs } from 'fs';
import * as path from 'path';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss(),
		// HTTPS is on by default for local dev (PWA/Web Share API need a secure context).
		// Set DISABLE_HTTPS=1 to serve plain HTTP, e.g. for headless-browser testing.
		...(process.env.DISABLE_HTTPS ? [] : [mkcert()]),
		{
			name: 'sql.js-httpvfs',
			configureServer(server) {
				// Copy SQL.js files to public directory in development
				server.middlewares.use(async (req, res, next) => {
					if (req.url?.startsWith('/sql.js-httpvfs/')) {
						const file = req.url.replace('/sql.js-httpvfs/', '');
						// First try static directory
						let filePath = resolve(__dirname, 'static/sql.js-httpvfs', file);
						
						// If not in static, try node_modules
						if (!await fs.access(filePath).then(() => true).catch(() => false)) {
							filePath = resolve(__dirname, 'node_modules/sql.js-httpvfs/dist', file);
						}
						
						try {
							const content = await fs.readFile(filePath);
							const contentType = file.endsWith('.wasm') 
								? 'application/wasm'
								: file.endsWith('.js') 
									? 'application/javascript'
									: 'application/octet-stream';
							
							res.setHeader('Content-Type', contentType);
							res.end(content);
						} catch (error) {
							console.error(`Error serving ${file}:`, error);
							next();
						}
					} else {
						next();
					}
				});
			},
			async buildStart() {
				// Ensure files are in static directory at build start
				const sourceDir = resolve(__dirname, 'node_modules/sql.js-httpvfs/dist');
				const targetDir = resolve(__dirname, 'static/sql.js-httpvfs');
				
				await fs.mkdir(targetDir, { recursive: true });
				
				const files = ['sqlite.worker.js', 'sql-wasm.wasm'];
				for (const file of files) {
					const sourcePath = path.join(sourceDir, file);
					const targetPath = path.join(targetDir, file);
					
					// Only copy if source is newer than target or target doesn't exist
					const [sourceStats, targetExists] = await Promise.all([
						fs.stat(sourcePath),
						fs.access(targetPath).then(() => true).catch(() => false)
					]);
					
					if (!targetExists || (await fs.stat(targetPath)).mtime < sourceStats.mtime) {
						await fs.copyFile(sourcePath, targetPath);
						console.log(`Copied ${file} to static directory`);
					}
				}
			}
		}
	],
	test: {
		// Renamed from `workspace` in Vitest 4.
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],

				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
