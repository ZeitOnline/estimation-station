import { describe, it, expect } from 'vitest';
import { authorize, identityFromClaims } from './auth';

describe('authorize', () => {
	it('no policy → any authenticated user is allowed', () => {
		expect(authorize({ sub: 'x' }, {}).ok).toBe(true);
	});

	it('email domain allow-list', () => {
		const policy = { allowedDomains: ['zeit.de'] };
		expect(authorize({ email: 'a@zeit.de' }, policy).ok).toBe(true);
		expect(authorize({ email: 'a@ZEIT.de' }, policy).ok).toBe(true); // case-insensitive
		expect(authorize({ email: 'a@gmail.com' }, policy).ok).toBe(false);
		expect(authorize({}, policy).ok).toBe(false); // no email
	});

	it('group allow-rule via groups claim', () => {
		const policy = { allowedGroup: 'planning-poker' };
		expect(authorize({ groups: ['/planning-poker'] }, policy).ok).toBe(true); // strips slash
		expect(authorize({ groups: ['other'] }, policy).ok).toBe(false);
	});

	it('group allow-rule via realm/resource roles', () => {
		const policy = { allowedGroup: 'planning-poker' };
		expect(authorize({ realm_access: { roles: ['planning-poker'] } }, policy).ok).toBe(true);
		expect(authorize({ resource_access: { app: { roles: ['planning-poker'] } } }, policy).ok).toBe(
			true
		);
	});

	it('domain OR group — either passes', () => {
		const policy = { allowedDomains: ['zeit.de'], allowedGroup: 'planning-poker' };
		expect(authorize({ email: 'x@gmail.com', groups: ['planning-poker'] }, policy).ok).toBe(true);
		expect(authorize({ email: 'x@zeit.de', groups: [] }, policy).ok).toBe(true);
		expect(authorize({ email: 'x@gmail.com', groups: [] }, policy).ok).toBe(false);
	});
});

describe('identityFromClaims', () => {
	it('prefers name, falls back sensibly', () => {
		expect(identityFromClaims({ sub: '1', name: 'Alice' })).toEqual({ userId: '1', name: 'Alice' });
		expect(identityFromClaims({ sub: '2', preferred_username: 'bob' })).toEqual({
			userId: '2',
			name: 'bob'
		});
		expect(identityFromClaims({ sub: '3' }).name).toBe('Anonym');
	});
});
