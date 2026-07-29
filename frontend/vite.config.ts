import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv, type PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';
import { createWSSGlobalInstance, onHttpServerUpgrade } from './src/lib/server/poker/ws-server';

// The realtime server is plain Node (no `$env` alias in the esbuild bundle), so
// it reads process.env — which Vite does not populate from frontend/.env. In
// dev/preview the vars it cares about are bridged over by hand; in production
// they come from the container environment (see k8s/base/nodejs/deployment.yaml).
const WS_ENV_KEYS = ['JIRA_BASE_URL'] as const;

function bridgeEnv(mode: string) {
	const env = loadEnv(mode, process.cwd(), '');
	for (const key of WS_ENV_KEYS) {
		if (!process.env[key] && env[key]) process.env[key] = env[key];
	}
}

// Attach the realtime WebSocket server to Vite's own HTTP server so it shares
// the dev/preview port (no separate :8080 process). In production the same
// wiring is mounted by src/server.ts instead.
const realtimeWebSocket: PluginOption = {
	name: 'poker-realtime-websocket',
	// Skip when running under Vitest — the unit tests spin up a Vite server we
	// don't want a live WebSocket attached to.
	apply: () => !process.env.VITEST,
	configureServer(server) {
		bridgeEnv(server.config.mode);
		createWSSGlobalInstance();
		server.httpServer?.on('upgrade', onHttpServerUpgrade);
	},
	configurePreviewServer(server) {
		bridgeEnv(server.config.mode);
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
		port: 34771
	},
	resolve: {
		conditions: ['browser']
	}
});
