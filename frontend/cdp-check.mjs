// Drive headless Chrome against the LAN IP (an INSECURE context, unlike
// localhost) to confirm: (a) no crypto.randomUUID exception, (b) the room page
// actually connects to the WebSocket and leaves the "Verbinde…" state.
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2]; // e.g. http://10.70.4.83:5173
const roomUrl = `${origin}/room/99999`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'cdp-'));

const chrome = spawn(CHROME, [
	'--headless=new',
	'--disable-gpu',
	'--remote-debugging-port=9333',
	`--user-data-dir=${profile}`,
	'about:blank'
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// wait for devtools endpoint
let target;
for (let i = 0; i < 40; i++) {
	try {
		const list = await (await fetch('http://127.0.0.1:9333/json')).json();
		target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
		if (target) break;
	} catch {
		/* not up yet */
	}
	await sleep(250);
}
if (!target) {
	console.log('FAILED: chrome devtools never came up');
	chrome.kill();
	process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 1e8 });
await new Promise((res) => ws.on('open', res));

let msgId = 0;
const pending = new Map();
const exceptions = [];
ws.on('message', (raw) => {
	const m = JSON.parse(raw.toString());
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m.result);
		pending.delete(m.id);
	}
	if (m.method === 'Runtime.exceptionThrown') {
		exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
	}
});
const cmd = (method, params = {}) =>
	new Promise((res) => {
		const id = ++msgId;
		pending.set(id, res);
		ws.send(JSON.stringify({ id, method, params }));
	});

await cmd('Runtime.enable');
await cmd('Page.enable');

// Seed a name so the room page doesn't bounce to the landing page. Leave
// poker.userId unset so getUserId() must generate one (exercises randomId()).
await cmd('Page.navigate', { url: origin });
await sleep(1200);
await cmd('Runtime.evaluate', {
	expression: `localStorage.setItem('poker.name','CDPPhone'); localStorage.removeItem('poker.userId');`
});

// Now load the room and give the WebSocket time to connect.
await cmd('Page.navigate', { url: roomUrl });
await sleep(3000);

const body = await cmd('Runtime.evaluate', {
	expression: `document.body.innerText`,
	returnByValue: true
});
const text = body?.result?.value || '';
const statusConnected = /verbunden/.test(text) && !/getrennt/.test(text);
const stillConnecting = /Verbinde mit dem Raum/.test(text);
const uuidErr = exceptions.filter((e) => /randomUUID/.test(e));

console.log('--- exceptions ---');
console.log(exceptions.length ? exceptions.join('\n') : '(none)');
console.log('--- room page body (excerpt) ---');
console.log(text.replace(/\s+/g, ' ').slice(0, 200));
console.log('--- verdict ---');
console.log('randomUUID error present:', uuidErr.length > 0);
console.log('status shows connected:  ', statusConnected);
console.log('still stuck on Verbinde…: ', stillConnecting);

ws.close();
chrome.kill();
const ok = uuidErr.length === 0 && statusConnected && !stillConnecting;
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
