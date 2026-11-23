import { describe, expect, it } from 'vitest';
import { avatarSvg, fromSeed, sanitizeAvatar } from './avatar';

describe('fromSeed', () => {
	it('gives the same name the same avatar, ignoring case and padding', () => {
		expect(fromSeed('Ada Lovelace')).toEqual(fromSeed('  ada lovelace '));
	});

	it('gives different names different avatars', () => {
		expect(fromSeed('Ada')).not.toEqual(fromSeed('Grace'));
	});

	it('always produces something that passes validation', () => {
		for (const name of ['', 'Ada', 'Grace', 'Gast 1234', 'Zoë']) {
			const avatar = fromSeed(name);
			expect(sanitizeAvatar(avatar)).toEqual(avatar);
		}
	});
});

describe('sanitizeAvatar', () => {
	it('rejects anything that is not a complete avatar', () => {
		expect(sanitizeAvatar(null)).toBeNull();
		expect(sanitizeAvatar('duck')).toBeNull();
		expect(sanitizeAvatar({ style: 'duck' })).toBeNull();
	});

	it('rejects values outside the known lists', () => {
		const avatar = fromSeed('Ada');
		expect(sanitizeAvatar({ ...avatar, bg: '"/><script>alert(1)</script>' })).toBeNull();
		expect(sanitizeAvatar({ ...avatar, key: '<b>' })).toBeNull();
		expect(sanitizeAvatar({ ...avatar, num: '1"/>' })).toBeNull();
		expect(sanitizeAvatar({ ...avatar, pts: 4 })).toBeNull();
	});

	it('drops unknown extra fields', () => {
		const avatar = fromSeed('Ada');
		expect(sanitizeAvatar({ ...avatar, evil: '<script>' })).toEqual(avatar);
	});
});

describe('avatarSvg', () => {
	it('draws every style as an svg and escapes the label', () => {
		const svg = avatarSvg(fromSeed('Ada'), 'A <b> & "c"');
		expect(svg.startsWith('<svg ')).toBe(true);
		expect(svg).toContain('aria-label="A &lt;b&gt; &amp; &quot;c&quot;"');
	});
});
