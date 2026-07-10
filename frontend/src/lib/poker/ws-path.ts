// The path the realtime WebSocket is served on. Same value is used by the
// server (to route the HTTP upgrade) and the browser client (to connect). It
// lives outside `$lib/server` because the client imports it too.
export const WS_PATH = '/poker-ws';
