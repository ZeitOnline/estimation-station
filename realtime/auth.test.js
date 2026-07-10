import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize, identityFromClaims } from './auth.js';

test('no policy → any authenticated user is allowed', () => {
	assert.equal(authorize({ sub: 'x' }, {}).ok, true);
});

test('email domain allow-list', () => {
	const policy = { allowedDomains: ['zeit.de'] };
	assert.equal(authorize({ email: 'a@zeit.de' }, policy).ok, true);
	assert.equal(authorize({ email: 'a@ZEIT.de' }, policy).ok, true); // case-insensitive
	assert.equal(authorize({ email: 'a@gmail.com' }, policy).ok, false);
	assert.equal(authorize({}, policy).ok, false); // no email
});

test('group allow-rule via groups claim', () => {
	const policy = { allowedGroup: 'planning-poker' };
	assert.equal(authorize({ groups: ['/planning-poker'] }, policy).ok, true); // strips slash
	assert.equal(authorize({ groups: ['other'] }, policy).ok, false);
});

test('group allow-rule via realm/resource roles', () => {
	const policy = { allowedGroup: 'planning-poker' };
	assert.equal(authorize({ realm_access: { roles: ['planning-poker'] } }, policy).ok, true);
	assert.equal(
		authorize({ resource_access: { app: { roles: ['planning-poker'] } } }, policy).ok,
		true
	);
});

test('domain OR group — either passes', () => {
	const policy = { allowedDomains: ['zeit.de'], allowedGroup: 'planning-poker' };
	assert.equal(authorize({ email: 'x@gmail.com', groups: ['planning-poker'] }, policy).ok, true);
	assert.equal(authorize({ email: 'x@zeit.de', groups: [] }, policy).ok, true);
	assert.equal(authorize({ email: 'x@gmail.com', groups: [] }, policy).ok, false);
});

test('identityFromClaims prefers name, falls back sensibly', () => {
	assert.deepEqual(identityFromClaims({ sub: '1', name: 'Alice' }), { userId: '1', name: 'Alice' });
	assert.deepEqual(identityFromClaims({ sub: '2', preferred_username: 'bob' }), {
		userId: '2',
		name: 'bob'
	});
	assert.equal(identityFromClaims({ sub: '3' }).name, 'Anonym');
});
