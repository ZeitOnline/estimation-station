import { describe, expect, it } from 'vitest';
import { JiraError, jiraConfig, parseIssueKey, setStoryPoints, type JiraConfig } from './jira';

describe('parseIssueKey', () => {
	it('extracts the key from a browse link', () => {
		expect(parseIssueKey('https://zeit-online.atlassian.net/browse/ENG-958')).toBe('ENG-958');
	});

	it('ignores query and hash on the link', () => {
		expect(
			parseIssueKey('https://zeit-online.atlassian.net/browse/ENG-958?focusedCommentId=1#top')
		).toBe('ENG-958');
	});

	it('accepts a bare key, case-insensitively', () => {
		expect(parseIssueKey('ENG-958')).toBe('ENG-958');
		expect(parseIssueKey(' eng-958 ')).toBe('ENG-958');
	});

	it('rejects everything else', () => {
		expect(parseIssueKey('')).toBeNull();
		expect(parseIssueKey('fix the login bug')).toBeNull();
		expect(parseIssueKey('see ENG-958 maybe')).toBeNull();
		expect(parseIssueKey('https://zeit.de/index')).toBeNull();
		expect(parseIssueKey('https://zeit-online.atlassian.net/browse/')).toBeNull();
	});
});

describe('jiraConfig', () => {
	const complete = {
		JIRA_BASE_URL: 'https://zeit-online.atlassian.net/',
		JIRA_EMAIL: 'bot@zeit.de',
		JIRA_API_TOKEN: 'secret',
		JIRA_STORY_POINTS_FIELD: 'customfield_10001'
	};

	it('is null while any variable is missing (integration off)', () => {
		expect(jiraConfig({})).toBeNull();
		expect(jiraConfig({ ...complete, JIRA_API_TOKEN: undefined })).toBeNull();
	});

	it('reads all four vars and strips the trailing slash off the base URL', () => {
		expect(jiraConfig(complete)).toEqual({
			baseUrl: 'https://zeit-online.atlassian.net',
			email: 'bot@zeit.de',
			apiToken: 'secret',
			storyPointsField: 'customfield_10001'
		});
	});
});

describe('setStoryPoints', () => {
	const cfg: JiraConfig = {
		baseUrl: 'https://zeit-online.atlassian.net',
		email: 'bot@zeit.de',
		apiToken: 'secret',
		storyPointsField: 'customfield_10001'
	};

	it('PUTs the field to the issue and resolves on 204', async () => {
		let seenUrl = '';
		let seenInit: RequestInit = {};
		const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
			seenUrl = String(url);
			seenInit = init ?? {};
			return new Response(null, { status: 204 });
		}) as typeof fetch;

		await setStoryPoints(cfg, 'ENG-958', 5, fetchFn);

		expect(seenUrl).toBe('https://zeit-online.atlassian.net/rest/api/3/issue/ENG-958');
		expect(seenInit.method).toBe('PUT');
		expect(JSON.parse(String(seenInit.body))).toEqual({ fields: { customfield_10001: 5 } });
		expect(new Headers(seenInit.headers).get('authorization')).toBe(
			'Basic ' + Buffer.from('bot@zeit.de:secret').toString('base64')
		);
	});

	it("throws a JiraError carrying Jira's own explanation", async () => {
		const fetchFn = (async () =>
			new Response(
				JSON.stringify({
					errorMessages: [],
					errors: { customfield_10001: 'Field cannot be set' }
				}),
				{ status: 400 }
			)) as typeof fetch;

		const err = await setStoryPoints(cfg, 'ENG-958', 5, fetchFn).catch((e) => e);
		expect(err).toBeInstanceOf(JiraError);
		expect(err.status).toBe(400);
		expect(err.message).toBe('customfield_10001: Field cannot be set');
	});

	it('falls back to the status code when the error body is not JSON', async () => {
		const fetchFn = (async () =>
			new Response('<html>gateway</html>', { status: 502 })) as typeof fetch;

		const err = await setStoryPoints(cfg, 'ENG-958', 5, fetchFn).catch((e) => e);
		expect(err).toBeInstanceOf(JiraError);
		expect(err.message).toBe('Jira responded with 502');
	});
});
