// =============================================================================
// avatar.ts — deterministic cartoon avatars, ported from the "Dev Avatar Lab".
//
// Pure string-in / SVG-string-out, no DOM and no storage, so the same module
// runs in the browser (rendering) and in the WebSocket server (validating).
//
//   • fromSeed(name)   — same name, same avatar, every time. This is the
//                        default for everyone and needs no state anywhere.
//   • sanitizeAvatar() — allowlist-validates a customised avatar that a client
//                        sent us. Every field must be one of the known values,
//                        which is also what makes the SVG safe to inject.
//   • avatarSvg()      — draws it.
// =============================================================================

export interface Avatar {
	style: string;
	eyes: string;
	mouth: string;
	hat: string;
	hair: string;
	acc: string;
	extra: string;
	body: string;
	hairC: string;
	hatC: string;
	bg: string;
	/** Label on the keycap style. */
	key: string;
	/** Ticket number on the ticket style. */
	num: number;
	/** Story points on the ticket style. */
	pts: number;
}

export type TraitKey = 'style' | 'eyes' | 'mouth' | 'hat' | 'hair' | 'acc' | 'extra';
export type ColorKey = 'body' | 'hairC' | 'hatC' | 'bg';

// Where the face sits on a given body shape.
interface Anchors {
	cx: number;
	eyeY: number;
	eyeDx: number;
	mouthY: number;
	top: number;
	hw: number;
	chin: number;
	earY: number;
	earDx: number;
}
interface Shape {
	a: Anchors;
	body: (s: Avatar) => string;
	mouth?: (s: Avatar) => string;
	noHat?: (s: Avatar) => string;
}

const INK = '#1D1B24';
const MONO = 'JetBrains Mono, Menlo, monospace';
const SANS = 'Lora, Georgia, serif';
export const PAL: Record<ColorKey, string[]> = {
	body: [
		'#FFD23F',
		'#F3E9D2',
		'#FAFAF7',
		'#8FD6B3',
		'#FF8A72',
		'#B9A6F0',
		'#7CC6F2',
		'#D9B382',
		'#6FBF73'
	],
	hairC: ['#D9692B', '#6B4226', '#2B2B2B', '#E8C15A', '#C4C4C4', '#F06AA8'],
	hatC: ['#3E7C4F', '#D64545', '#2D3A6B', '#7A4CC2', '#F08A24', '#1F9E9A'],
	bg: ['#1E2235', '#3B2440', '#1F3A30', '#2E3440', '#F5EFE0', '#E8B64C', '#CFE7F5']
};
const GENERIC = ['cloud', 'duck', 'mug', 'keycap', 'bug', 'ghost', 'blob', 'cactus'];
export const T: Record<TraitKey, string[]> = {
	style: GENERIC.concat(['sticky', 'calendar', 'ticket', 'backlog', 'vector', 'swatch']),
	eyes: ['dots', 'glasses', 'shades', 'sleepy', 'wide', 'wink'],
	mouth: ['smile', 'grin', 'flat', 'oh', 'tongue', 'smirk'],
	hat: ['none', 'beret', 'beanie', 'headphones', 'catears', 'cap', 'propeller', 'crown', 'party'],
	hair: ['none', 'beard', 'mustache', 'goatee', 'full'],
	acc: [
		'none',
		'laptop',
		'sidekick',
		'energy',
		'headset',
		'clipboard',
		'stopwatch',
		'stamp',
		'flag',
		'magnifier',
		'stylus',
		'eyedropper',
		'palette'
	],
	extra: ['none', 'blush', 'sweat', 'bandaid']
};
export const LABEL: Record<TraitKey, Record<string, string>> = {
	style: {
		cloud: 'Cloud',
		duck: 'Rubber duck',
		mug: 'Coffee mug',
		keycap: 'Keycap',
		bug: 'Bug',
		ghost: '404 ghost',
		blob: 'Potato',
		cactus: 'Desk cactus',
		sticky: 'Sticky note',
		calendar: 'Calendar',
		ticket: 'Ticket',
		backlog: 'Backlog box',
		vector: 'Vector blob',
		swatch: 'Color swatch'
	},
	eyes: {
		dots: 'Dots',
		glasses: 'Glasses',
		shades: 'Shades',
		sleepy: 'Sleepy',
		wide: 'Wide awake',
		wink: 'Wink'
	},
	mouth: {
		smile: 'Smile',
		grin: 'Grin',
		flat: 'Unimpressed',
		oh: 'Oh no',
		tongue: 'Silly',
		smirk: 'Smirk'
	},
	hat: {
		none: 'None',
		beret: 'Beret',
		beanie: 'Beanie',
		headphones: 'Headphones',
		catears: 'Cat-ear headphones',
		cap: 'Cap',
		propeller: 'Propeller hat',
		crown: 'Crown',
		party: 'Party hat'
	},
	hair: {
		none: 'Clean shaven',
		beard: 'Beard',
		mustache: 'Mustache',
		goatee: 'Goatee',
		full: 'Full Viking'
	},
	acc: {
		none: 'None',
		laptop: 'Sticker laptop',
		sidekick: 'Duck sidekick',
		energy: 'Energy drink',
		headset: 'Headset',
		clipboard: 'Clipboard',
		stopwatch: 'Timebox stopwatch',
		stamp: 'WONTFIX stamp',
		flag: 'P1 flag',
		magnifier: 'Magnifier',
		stylus: 'Stylus',
		eyedropper: 'Eyedropper',
		palette: 'Paint palette'
	},
	extra: { none: 'None', blush: 'Blush', sweat: 'Friday deploy sweat', bandaid: 'Band-aid' }
};
const KEYS = ['Esc', 'F5', 'Del', 'Ctrl', 'Tab', '⌘', 'Alt', 'Fn', 'Enter', 'Ctrl+Z'];

/* ---------- seeded randomness ---------- */
function seedOf(str: string) {
	let h = 1779033703 ^ str.length;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	h = Math.imul(h ^ (h >>> 16), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	return (h ^ (h >>> 16)) >>> 0;
}
function rng(str: string) {
	let a = seedOf(str);
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const PTS = [1, 2, 3, 5, 8, 13];
const PREFERRED_BODY: Record<string, string> = {
	cloud: '#F3E9D2',
	duck: '#FFD23F',
	cactus: '#6FBF73',
	blob: '#D9B382',
	ghost: '#F3E9D2',
	sticky: '#FFD23F',
	calendar: '#FAFAF7',
	ticket: '#FAFAF7',
	backlog: '#D9B382'
};

/**
 * The avatar a name gets by default. `salt` rerolls it (used by "shuffle").
 * Draw order matches the Avatar Lab, so a name looks the same in both.
 */
export function fromSeed(name: string, salt = ''): Avatar {
	const key = (name || '').trim().toLowerCase();
	const r = rng(`${key}|dev${salt}`);
	const p = <V>(arr: V[]): V => arr[Math.floor(r() * arr.length)];
	const style = p(T.style);
	const pref = PREFERRED_BODY[style];
	return {
		style,
		eyes: p(T.eyes),
		mouth: p(T.mouth),
		hat: r() < 0.2 ? 'none' : p(T.hat.slice(1)),
		hair: p(T.hair),
		acc: r() < 0.35 ? 'none' : p(T.acc.slice(1)),
		extra: r() < 0.5 ? 'none' : p(T.extra.slice(1)),
		body: pref && r() < 0.7 ? pref : p(PAL.body),
		hairC: p(PAL.hairC),
		hatC: p(PAL.hatC),
		bg: p(PAL.bg),
		key: p(KEYS),
		num: 100 + Math.floor(r() * 9900),
		pts: p(PTS)
	};
}

/**
 * Validate an avatar that came over the wire (or out of localStorage). Returns
 * null unless every field is a known value — callers then fall back to
 * fromSeed(name).
 */
export function sanitizeAvatar(input: unknown): Avatar | null {
	if (!input || typeof input !== 'object') return null;
	const v = input as Record<string, unknown>;
	const pick = (list: readonly string[], x: unknown) =>
		typeof x === 'string' && list.includes(x) ? x : null;
	const style = pick(T.style, v.style),
		eyes = pick(T.eyes, v.eyes),
		mouth = pick(T.mouth, v.mouth),
		hat = pick(T.hat, v.hat),
		hair = pick(T.hair, v.hair),
		acc = pick(T.acc, v.acc),
		extra = pick(T.extra, v.extra),
		body = pick(PAL.body, v.body),
		hairC = pick(PAL.hairC, v.hairC),
		hatC = pick(PAL.hatC, v.hatC),
		bg = pick(PAL.bg, v.bg),
		key = pick(KEYS, v.key);
	const num = v.num,
		pts = v.pts;
	if (
		!style ||
		!eyes ||
		!mouth ||
		!hat ||
		!hair ||
		!acc ||
		!extra ||
		!body ||
		!hairC ||
		!hatC ||
		!bg ||
		!key
	)
		return null;
	if (typeof num !== 'number' || !Number.isInteger(num) || num < 100 || num > 9999) return null;
	if (typeof pts !== 'number' || !PTS.includes(pts)) return null;
	return { style, eyes, mouth, hat, hair, acc, extra, body, hairC, hatC, bg, key, num, pts };
}

/* ---------- drawing helpers ---------- */
function shade(hex: string, p: number) {
	const n = parseInt(hex.slice(1), 16);
	let r = n >> 16,
		g = (n >> 8) & 255,
		b = n & 255;
	const t = p < 0 ? 0 : 255,
		q = Math.abs(p);
	r = Math.round((t - r) * q + r);
	g = Math.round((t - g) * q + g);
	b = Math.round((t - b) * q + b);
	return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
function esc(s: unknown) {
	return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
const ESC: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};
const OUTLINE = true;
const OL = () => (OUTLINE ? ` stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"` : '');
const CLOUD = (() => {
	const cx = 100,
		cy = 102,
		rx = 54,
		ry = 44,
		ang = [-100, -62, -24, 12, 48, 84, 120, 156, 192, 228];
	const pt = (d: number) => {
		const t = (d * Math.PI) / 180;
		return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
	};
	let p = pt(ang[0]),
		d = `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
	for (let i = 1; i <= ang.length; i++) {
		const q = pt(i === ang.length ? ang[0] + 360 : ang[i]);
		const r = (Math.hypot(q[0] - p[0], q[1] - p[1]) / 2) * 1.04;
		d += ` A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
		p = q;
	}
	return `${d} Z`;
})();

const S: Record<string, Shape> = {
	cloud: {
		a: {
			cx: 100,
			eyeY: 98,
			eyeDx: 16,
			mouthY: 118,
			top: 52,
			hw: 44,
			chin: 140,
			earY: 104,
			earDx: 62
		},
		body: (s) =>
			`<ellipse cx="100" cy="202" rx="56" ry="36" fill="#3A3F58"/><path d="${CLOUD}" fill="${s.body}"/>`
	},
	duck: {
		a: {
			cx: 100,
			eyeY: 76,
			eyeDx: 15,
			mouthY: 96,
			top: 46,
			hw: 36,
			chin: 118,
			earY: 84,
			earDx: 41
		},
		body: (s) => `<ellipse cx="100" cy="170" rx="64" ry="44" fill="${shade(s.body, -0.08)}"/>
      <ellipse cx="70" cy="162" rx="20" ry="10" fill="${shade(s.body, -0.2)}" transform="rotate(-20 70 162)"/>
      <circle cx="100" cy="84" r="40" fill="${s.body}"/>`,
		mouth: (s) => {
			const open = ['grin', 'oh', 'tongue'].includes(s.mouth);
			return open
				? `<ellipse cx="100" cy="102" rx="12" ry="6" fill="${INK}"/>${s.mouth === 'tongue' ? '<ellipse cx="100" cy="104" rx="6" ry="3.5" fill="#F07A8E"/>' : ''}<ellipse cx="100" cy="108" rx="13" ry="4.5" fill="#E07A1F"/><ellipse cx="100" cy="95" rx="19" ry="7" fill="#F59A2E"/>`
				: `<ellipse cx="100" cy="100" rx="13" ry="4.5" fill="#E07A1F"/><ellipse cx="100" cy="95" rx="19" ry="7" fill="#F59A2E"/>`;
		}
	},
	mug: {
		a: {
			cx: 98,
			eyeY: 104,
			eyeDx: 17,
			mouthY: 126,
			top: 66,
			hw: 44,
			chin: 150,
			earY: 108,
			earDx: 47
		},
		body: (
			s
		) => `${OUTLINE ? `<path d="M144 98 h8 a20 20 0 0 1 0 40 h-8" fill="none" stroke="${INK}" stroke-width="17"/>` : ''}<path d="M144 98 h8 a20 20 0 0 1 0 40 h-8" fill="none" stroke="${shade(s.body, -0.15)}" stroke-width="11"/>
      <rect x="52" y="70" width="92" height="116" rx="16" fill="${s.body}"/>
      <ellipse cx="98" cy="72" rx="46" ry="8" fill="${shade(s.body, -0.15)}"/>
      <ellipse cx="98" cy="73" rx="39" ry="5" fill="#5B3A22"/>
      <text x="98" y="176" stroke="none" text-anchor="middle" font-family="${MONO}" font-size="11" font-weight="700" fill="${shade(s.body, -0.4)}">{ }</text>`,
		noHat:
			() => `<g fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="4" stroke-linecap="round">
      <path d="M80 58 q-6 -8 0 -16 q6 -8 0 -16"/><path d="M98 56 q-6 -8 0 -16 q6 -8 0 -16"/><path d="M116 58 q-6 -8 0 -16 q6 -8 0 -16"/></g>`
	},
	keycap: {
		a: {
			cx: 100,
			eyeY: 102,
			eyeDx: 18,
			mouthY: 126,
			top: 46,
			hw: 56,
			chin: 146,
			earY: 104,
			earDx: 60
		},
		body: (
			s
		) => `<rect x="32" y="40" width="136" height="142" rx="20" fill="${shade(s.body, -0.22)}"/>
      <rect x="44" y="46" width="112" height="114" rx="14" fill="${s.body}"/>
      <text x="54" y="68" stroke="none" font-family="${MONO}" font-weight="700" font-size="${s.key.length > 3 ? 10 : 13}" fill="${shade(s.body, -0.5)}">${esc(s.key)}</text>`
	},
	bug: {
		a: {
			cx: 100,
			eyeY: 78,
			eyeDx: 12,
			mouthY: 94,
			top: 52,
			hw: 28,
			chin: 108,
			earY: 84,
			earDx: 33
		},
		body: (s) => {
			const d = shade(s.body, -0.25);
			return `<g stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none">
      <path d="M62 120 l-22 -8"/><path d="M56 142 l-24 2"/><path d="M62 164 l-20 12"/>
      <path d="M138 120 l22 -8"/><path d="M144 142 l24 2"/><path d="M138 164 l20 12"/></g>
      <ellipse cx="100" cy="142" rx="48" ry="46" fill="${s.body}"/>
      <path d="M100 104 V188" stroke="${d}" stroke-width="3"/>
      <circle cx="80" cy="132" r="7" fill="${d}"/><circle cx="122" cy="128" r="6" fill="${d}"/>
      <circle cx="84" cy="162" r="6" fill="${d}"/><circle cx="118" cy="160" r="8" fill="${d}"/>
      <path d="M88 56 q-10 -24 -22 -26 M112 56 q10 -24 22 -26" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="66" cy="30" r="5" fill="${INK}"/><circle cx="134" cy="30" r="5" fill="${INK}"/>
      <circle cx="100" cy="82" r="32" fill="${shade(s.body, 0.4)}"/>`;
		}
	},
	ghost: {
		a: {
			cx: 100,
			eyeY: 92,
			eyeDx: 17,
			mouthY: 116,
			top: 48,
			hw: 42,
			chin: 138,
			earY: 96,
			earDx: 48
		},
		body: (
			s
		) => `<path d="M52 178 V96 A48 48 0 0 1 148 96 V178 q-8 -12 -16 0 q-8 12 -16 0 q-8 -12 -16 0 q-8 12 -16 0 q-8 -12 -16 0 q-8 12 -16 0 Z" fill="${s.body}"/>
      <text x="100" y="166" stroke="none" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="15" fill="${shade(s.body, -0.3)}">404</text>`
	},
	blob: {
		a: {
			cx: 100,
			eyeY: 96,
			eyeDx: 18,
			mouthY: 122,
			top: 52,
			hw: 40,
			chin: 144,
			earY: 100,
			earDx: 50
		},
		body: (s) => {
			const d = shade(s.body, -0.2);
			return `<path d="M58 84 C58 46 138 38 146 80 C154 112 160 150 128 170 C98 186 54 174 48 142 C44 116 58 106 58 84 Z" fill="${s.body}"/>
      <g stroke="none"><circle cx="70" cy="150" r="3" fill="${d}"/><circle cx="136" cy="110" r="3.5" fill="${d}"/>
      <circle cx="126" cy="156" r="2.5" fill="${d}"/><circle cx="74" cy="72" r="2.5" fill="${d}"/></g>`;
		}
	},
	cactus: {
		a: {
			cx: 100,
			eyeY: 82,
			eyeDx: 14,
			mouthY: 104,
			top: 48,
			hw: 30,
			chin: 122,
			earY: 86,
			earDx: 31
		},
		body: (s) => {
			const d = shade(s.body, -0.22);
			return `
      <path d="M76 108 H62 V87 a9 9 0 0 0 -18 0 V113 a9 9 0 0 0 9 9 H76 Z" fill="${s.body}"/>
      <path d="M124 94 H138 V75 a9 9 0 0 1 18 0 V99 a9 9 0 0 1 -9 9 H124 Z" fill="${s.body}"/>
      <rect x="70" y="46" width="60" height="112" rx="30" fill="${s.body}"/>
      <g stroke="${d}" stroke-width="2" stroke-linecap="round"><path d="M78 70 l-4 -3 M122 74 l4 -3 M78 132 l-4 2 M122 136 l4 2 M52 92 l-4 -2 M148 80 l4 -2"/></g>
      <path d="M62 152 L138 152 L130 196 L70 196 Z" fill="#C8643B"/>
      <rect x="56" y="140" width="88" height="15" rx="4" fill="#D9774D"/>`;
		},
		noHat:
			() => `<g transform="translate(100 46)"><circle cx="0" cy="-8" r="6" fill="#F06AA8"/><circle cx="8" cy="-2" r="6" fill="#F06AA8"/>
      <circle cx="-8" cy="-2" r="6" fill="#F06AA8"/><circle cx="5" cy="6" r="6" fill="#F06AA8"/><circle cx="-5" cy="6" r="6" fill="#F06AA8"/>
      <circle cx="0" cy="0" r="4.5" fill="#FFD23F"/></g>`
	},
	sticky: {
		a: {
			cx: 100,
			eyeY: 98,
			eyeDx: 20,
			mouthY: 122,
			top: 44,
			hw: 54,
			chin: 144,
			earY: 100,
			earDx: 62
		},
		body: (s) => {
			const d = shade(s.body, -0.18);
			return `<path d="M40 44 H160 V148 L138 170 H40 Z" fill="${s.body}"/><path d="M160 148 L138 170 L142 152 Z" fill="${d}"/>
      <text x="50" y="64" stroke="none" font-family="${SANS}" font-weight="800" font-size="12" fill="${shade(s.body, -0.55)}">TODO</text>`;
		},
		noHat: () =>
			`<rect x="82" y="34" width="36" height="14" rx="2" fill="#FFFFFF" fill-opacity=".7" stroke="none" transform="rotate(-5 100 41)"/>`
	},
	calendar: {
		a: {
			cx: 100,
			eyeY: 110,
			eyeDx: 18,
			mouthY: 134,
			top: 50,
			hw: 56,
			chin: 152,
			earY: 114,
			earDx: 62
		},
		body: (s) => `<rect x="42" y="50" width="116" height="128" rx="12" fill="${s.body}"/>
      <path d="M42 84 V62 a12 12 0 0 1 12 -12 h92 a12 12 0 0 1 12 12 V84 Z" fill="#D64545"/>
      <text x="100" y="72" stroke="none" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="11" fill="#fff">MEETINGS</text>
      <g stroke="none" fill="${shade(s.body, -0.12)}"><rect x="52" y="160" width="16" height="8" rx="2"/><rect x="74" y="160" width="16" height="8" rx="2"/><rect x="110" y="160" width="16" height="8" rx="2"/><rect x="132" y="160" width="16" height="8" rx="2"/></g>
      <rect x="66" y="40" width="8" height="20" rx="4" fill="#5D6180"/><rect x="126" y="40" width="8" height="20" rx="4" fill="#5D6180"/>`
	},
	ticket: {
		a: {
			cx: 100,
			eyeY: 106,
			eyeDx: 18,
			mouthY: 128,
			top: 54,
			hw: 56,
			chin: 148,
			earY: 110,
			earDx: 64
		},
		body: (s) => `<rect x="36" y="54" width="128" height="116" rx="12" fill="${s.body}"/>
      <rect x="42" y="62" width="6" height="100" rx="3" fill="${s.hatC}" stroke="none"/>
      <text x="56" y="75" stroke="none" font-family="${MONO}" font-weight="700" font-size="10.5" fill="${shade(s.body, -0.5)}">TASK-${s.num}</text>
      <circle cx="148" cy="156" r="10" fill="${shade(s.body, -0.12)}"/>
      <text x="148" y="160" stroke="none" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="10" fill="${INK}">${s.pts}</text>`
	},
	backlog: {
		a: {
			cx: 100,
			eyeY: 120,
			eyeDx: 20,
			mouthY: 144,
			top: 90,
			hw: 52,
			chin: 164,
			earY: 124,
			earDx: 58
		},
		body: (s) => {
			const d = shade(s.body, -0.18);
			return `<g transform="rotate(-12 77 76)"><rect x="62" y="52" width="30" height="46" rx="3" fill="#FAFAF7"/><path d="M68 62 h18 M68 70 h12" stroke="#9AA0AE" stroke-width="2.5"/></g>
      <g transform="rotate(10 120 72)"><rect x="106" y="48" width="30" height="50" rx="3" fill="#FFE68A"/><path d="M112 58 h18 M112 66 h10" stroke="#C9A93A" stroke-width="2.5"/></g>
      <rect x="86" y="58" width="28" height="42" rx="3" fill="#F7B7CF" transform="rotate(-2 100 79)"/>
      <polygon points="44,92 26,76 70,80 80,92" fill="${d}"/><polygon points="156,92 174,76 130,80 120,92" fill="${d}"/>
      <rect x="40" y="90" width="120" height="96" rx="6" fill="${s.body}"/>
      <text x="100" y="180" stroke="none" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="10" fill="${shade(s.body, -0.45)}">BACKLOG</text>`;
		}
	},
	vector: {
		a: {
			cx: 100,
			eyeY: 96,
			eyeDx: 18,
			mouthY: 122,
			top: 46,
			hw: 44,
			chin: 144,
			earY: 100,
			earDx: 54
		},
		body: (s) => {
			const h = '#2F8FD8';
			const anchors = [
				[100, 44],
				[152, 108],
				[98, 164],
				[48, 106]
			]
				.map(
					([x, y]) =>
						`<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#fff" stroke="${h}" stroke-width="2"/>`
				)
				.join('');
			const ends = [
				[64, 44],
				[140, 44],
				[156, 80],
				[148, 140],
				[126, 166],
				[68, 162],
				[46, 138],
				[50, 74]
			]
				.map(
					([x, y]) =>
						`<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="${h}" stroke-width="1.5"/>`
				)
				.join('');
			const corners = [
				[40, 38],
				[160, 38],
				[40, 170],
				[160, 170]
			]
				.map(
					([x, y]) =>
						`<rect x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" fill="#fff" stroke="${h}" stroke-width="1.2"/>`
				)
				.join('');
			return `<rect x="40" y="38" width="120" height="132" fill="none" stroke="${h}" stroke-width="1.2" stroke-dasharray="4 3"/>${corners}
      <path d="M100 44 C140 44 156 80 152 108 C148 140 126 166 98 164 C68 162 46 138 48 106 C50 74 64 44 100 44 Z" fill="${s.body}"/>
      <path d="M64 44 H140 M156 80 L148 140 M126 166 L68 162 M46 138 L50 74" fill="none" stroke="${h}" stroke-width="1.5"/>${ends}${anchors}`;
		}
	},
	swatch: {
		a: {
			cx: 100,
			eyeY: 80,
			eyeDx: 18,
			mouthY: 104,
			top: 34,
			hw: 50,
			chin: 122,
			earY: 84,
			earDx: 58
		},
		body: (s) => `<rect x="46" y="32" width="108" height="144" rx="8" fill="#FAFAF7"/>
      <path d="M46 132 V40 a8 8 0 0 1 8 -8 h92 a8 8 0 0 1 8 8 V132 Z" fill="${s.body}"/>
      <text x="56" y="152" stroke="none" font-family="${SANS}" font-weight="800" font-size="13" fill="${INK}">SWATCH</text>
      <text x="56" y="166" stroke="none" font-family="${MONO}" font-size="10" fill="#5D6180">${s.body.toUpperCase()}</text>`
	}
};

function eyes(s: Avatar, a: Anchors) {
	const L = a.cx - a.eyeDx,
		R = a.cx + a.eyeDx,
		y = a.eyeY;
	const dot = (x: number) =>
		`<circle cx="${x}" cy="${y}" r="4.6" fill="${INK}"/><circle cx="${x + 1.6}" cy="${y - 1.6}" r="1.5" fill="#fff"/>`;
	const st = `stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"`;
	switch (s.eyes) {
		case 'glasses':
			return (
				dot(L) +
				dot(R) +
				`<g fill="#fff" fill-opacity=".25" stroke="${INK}" stroke-width="2.6"><circle cx="${L}" cy="${y}" r="10"/><circle cx="${R}" cy="${y}" r="10"/></g><path d="M${L + 10} ${y} Q${a.cx} ${y - 5} ${R - 10} ${y}" stroke="${INK}" stroke-width="2.6" fill="none"/>`
			);
		case 'shades':
			return `<g fill="${INK}"><rect x="${L - 12}" y="${y - 7}" width="24" height="13" rx="5"/><rect x="${R - 12}" y="${y - 7}" width="24" height="13" rx="5"/></g><path d="M${L + 12} ${y - 3} H${R - 12}" stroke="${INK}" stroke-width="3"/><g stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"><path d="M${L - 7} ${y - 3} h6"/><path d="M${R - 7} ${y - 3} h6"/></g>`;
		case 'sleepy':
			return `<path d="M${L - 6} ${y} q6 5 12 0" ${st}/><path d="M${R - 6} ${y} q6 5 12 0" ${st}/><text x="${R + 12}" y="${y - 12}" font-family="${MONO}" font-weight="700" font-size="11" fill="${INK}" fill-opacity=".7">z</text><text x="${R + 19}" y="${y - 20}" font-family="${MONO}" font-weight="700" font-size="8" fill="${INK}" fill-opacity=".5">z</text>`;
		case 'wide':
			return `<g fill="#fff" stroke="${INK}" stroke-width="2"><circle cx="${L}" cy="${y}" r="8"/><circle cx="${R}" cy="${y}" r="8"/></g><circle cx="${L + 2}" cy="${y + 1}" r="3.5" fill="${INK}"/><circle cx="${R - 2}" cy="${y + 1}" r="3.5" fill="${INK}"/>`;
		case 'wink':
			return `${dot(L)}<path d="M${R - 6} ${y + 2} q6 -8 12 0" ${st}/>`;
		default:
			return dot(L) + dot(R);
	}
}
function mouth(s: Avatar, a: Anchors) {
	const x = a.cx,
		y = a.mouthY,
		st = `stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"`;
	switch (s.mouth) {
		case 'grin':
			return `<path d="M${x - 12} ${y} h24 q0 12 -12 12 q-12 0 -12 -12z" fill="${INK}"/><rect x="${x - 9}" y="${y}" width="18" height="4" rx="1" fill="#fff"/>`;
		case 'flat':
			return `<path d="M${x - 8} ${y + 2} h16" ${st}/>`;
		case 'oh':
			return `<ellipse cx="${x}" cy="${y + 3}" rx="4.5" ry="5.5" fill="${INK}"/>`;
		case 'tongue':
			return `<path d="M${x - 11} ${y} h22 q0 11 -11 11 q-11 0 -11 -11z" fill="${INK}"/><path d="M${x - 6} ${y + 7} q6 -4 12 0 q0 6 -6 6 q-6 0 -6 -6z" fill="#F07A8E"/>`;
		case 'smirk':
			return `<path d="M${x - 9} ${y + 3} q10 4 16 -5" ${st}/>`;
		default:
			return `<path d="M${x - 10} ${y} q10 10 20 0" ${st}/>`;
	}
}
function beard(s: Avatar, a: Anchors) {
	const x = a.cx,
		my = a.mouthY,
		bw = a.eyeDx + 14,
		ch = a.chin;
	return `<path d="M${x - bw} ${my - 10} Q${x - bw - 2} ${ch + 14} ${x} ${ch + 18} Q${x + bw + 2} ${ch + 14} ${x + bw} ${my - 10} Q${x} ${my + 6} ${x - bw} ${my - 10}Z" fill="${s.hairC}"/>`;
}
function goatee(s: Avatar, a: Anchors) {
	const x = a.cx,
		my = a.mouthY;
	return `<path d="M${x - 7} ${my + 10} Q${x} ${my + 6} ${x + 7} ${my + 10} L${x} ${a.chin + 12} Z" fill="${s.hairC}"/>`;
}
function mustache(s: Avatar, a: Anchors) {
	const x = a.cx,
		my = a.mouthY;
	return `<g fill="${s.hairC}"><path d="M${x} ${my - 4} q-6 -8 -15 -4 q-6 3 -10 -1 q2 9 12 9 q8 0 13 -4z"/><path d="M${x} ${my - 4} q6 -8 15 -4 q6 3 10 -1 q-2 9 -12 9 q-8 0 -13 -4z"/></g>`;
}
function extra(s: Avatar, a: Anchors) {
	const L = a.cx - a.eyeDx,
		R = a.cx + a.eyeDx,
		y = a.eyeY;
	switch (s.extra) {
		case 'blush':
			return `<g fill="#FF6B8B" fill-opacity=".45"><ellipse cx="${L - 6}" cy="${y + 12}" rx="6" ry="3.5"/><ellipse cx="${R + 6}" cy="${y + 12}" rx="6" ry="3.5"/></g>`;
		case 'sweat': {
			const x = R + 16,
				yy = y - 12;
			return `<path d="M${x} ${yy} q-7 10 0 13 q7 -3 0 -13z" fill="#8FD3FF" stroke="#fff" stroke-width="1.5"/>`;
		}
		case 'bandaid':
			return `<g transform="rotate(-25 ${L - 2} ${y - 14})"><rect x="${L - 11}" y="${y - 18}" width="18" height="8" rx="3" fill="#F2C9A0"/><rect x="${L - 5}" y="${y - 18}" width="6" height="8" fill="#E3B488"/></g>`;
		default:
			return '';
	}
}
function accessory(s: Avatar, a: Anchors) {
	const R = a.cx + a.eyeDx;
	switch (s.acc) {
		case 'laptop': {
			const y = Math.max(a.chin + 6, 148);
			return `<g transform="translate(${a.cx} ${y})"><rect x="-44" y="0" width="88" height="56" rx="7" fill="#B8BCC8"/><circle cx="-22" cy="18" r="8" fill="#F06AA8"/><rect x="2" y="9" width="18" height="11" rx="2" fill="#FFD23F" transform="rotate(8 11 14)"/><circle cx="22" cy="36" r="6.5" fill="#8FD6B3"/><text x="-14" y="42" stroke="none" font-family="${MONO}" font-weight="700" font-size="10" fill="#2D3A6B">&lt;/&gt;</text></g>`;
		}
		case 'sidekick':
			return `<g transform="translate(154 160)"><ellipse cx="0" cy="8" rx="16" ry="11" fill="#FFD23F"/><circle cx="5" cy="-6" r="9" fill="#FFD23F"/><path d="M12 -5 q8 1 9 4 q-6 2 -10 0z" fill="#F59A2E"/><circle cx="7" cy="-8" r="1.8" fill="${INK}" stroke="none"/></g>`;
		case 'energy':
			return `<g transform="translate(46 156) rotate(-10)"><rect x="-10" y="-20" width="20" height="40" rx="4" fill="#2F8FD8"/><ellipse cx="0" cy="-20" rx="10" ry="3" fill="#C4C4C4"/><polygon points="2,-12 -5,2 0,2 -3,13 6,-3 1,-3 4,-12" fill="#FFD23F" stroke="none"/></g>`;
		case 'headset': {
			const x = a.cx - a.earDx + 2,
				y = a.earY;
			return `<rect x="${x - 8}" y="${y - 12}" width="14" height="24" rx="6" fill="#2B2B2B"/><path d="M${x} ${y + 8} Q${x + 4} ${a.mouthY + 10} ${a.cx - 14} ${a.mouthY + 4}" fill="none" stroke="#2B2B2B" stroke-width="3.5" stroke-linecap="round"/><circle cx="${a.cx - 14}" cy="${a.mouthY + 4}" r="4.5" fill="#2B2B2B"/>`;
		}
		case 'clipboard':
			return `<g transform="translate(46 156) rotate(-12)"><rect x="-19" y="-24" width="38" height="48" rx="5" fill="#B07A45"/><rect x="-14" y="-17" width="28" height="36" rx="2" fill="#FAFAF7"/><rect x="-8" y="-28" width="16" height="9" rx="3" fill="#9AA0AE"/><g fill="none" stroke="#3E7C4F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M-10 -8 l3 3 l5 -6"/><path d="M-10 4 l3 3 l5 -6"/></g><g stroke="#9AA0AE" stroke-width="2" stroke-linecap="round"><path d="M2 -7 h8"/><path d="M2 5 h8"/><path d="M-9 14 h18"/></g></g>`;
		case 'stopwatch':
			return `<g transform="translate(154 156)"><rect x="-4" y="-22" width="8" height="7" rx="2" fill="#9AA0AE"/><circle cx="0" cy="0" r="16" fill="#FAFAF7"/><path d="M0 0 V-10" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><path d="M0 0 L7 4" stroke="#D64545" stroke-width="2.5" stroke-linecap="round"/><circle cx="0" cy="0" r="2" fill="${INK}" stroke="none"/></g>`;
		case 'stamp':
			return `<g transform="translate(132 164) rotate(-14)" stroke="none" opacity=".92"><rect x="-38" y="-12" width="76" height="24" rx="4" fill="#FFFFFF" fill-opacity=".55" stroke="#D64545" stroke-width="3"/><text x="0" y="5" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="13" fill="#D64545">WONTFIX</text></g>`;
		case 'flag':
			return `<path d="M154 178 V126" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M155 127 L182 136 L155 146 Z" fill="#D64545"/><text x="159" y="140" stroke="none" font-family="${MONO}" font-weight="700" font-size="9" fill="#fff">P1</text>`;
		case 'magnifier':
			return `<path d="M${R + 9} ${a.eyeY + 9} L${R + 24} ${a.eyeY + 24}" stroke="#6B4226" stroke-width="6" stroke-linecap="round"/><circle cx="${R}" cy="${a.eyeY}" r="12" fill="#FFFFFF" stroke="none"/><circle cx="${R}" cy="${a.eyeY}" r="7" fill="${INK}" stroke="none"/><circle cx="${R + 2.5}" cy="${a.eyeY - 2.5}" r="2.2" fill="#fff" stroke="none"/><circle cx="${R}" cy="${a.eyeY}" r="13" fill="#CFE7F5" fill-opacity=".25" stroke="${INK}" stroke-width="3.5"/>`;
		case 'stylus':
			return `<g transform="translate(${a.cx + a.earDx - 6} ${a.earY - 18}) rotate(28)"><rect x="-3.5" y="-22" width="7" height="38" rx="3" fill="#2B2B2B"/><polygon points="-3.5,16 3.5,16 0,25" fill="#C4C4C4"/><rect x="-3.5" y="-22" width="7" height="6" rx="2" fill="${s.hatC}"/></g>`;
		case 'eyedropper':
			return `<g transform="translate(152 150) rotate(35)"><ellipse cx="0" cy="-20" rx="6.5" ry="8" fill="#2B2B2B"/><rect x="-3.5" y="-13" width="7" height="30" rx="2" fill="#E6EEF5"/><rect x="-3.5" y="5" width="7" height="12" fill="${s.hatC}" stroke="none"/><polygon points="-2,17 2,17 0,24" fill="#E6EEF5"/></g><circle cx="137" cy="178" r="3.5" fill="${s.hatC}"/>`;
		case 'palette':
			return `<g transform="translate(48 158) rotate(-8)"><path d="M-24 0 C-24 -18 0 -22 18 -15 C29 -11 27 2 16 2 C8 2 10 13 0 15 C-15 17 -24 11 -24 0 Z" fill="#D9B382"/><g stroke="none"><circle cx="-14" cy="-6" r="4" fill="#D64545"/><circle cx="-3" cy="-12" r="4" fill="#FFD23F"/><circle cx="9" cy="-10" r="4" fill="#2F8FD8"/><circle cx="-12" cy="7" r="4" fill="#3E7C4F"/></g></g>`;
		default:
			return '';
	}
}
function hat(s: Avatar, a: Anchors) {
	const c = s.hatC,
		d = shade(c, -0.25),
		l = shade(c, 0.3),
		k = (a.hw / 40).toFixed(3),
		cx = a.cx,
		ex = a.earDx;
	if (s.hat === 'headphones' || s.hat === 'catears') {
		const band = `M${cx - ex} ${a.earY} C${cx - ex} ${a.top - 28} ${cx + ex} ${a.top - 28} ${cx + ex} ${a.earY}`;
		let o =
			(OUTLINE
				? `<path d="${band}" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>`
				: '') +
			`<path d="${band}" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`;
		if (s.hat === 'catears') {
			const bz = (t: number) => {
				const u = 1 - t;
				return [
					u * u * u * (cx - ex) +
						3 * u * u * t * (cx - ex) +
						3 * u * t * t * (cx + ex) +
						t * t * t * (cx + ex),
					u * u * u * a.earY +
						3 * u * u * t * (a.top - 28) +
						3 * u * t * t * (a.top - 28) +
						t * t * t * a.earY
				];
			};
			[
				[0.28, -1],
				[0.72, 1]
			].forEach(([t, dir]) => {
				const [x, y] = bz(t);
				o += `<polygon points="${x - 10 * dir},${y + 3} ${x - 3 * dir},${y - 17} ${x + 7 * dir},${y + 1}" fill="${c}"/><polygon points="${x - 6 * dir},${y + 1} ${x - 3 * dir},${y - 10} ${x + 3 * dir},${y}" fill="#F7B7CF" stroke="none"/>`;
			});
		}
		return (
			o +
			`<rect x="${cx - ex - 10}" y="${a.earY - 15}" width="18" height="30" rx="7" fill="${d}"/><rect x="${cx + ex - 8}" y="${a.earY - 15}" width="18" height="30" rx="7" fill="${d}"/>`
		);
	}
	let g = '';
	switch (s.hat) {
		case 'beret':
			g = `<g transform="rotate(-10)"><rect x="-2" y="-24" width="4" height="9" rx="2" fill="${d}"/><ellipse cx="0" cy="-4" rx="42" ry="15" fill="${c}"/><ellipse cx="-6" cy="-9" rx="26" ry="6" fill="${l}" opacity=".35" stroke="none"/></g>`;
			break;
		case 'beanie':
			g = `<path d="M-36 6 Q-38 -38 0 -38 Q38 -38 36 6 Z" fill="${c}"/><rect x="-39" y="-4" width="78" height="16" rx="7" fill="${d}"/><circle cx="0" cy="-40" r="9" fill="${l}"/>`;
			break;
		case 'cap':
			g = `<path d="M-34 6 Q-36 -32 0 -32 Q36 -32 34 6 Z" fill="${c}"/><path d="M8 4 Q44 -2 58 10 Q34 14 6 10 Z" fill="${d}"/><circle cx="0" cy="-32" r="3.5" fill="${d}"/>`;
			break;
		case 'propeller':
			g = `<path d="M-24 6 Q-24 -22 0 -22 Q24 -22 24 6 Z" fill="${c}"/><path d="M-24 6 Q-24 -22 0 -22 L0 6 Z" fill="${l}" opacity=".5" stroke="none"/><rect x="-1.5" y="-34" width="3" height="13" fill="${INK}"/><g transform="translate(0 -34)"><g><animateTransform attributeName="transform" type="scale" values="1 1;0.15 1;1 1" dur="0.5s" repeatCount="indefinite"/><ellipse cx="-13" cy="0" rx="13" ry="4" fill="#E2552B"/><ellipse cx="13" cy="0" rx="13" ry="4" fill="#2F8FD8"/></g></g><circle cx="0" cy="-34" r="3" fill="${INK}"/>`;
			break;
		case 'crown':
			g = `<polygon points="-30,6 -32,-24 -16,-10 0,-30 16,-10 32,-24 30,6" fill="#F2C14E" stroke="#B8862B" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="-2" r="4" fill="${c}"/><circle cx="-18" cy="0" r="3" fill="#fff" opacity=".8"/><circle cx="18" cy="0" r="3" fill="#fff" opacity=".8"/>`;
			break;
		case 'party':
			g = `<g transform="rotate(14)"><polygon points="-20,6 0,-46 20,6" fill="${c}"/><g fill="#fff" opacity=".85" stroke="none"><circle cx="-7" cy="-4" r="3"/><circle cx="6" cy="-16" r="3"/><circle cx="-2" cy="-28" r="2.5"/><circle cx="9" cy="0" r="2.5"/></g><circle cx="0" cy="-48" r="6" fill="#fff"/></g>`;
			break;
	}
	return `<g transform="translate(${a.cx} ${a.top}) scale(${k})">${g}</g>`;
}

let uid = 0;
/** Draw an avatar as a standalone, circular 200×200 SVG string. `label` is its accessible name. */
export function avatarSvg(s: Avatar, label = 'Avatar') {
	const st = S[s.style] || S.cloud,
		a = st.a,
		id = `clip${++uid}`;
	const G = (x: string) => (x ? `<g${OL()}>${x}</g>` : '');
	let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}"><defs><clipPath id="${id}"><circle cx="100" cy="100" r="96"/></clipPath></defs><g clip-path="url(#${id})">`;
	o += `<rect width="200" height="200" fill="${s.bg}"/><circle cx="100" cy="100" r="86" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="18"/>`;
	o += G(st.body(s));
	if (s.hair === 'beard' || s.hair === 'full') o += G(beard(s, a));
	if (s.hair === 'goatee') o += G(goatee(s, a));
	o += eyes(s, a);
	if (!st.mouth) o += mouth(s, a);
	if (s.hair === 'mustache' || s.hair === 'full') o += G(mustache(s, a));
	if (st.mouth) o += G(st.mouth(s));
	o += extra(s, a);
	o += G(accessory(s, a));
	if (s.hat === 'none') {
		if (st.noHat) o += G(st.noHat(s));
	} else o += G(hat(s, a));
	return `${o}</g></svg>`;
}
