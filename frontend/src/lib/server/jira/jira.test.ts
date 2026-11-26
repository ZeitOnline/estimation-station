import { describe, expect, it } from 'vitest';
import {
	adfToHtml,
	adfToText,
	getBacklog,
	getIssuePreview,
	type JiraConfig,
	JiraError,
	jiraConfig,
	normalizeTicket,
	parseIssueKey,
	setStoryPoints,
	transitionTo
} from './jira';

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

describe('normalizeTicket', () => {
	const base = 'https://zeit-online.atlassian.net';

	it('turns a bare key and a browse link into the same ticket', () => {
		expect(normalizeTicket('ENG-935', base)).toBe(`${base}/browse/ENG-935`);
		expect(normalizeTicket(' eng-935 ', base)).toBe(`${base}/browse/ENG-935`);
		expect(normalizeTicket(`${base}/browse/ENG-935?focusedCommentId=1`, base)).toBe(
			`${base}/browse/ENG-935`
		);
	});

	it('tolerates a trailing slash on the base URL', () => {
		expect(normalizeTicket('ENG-935', 'https://zeit-online.atlassian.net/')).toBe(
			`${base}/browse/ENG-935`
		);
	});

	it('keeps the bare key when no base URL is configured', () => {
		expect(normalizeTicket('eng-935')).toBe('ENG-935');
		expect(normalizeTicket('eng-935', '')).toBe('ENG-935');
	});

	it('passes free-form titles through, trimmed', () => {
		expect(normalizeTicket('  Login flow  ', base)).toBe('Login flow');
	});

	it('is null for an empty or whitespace-only field (ticket removed)', () => {
		expect(normalizeTicket('', base)).toBeNull();
		expect(normalizeTicket('   ', base)).toBeNull();
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
			`Basic ${Buffer.from('bot@zeit.de:secret').toString('base64')}`
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

describe('transitionTo', () => {
	const cfg: JiraConfig = {
		baseUrl: 'https://zeit-online.atlassian.net',
		email: 'bot@zeit.de',
		apiToken: 'secret',
		storyPointsField: 'customfield_10001'
	};

	const transitions = {
		transitions: [
			{ id: '11', name: 'Start Progress', to: { name: 'In Progress' } },
			{ id: '21', name: 'Refine', to: { name: 'Refined' } }
		]
	};

	it('finds the transition landing on the wanted status and POSTs it', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			if (!init?.method) return new Response(JSON.stringify(transitions), { status: 200 });
			return new Response(null, { status: 204 });
		}) as typeof fetch;

		await expect(transitionTo(cfg, 'ENG-958', 'refined', fetchFn)).resolves.toEqual({
			moved: true,
			available: ['In Progress', 'Refined']
		});

		expect(calls).toHaveLength(2);
		expect(calls[0].url).toBe(
			'https://zeit-online.atlassian.net/rest/api/3/issue/ENG-958/transitions'
		);
		expect(calls[1].init?.method).toBe('POST');
		expect(JSON.parse(String(calls[1].init?.body))).toEqual({ transition: { id: '21' } });
	});

	it('reports the reachable statuses when none of them is the wanted one', async () => {
		const fetchFn = (async () =>
			new Response(JSON.stringify(transitions), { status: 200 })) as typeof fetch;

		await expect(transitionTo(cfg, 'ENG-958', 'Done', fetchFn)).resolves.toEqual({
			moved: false,
			available: ['In Progress', 'Refined']
		});
	});

	it('throws a JiraError when listing the transitions fails', async () => {
		const fetchFn = (async () =>
			new Response(JSON.stringify({ errorMessages: ['Issue does not exist'] }), {
				status: 404
			})) as typeof fetch;

		const err = await transitionTo(cfg, 'ENG-999', 'Refined', fetchFn).catch((e) => e);
		expect(err).toBeInstanceOf(JiraError);
		expect(err.status).toBe(404);
		expect(err.message).toBe('Issue does not exist');
	});

	it('throws a JiraError when executing the transition fails', async () => {
		const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
			if (!init?.method) return new Response(JSON.stringify(transitions), { status: 200 });
			return new Response(JSON.stringify({ errorMessages: ['It is not on the workflow'] }), {
				status: 400
			});
		}) as typeof fetch;

		const err = await transitionTo(cfg, 'ENG-958', 'Refined', fetchFn).catch((e) => e);
		expect(err).toBeInstanceOf(JiraError);
		expect(err.status).toBe(400);
	});
});

describe('adfToText', () => {
	it('flattens paragraphs, headings and task items to lines', () => {
		const adf = {
			type: 'doc',
			version: 1,
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Todo' }] },
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Nutzer*innen können ' },
						{ type: 'text', text: 'Freebies', marks: [{ type: 'code' }] },
						{ type: 'text', text: ' verschenken.' }
					]
				},
				{
					type: 'taskList',
					content: [{ type: 'taskItem', content: [{ type: 'text', text: 'Dialog statt Paywall' }] }]
				}
			]
		};

		expect(adfToText(adf)).toBe(
			'Todo\nNutzer*innen können Freebies verschenken.\nDialog statt Paywall\n'
		);
	});

	it('is empty for null, strings and unknown shapes', () => {
		expect(adfToText(null)).toBe('');
		expect(adfToText(undefined)).toBe('');
		expect(adfToText('plain')).toBe('');
		expect(adfToText({ type: 'mediaSingle', attrs: {} })).toBe('');
	});
});

describe('adfToHtml', () => {
	const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, marks });

	it('keeps headings, lists, checklists and smart links', () => {
		const adf = {
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [text('Todo')] },
				{
					type: 'paragraph',
					content: [
						text('analog zu '),
						{ type: 'inlineCard', attrs: { url: 'https://x.atlassian.net/browse/ENG-550' } },
						text(' mit '),
						text('uuid', [{ type: 'code' }])
					]
				},
				{
					type: 'orderedList',
					attrs: { order: 1 },
					content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('eins')] }] }]
				},
				{
					type: 'taskList',
					content: [
						{ type: 'taskItem', attrs: { state: 'TODO' }, content: [text('Ja')] },
						{ type: 'taskItem', attrs: { state: 'DONE' }, content: [text('Nein')] }
					]
				}
			]
		};

		expect(adfToHtml(adf)).toBe(
			'<h4>Todo</h4>' +
				'<p>analog zu <a href="https://x.atlassian.net/browse/ENG-550" target="_blank" rel="noopener noreferrer">ENG-550</a> mit <code>uuid</code></p>' +
				'<ol><li><p>eins</p></li></ol>' +
				'<ul class="adf-tasks">' +
				'<li><input type="checkbox" disabled> <span>Ja</span></li>' +
				'<li><input type="checkbox" disabled checked> <span>Nein</span></li>' +
				'</ul>'
		);
	});

	it('escapes ticket text and refuses non-http links', () => {
		const adf = {
			type: 'paragraph',
			content: [
				text('<img src=x onerror=alert(1)> & "more"'),
				text('klick', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
				text('ok', [{ type: 'link', attrs: { href: 'https://zeit.de/?a="b"' } }])
			]
		};

		expect(adfToHtml(adf)).toBe(
			'<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;more&quot;' +
				'klick' +
				'<a href="https://zeit.de/?a=&quot;b&quot;" target="_blank" rel="noopener noreferrer">ok</a></p>'
		);
	});

	it('reduces unknown nodes to their text and ignores non-objects', () => {
		expect(
			adfToHtml({ type: 'expand', content: [{ type: 'paragraph', content: [text('x')] }] })
		).toBe('<p>x</p>');
		expect(adfToHtml({ type: 'mediaSingle', attrs: {} })).toBe('');
		expect(adfToHtml(null)).toBe('');
		expect(adfToHtml('plain')).toBe('');
	});
});

describe('getBacklog', () => {
	const cfg: JiraConfig = {
		baseUrl: 'https://zeit-online.atlassian.net',
		email: 'bot@zeit.de',
		apiToken: 'secret',
		storyPointsField: 'customfield_10001'
	};

	it('searches with the given JQL and keeps the order Jira returns', async () => {
		let seenUrl = '';
		let seenBody: unknown;
		const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
			seenUrl = String(url);
			seenBody = JSON.parse(String(init?.body));
			return new Response(
				JSON.stringify({
					issues: [
						{
							key: 'ENG-2',
							fields: { summary: 'Zweites zuerst', status: { name: 'Waiting for Ref' } }
						},
						{ key: 'ENG-1', fields: {} }
					]
				}),
				{ status: 200 }
			);
		}) as typeof fetch;

		const issues = await getBacklog(cfg, 'project = ENG ORDER BY Rank ASC', 25, fetchFn);

		expect(seenUrl).toBe('https://zeit-online.atlassian.net/rest/api/3/search/jql');
		expect(seenBody).toEqual({
			jql: 'project = ENG ORDER BY Rank ASC',
			maxResults: 25,
			fields: ['summary', 'status']
		});
		expect(issues).toEqual([
			{ key: 'ENG-2', summary: 'Zweites zuerst', status: 'Waiting for Ref' },
			{ key: 'ENG-1', summary: '', status: '' }
		]);
	});

	it('follows page tokens until the list is complete', async () => {
		const tokens: unknown[] = [];
		const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			tokens.push(body.nextPageToken);
			const second = body.nextPageToken === 'page-2';
			return new Response(
				JSON.stringify({
					issues: [{ key: second ? 'ENG-2' : 'ENG-1', fields: { summary: 's' } }],
					...(second ? {} : { nextPageToken: 'page-2' })
				}),
				{ status: 200 }
			);
		}) as typeof fetch;

		const issues = await getBacklog(cfg, 'project = ENG', 300, fetchFn);

		expect(tokens).toEqual([undefined, 'page-2']);
		expect(issues.map((i) => i.key)).toEqual(['ENG-1', 'ENG-2']);
	});

	it('stops at maxResults even when Jira has more pages', async () => {
		let calls = 0;
		const fetchFn = (async () => {
			calls += 1;
			return new Response(
				JSON.stringify({
					issues: [
						{ key: `ENG-${calls}0`, fields: {} },
						{ key: `ENG-${calls}1`, fields: {} }
					],
					nextPageToken: 'more'
				}),
				{ status: 200 }
			);
		}) as typeof fetch;

		const issues = await getBacklog(cfg, 'project = ENG', 3, fetchFn);

		expect(calls).toBe(2);
		expect(issues).toHaveLength(3);
	});

	it('throws a JiraError for invalid JQL', async () => {
		const fetchFn = (async () =>
			new Response(JSON.stringify({ errorMessages: ['Error in the JQL Query'] }), {
				status: 400
			})) as typeof fetch;

		const err = await getBacklog(cfg, 'nonsense', 50, fetchFn).catch((e) => e);
		expect(err).toBeInstanceOf(JiraError);
		expect(err.status).toBe(400);
	});
});

describe('getIssuePreview', () => {
	const cfg: JiraConfig = {
		baseUrl: 'https://zeit-online.atlassian.net',
		email: 'bot@zeit.de',
		apiToken: 'secret',
		storyPointsField: 'customfield_10001'
	};

	const adf = (text: string) => ({
		type: 'doc',
		version: 1,
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

	it('requests only the wanted fields and returns summary + description', async () => {
		let seenUrl = '';
		const fetchFn = (async (url: string | URL | Request) => {
			seenUrl = String(url);
			return new Response(
				JSON.stringify({
					key: 'ENG-958',
					fields: {
						summary: 'Freebie-Modal zeigen',
						status: { name: 'Waiting for Ref' },
						description: adf('Im Frontend fehlt das Modal.')
					}
				}),
				{ status: 200 }
			);
		}) as typeof fetch;

		const preview = await getIssuePreview(cfg, 'ENG-958', ['description'], fetchFn);

		expect(seenUrl).toBe(
			'https://zeit-online.atlassian.net/rest/api/3/issue/ENG-958?fields=summary,status,description'
		);
		expect(preview).toEqual({
			key: 'ENG-958',
			summary: 'Freebie-Modal zeigen',
			status: 'Waiting for Ref',
			description: 'Im Frontend fehlt das Modal.',
			descriptionHtml: '<p>Im Frontend fehlt das Modal.</p>'
		});
	});

	it('falls through the description fields until one has text', async () => {
		const fetchFn = (async () =>
			new Response(
				JSON.stringify({
					key: 'ENG-958',
					fields: {
						summary: 'Titel',
						customfield_11371: null,
						description: adf('Aus dem Systemfeld.')
					}
				}),
				{ status: 200 }
			)) as typeof fetch;

		const preview = await getIssuePreview(
			cfg,
			'ENG-958',
			['customfield_11371', 'description'],
			fetchFn
		);
		expect(preview.description).toBe('Aus dem Systemfeld.');
	});

	it('throws a JiraError for an unknown issue', async () => {
		const fetchFn = (async () =>
			new Response(JSON.stringify({ errorMessages: ['Issue does not exist'] }), {
				status: 404
			})) as typeof fetch;

		const err = await getIssuePreview(cfg, 'ENG-999', ['description'], fetchFn).catch((e) => e);
		expect(err).toBeInstanceOf(JiraError);
		expect(err.status).toBe(404);
	});
});
