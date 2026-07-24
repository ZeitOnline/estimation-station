import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Path aliases — same idea as wortgeflecht. Import with `$components`, `$lib`, etc.
		alias: {
			$components: './src/components',
			$types: './src/types'
		},
		// adapter-node builds a standalone Node server (build/index.js) — this is
		// the "own node server" SvelteKit gives you for free.
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		})
	}
};

export default config;
