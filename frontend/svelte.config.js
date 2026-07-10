import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV === 'development';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Path aliases — same idea as wortgeflecht. Import with `$components`, `$lib`, etc.
		alias: {
			$components: './src/components',
			$types: './src/types'
		},
		// In production the app is served under a sub-path (like wortgeflecht's
		// `/wortgeflecht`); in dev it lives at `/`.
		paths: {
			base: !dev ? '/frontend' : ''
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
