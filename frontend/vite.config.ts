import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';
import { createWSSGlobalInstance, onHttpServerUpgrade } from './src/lib/server/poker/ws-server';

// Attach the realtime WebSocket server to Vite's own HTTP server so it shares
// the dev/preview port (no separate :8080 process). In production the same
// wiring is mounted by src/server.ts instead.
const realtimeWebSocket: PluginOption = {
	name: 'poker-realtime-websocket',
	// Skip when running under Vitest — the unit tests spin up a Vite server we
	// don't want a live WebSocket attached to.
	apply: () => !process.env.VITEST,
	configureServer(server) {
		createWSSGlobalInstance();
		server.httpServer?.on('upgrade', onHttpServerUpgrade);
	},
	configurePreviewServer(server) {
		createWSSGlobalInstance();
		server.httpServer?.on('upgrade', onHttpServerUpgrade);
	}
};

export default defineConfig({
	plugins: [sveltekit(), realtimeWebSocket],
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
	server: {
		host: true,
		port: '34771'
	},
	resolve: {
		conditions: ['browser']
	}
});
