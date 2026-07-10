import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		globals: true,
		setupFiles: ['./src/setupTests.ts'],
		restoreMocks: true,
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		server: {
			deps: {
				inline: [/@sveltejs\/kit/]
			}
		}
	},
	resolve: {
		conditions: ['browser']
	}
});
