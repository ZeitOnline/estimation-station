// =============================================================================
// server.ts — production entry point.
//
// adapter-node normally ships `build/index.js`, which starts its own HTTP
// server we can't hook into. Instead we build our OWN tiny server that mounts
// adapter-node's request `handler` and attaches the realtime WebSocket upgrade
// to the same HTTP server — so the app and the poker sockets share one port.
//
// This file is bundled by esbuild to `build/server.js` (see esbuild.server.js);
// `./handler.js` then resolves to the generated `build/handler.js` at runtime.
// The path is intentionally not resolvable at type-check time.
// =============================================================================

import { createServer } from 'node:http';
// @ts-expect-error — `./handler.js` is emitted next to the bundled output by
// `vite build`; it never resolves from src/, so this suppression is always live.
import { handler } from './handler.js';
import { createWSSGlobalInstance, onHttpServerUpgrade } from './lib/server/poker/ws-server';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const server = createServer(handler);

createWSSGlobalInstance();
server.on('upgrade', onHttpServerUpgrade);

server.listen(PORT, HOST, () => {
	console.log(`[poker] SvelteKit + realtime listening on http://${HOST}:${PORT}`);
});
