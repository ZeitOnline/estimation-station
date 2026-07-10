import { browser } from '$app/environment';
import { base } from '$app/paths';
import { WS_PATH } from '$lib/poker/ws-path';
import type { Card, RoomState } from '$types';

// The realtime server now lives inside this SvelteKit app, so the WebSocket is
// on the same origin (see src/lib/server/poker/ws-server.ts). `VITE_WS_URL`
// stays as an optional override (e.g. pointing at a separate host).
function wsUrl(): string {
	if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
	const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${location.host}${base}${WS_PATH}`;
}

// Factory returning a reactive room client. Same shape idea as the ZEIT
// `oidc` wrapper: a `$state` object with methods.
export function createRoom() {
	let socket: WebSocket | null = null;
	let roomId = '';
	let userId = '';
	let name = '';
	let token: string | null = null;
	let closedByUs = false;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	const store = $state({
		state: null as RoomState | null,
		connected: false,
		error: null as string | null,

		connect(rId: string, uId: string, nm: string, tk: string | null = null) {
			roomId = rId;
			userId = uId;
			name = nm;
			token = tk;
			closedByUs = false;
			open();
		},
		vote(card: Card) {
			send({ type: 'vote', card });
		},
		reveal() {
			send({ type: 'reveal' });
		},
		reset() {
			send({ type: 'reset' });
		},
		setTicket(title: string) {
			send({ type: 'setTicket', title });
		},
		disconnect() {
			closedByUs = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			socket?.close();
		}
	});

	function open() {
		if (!browser) return;
		socket = new WebSocket(wsUrl());

		socket.onopen = () => {
			store.connected = true;
			store.error = null;
			send({ type: 'join', roomId, userId, name, token });
		};
		socket.onmessage = (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.type === 'state') store.state = msg.room;
			else if (msg.type === 'error') store.error = msg.message;
		};
		socket.onclose = () => {
			store.connected = false;
			if (!closedByUs) reconnectTimer = setTimeout(open, 1500);
		};
		socket.onerror = () => {
			store.error = 'Verbindungsfehler';
		};
	}

	function send(obj: unknown) {
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(obj));
		}
	}

	return store;
}
