<script lang="ts">
import { onDestroy, onMount, untrack } from 'svelte';
import { AvatarEditor, Card, Icon, Participants } from '#components';
import { authFetch, SessionExpiredError } from '#lib/auth-fetch.js';
import { parseIssueKey } from '#lib/jira-link.js';
import type { Avatar } from '#lib/poker/avatar.js';
import { getName, getToken, getUserId, loadAvatar, saveAvatar } from '#lib/poker/identity.js';
import { createRoom } from '#lib/poker/room.svelte.js';
import { voteSummary } from '#lib/poker/summary.js';
import {
	isStoryPointValue,
	nearestStoryPointValue,
	STORY_POINT_VALUES
} from '#lib/story-points.js';
import type { Card as CardType } from '#types';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const room = createRoom();

// Your own current pick (derived from the server state for this user).
const myVote = $derived(
	room.state?.participants.find((p) => p.userId === getUserId())?.vote ?? null
);
const summary = $derived(room.state ? voteSummary(room.state.participants) : null);

// Your own seat, for the avatar editor (opened by clicking your avatar).
const me = $derived(room.state?.participants.find((p) => p.userId === getUserId()) ?? null);
let editingAvatar = $state(false);

function changeAvatar(avatar: Avatar | null) {
	saveAvatar(avatar);
	room.setAvatar(avatar);
}

onMount(() => {
	const name = getName();
	if (!name) {
		// no name yet → go pick one on the landing page
		goto(resolve('/'));
		return;
	}
	room.connect(data.roomId, getUserId(), name, getToken(), loadAvatar());
});

onDestroy(() => {
	room.disconnect();
	if (copyTimer) clearTimeout(copyTimer);
});

// Copy the room link, then flip the button to a short-lived "Kopiert" state
// before returning to the default. Falls back to execCommand so it also
// works over plain http on a LAN (where navigator.clipboard is unavailable).
let copied = $state(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyLink() {
	const url = window.location.href;
	let ok = false;
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(url);
			ok = true;
		}
	} catch {
		ok = false;
	}
	if (!ok) ok = legacyCopy(url);
	if (!ok) return;
	copied = true;
	if (copyTimer) clearTimeout(copyTimer);
	copyTimer = setTimeout(() => (copied = false), 1600);
}

// --- Jira: current ticket + write story points (moderator form) ---
let jiraLink = $state('');
let jiraPoints = $state<number | undefined>(undefined);
let jiraBusy = $state(false);
let jiraStatus = $state<{ ok: boolean; text: string } | null>(null);

const ticketKey = $derived(room.state?.ticket ? parseIssueKey(room.state.ticket) : null);
const canSubmit = $derived(parseIssueKey(jiraLink) !== null && isStoryPointValue(jiraPoints));
// Typed something that is neither a browse link nor a key — say so instead of
// silently leaving the save button disabled. An empty field is not an error.
const linkInvalid = $derived(jiraLink.trim() !== '' && parseIssueKey(jiraLink) === null);

// Title + description of the broadcast ticket, fetched for everyone in the
// room so all estimators see what they are voting on. Best-effort: a failed
// fetch just means no preview (e.g. Jira not configured). The short debounce
// absorbs rapid ticket changes; the key check drops stale late responses.
let ticketPreview = $state<{
	key: string;
	summary: string;
	status?: string;
	descriptionHtml?: string;
} | null>(null);

$effect(() => {
	const key = ticketKey;
	ticketPreview = null;
	if (!key) return;
	const timer = setTimeout(async () => {
		try {
			const res = await authFetch(
				`${resolve('api/jira/preview')}?issue=${encodeURIComponent(key)}`
			);
			if (!res.ok) return;
			const data = await res.json();
			// ticketKey may have moved on while the request was in flight
			if (data?.key === ticketKey && data?.summary) ticketPreview = data;
		} catch {
			// preview is optional — stay quiet
		}
	}, 300);
	return () => clearTimeout(timer);
});

// --- Backlog: the tickets up for estimation, in board order ---
// Only the moderator picks the ticket, so only the moderator loads the list
// (also after taking over moderation mid-session). Best-effort like the
// preview: no list just means tickets are typed in by hand, as before.
const isModerator = $derived(room.state?.youAreModerator ?? false);
// `allIssues` is everything the configured query returns (search covers all
// of it); `backlog` is the part in the ticked statuses, which is what the
// arrows step through.
let allIssues = $state<{ key: string; summary: string; status: string }[]>([]);
let selectedStatuses = $state<string[]>([]);
let backlogRequested = false;

const statuses = $derived([...new Set(allIssues.map((i) => i.status))]);
const backlog = $derived(allIssues.filter((i) => selectedStatuses.includes(i.status)));

// The ticket field doubles as the backlog search: while the moderator types
// something that is not a link, matching tickets (key or title, over all
// statuses, every typed word has to match) are offered below it. `searching`
// is only true while typing, so the field showing the current ticket's link
// does not pop the list open by itself.
const MAX_SEARCH_RESULTS = 10;
let searching = $state(false);
const searchMatches = $derived.by(() => {
	const text = jiraLink.trim().toLowerCase();
	if (!searching || allIssues.length === 0 || /^https?:/.test(text)) return null;
	const terms = text.split(/\s+/).filter(Boolean);
	if (terms.length === 0) return null;
	return allIssues.filter((issue) => {
		const haystack = `${issue.key} ${issue.summary}`.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
});

function pickIssue(key: string) {
	searching = false;
	jiraStatus = null;
	// Show the pick right away; the seeding effect swaps in the canonical
	// link once the room confirms it.
	jiraLink = key;
	room.setTicket(key);
}

// Enter takes the top hit — unless a complete key or link was typed, which
// goes the normal way (change event). Escape closes the list.
function onTicketKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		searching = false;
	} else if (e.key === 'Enter' && searchMatches?.length && parseIssueKey(jiraLink) === null) {
		e.preventDefault();
		pickIssue(searchMatches[0].key);
	}
}

// Close the list when the focus leaves the field and its results.
function onFieldFocusout(e: FocusEvent) {
	const field = e.currentTarget as HTMLElement;
	if (!(e.relatedTarget instanceof Node && field.contains(e.relatedTarget))) searching = false;
}

$effect(() => {
	if (!isModerator || backlogRequested) return;
	backlogRequested = true;
	(async () => {
		try {
			const res = await authFetch(resolve('api/jira/backlog'));
			if (!res.ok) return;
			const data = await res.json();
			if (!Array.isArray(data?.issues)) return;
			const issues: typeof allIssues = data.issues;
			// Tick the configured default statuses; all of them when none is
			// configured or none of the configured ones occurs.
			const present = new Set(issues.map((i) => i.status));
			const defaults = (Array.isArray(data.defaultStatuses) ? data.defaultStatuses : []).filter(
				(s: unknown): s is string => typeof s === 'string' && present.has(s)
			);
			selectedStatuses = defaults.length > 0 ? defaults : [...present];
			allIssues = issues;
		} catch {
			// backlog is optional — stay quiet
		}
	})();
});

// Start on the first backlog ticket when the room has none yet. Once only:
// re-applying it would fight the moderator removing the ticket on purpose.
let defaultTicketApplied = false;
$effect(() => {
	if (defaultTicketApplied || !isModerator || backlog.length === 0 || !room.state) return;
	defaultTicketApplied = true;
	if (!room.state.ticket) room.setTicket(backlog[0].key);
});

// Position of the current ticket in the backlog; -1 when it is not part of
// it (typed in by hand, or none) — "next" then leads to the first ticket.
const backlogIndex = $derived(ticketKey ? backlog.findIndex((i) => i.key === ticketKey) : -1);

function stepTicket(delta: 1 | -1) {
	if (!isModerator) return;
	const next = backlog[backlogIndex + delta];
	if (!next) return;
	jiraStatus = null;
	room.setTicket(next.key);
}

// ← / → step through the backlog — unless the keys are needed where the focus
// is (caret in the ticket field, the points select) or a dialog is open.
// Checkboxes have no use for the arrows, so a just-ticked status filter does
// not swallow them.
function onKeydown(e: KeyboardEvent) {
	if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
	if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editingAvatar) return;
	const target = e.target;
	const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
	if (
		target instanceof HTMLElement &&
		!isCheckbox &&
		(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
	) {
		return;
	}
	if (!isModerator || backlog.length === 0) return;
	e.preventDefault();
	stepTicket(e.key === 'ArrowRight' ? 1 : -1);
}

// Mirror the broadcast ticket into the link input (e.g. the moderator rejoined,
// or someone else set the ticket). Tracked by value, not by "input is empty":
// re-seeding an empty input would fight the moderator clearing the field.
let seededTicket: string | null = null;
$effect(() => {
	const ticket = room.state?.ticket ?? null;
	if (ticket === seededTicket) return;
	seededTicket = ticket;
	// Leave the input alone when it already points at that issue — the server
	// stores the canonical browse link, the moderator may have typed the key.
	const key = ticket && parseIssueKey(ticket);
	if (key && key === parseIssueKey(untrack(() => jiraLink))) return;
	jiraLink = ticket ?? '';
});

// Broadcast the ticket to the whole room (existing setTicket WS flow). An empty
// field removes it for everyone.
function shareTicket() {
	searching = false;
	jiraStatus = null;
	const text = jiraLink.trim();
	// With a backlog to search, text that is no ticket is an unfinished search
	// (the field says so) — don't broadcast it to the room as the ticket.
	if (text !== '' && allIssues.length > 0 && parseIssueKey(text) === null) return;
	room.setTicket(text);
}

// Explicit "remove ticket": clear the input, drop the ticket for the room, and
// forget the pending points so the next round starts clean.
function clearTicket() {
	searching = false;
	jiraLink = '';
	jiraPoints = undefined;
	jiraStatus = null;
	room.setTicket('');
}

// After a reveal, prefill the points with the Fibonacci value nearest to
// the round's average.
$effect(() => {
	if (room.state?.revealed && summary?.average != null && jiraPoints == null) {
		jiraPoints = nearestStoryPointValue(summary.average);
	}
});

async function submitStoryPoints(e: SubmitEvent) {
	e.preventDefault();
	if (!canSubmit || jiraBusy) return;
	jiraBusy = true;
	jiraStatus = null;
	try {
		const res = await authFetch(resolve('api/jira/story-points'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ issue: jiraLink.trim(), points: jiraPoints })
		});
		const data = await res.json().catch(() => null);
		jiraStatus = res.ok
			? {
					ok: true,
					text: data?.transitioned
						? `${data?.points} Punkte → ${data?.issueKey} gespeichert, Status: Refined ✓`
						: `${data?.points} Punkte → ${data?.issueKey} gespeichert ✓ (Status unverändert` +
							`${data?.transitionError ? `: ${data.transitionError}` : ''})`
				}
			: { ok: false, text: data?.message ?? `Fehler ${res.status}` };
	} catch (err) {
		jiraStatus =
			err instanceof SessionExpiredError
				? { ok: false, text: 'Sitzung abgelaufen — Seite neu laden und anmelden' }
				: { ok: false, text: 'Netzwerkfehler — bitte nochmal versuchen' };
	} finally {
		jiraBusy = false;
	}
}

function legacyCopy(text: string): boolean {
	try {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return ok;
	} catch {
		return false;
	}
}
</script>

<svelte:window onkeydown={onKeydown} />

<header class="room-head">
	<a class="back" href={resolve('/')}><Icon name="arrow-left" size={14} /> Startseite</a>
	<div class="room-title">
		<h1>Raum {data.roomId}</h1>
		<button
			class="copy"
			class:copy--done={copied}
			onclick={copyLink}
			title={copied ? 'Kopiert' : 'Link kopieren'}
			aria-label={copied ? 'Link kopiert' : 'Link kopieren'}
		>
			<span class="copy__icons">
				<span class="copy__icon copy__icon--link"><Icon name="link" size={16} /></span>
				<span class="copy__icon copy__icon--check"><Icon name="checkmark" size={16} /></span>
			</span>
		</button>
	</div>
</header>

{#if room.error}
	<p class="error">{room.error}</p>
{/if}

{#if room.state}
	{#if room.state.youAreModerator}
		<!-- The moderator's row: pick the ticket, then save the points. Sits above
		     the ticket/voting columns because it drives both. -->
		<section class="jira">
			<h2 class="jira__head">Ticket</h2>
			<form class="jira__form" onsubmit={submitStoryPoints}>
				<div class="jira__field" onfocusout={onFieldFocusout}>
					<input
						class="jira__link"
						type="text"
						placeholder={allIssues.length > 0
							? 'Ticket suchen (Nummer oder Titel) oder Link einfügen'
							: 'ENG-958 oder https://…/browse/ENG-958'}
						aria-label="Jira-Ticket: suchen, Ticket-Nummer oder Link"
						aria-invalid={linkInvalid && !searchMatches}
						autocomplete="off"
						bind:value={jiraLink}
						oninput={() => (searching = true)}
						onkeydown={onTicketKeydown}
						onchange={shareTicket}
					/>
					{#if jiraLink !== ''}
						<button
							type="button"
							class="jira__clear"
							title="Ticket entfernen"
							aria-label="Ticket entfernen"
							onclick={clearTicket}
						>
							<Icon name="close" size={14} />
						</button>
					{/if}
					{#if searchMatches}
						<!-- mousedown is cancelled so the field keeps the focus: a blur
						     would fire `change` and close the list before the click. -->
						<ul class="backlog__results">
							{#each searchMatches.slice(0, MAX_SEARCH_RESULTS) as issue (issue.key)}
								<li>
									<button
										type="button"
										onmousedown={(e) => e.preventDefault()}
										onclick={() => pickIssue(issue.key)}
									>
										<span class="backlog__key">{issue.key}</span>
										<span class="backlog__summary">{issue.summary}</span>
										<span class="status-badge">{issue.status}</span>
									</button>
								</li>
							{:else}
								<li class="backlog__note">Kein Treffer</li>
							{/each}
							{#if searchMatches.length > MAX_SEARCH_RESULTS}
								<li class="backlog__note">
									+ {searchMatches.length - MAX_SEARCH_RESULTS} weitere — Suche verfeinern
								</li>
							{/if}
						</ul>
					{/if}
				</div>
				<select class="jira__points" aria-label="Story Points" bind:value={jiraPoints}>
					<option value={undefined} disabled hidden>Punkte</option>
					{#each STORY_POINT_VALUES as points (points)}
						<option value={points}>{points}</option>
					{/each}
				</select>
				<button type="submit" disabled={!canSubmit || jiraBusy}>
					<Icon name="checkmark" size={16} />
					{jiraBusy ? 'Speichere…' : 'Punkte speichern'}
				</button>
			</form>
			{#if linkInvalid && !searchMatches}
				<p class="jira__status jira__status--error">
					Kein Ticket erkannt — {allIssues.length > 0 ? 'einen Treffer auswählen oder ' : ''}
					Ticket-Nummer (ENG-958) oder Link (…/browse/ENG-958) eingeben
				</p>
			{:else if jiraStatus}
				<p class="jira__status" class:jira__status--error={!jiraStatus.ok}>{jiraStatus.text}</p>
			{/if}
			{#if allIssues.length > 0}
				<!-- Which statuses the ← / → navigation steps through (the search
				     in the field above always covers all of them). -->
				<fieldset class="backlog__statuses">
					<legend>Mit ← / → durchgehen:</legend>
					{#each statuses as status (status)}
						<label>
							<input type="checkbox" value={status} bind:group={selectedStatuses} />
							{status}
							<span class="backlog__count">
								{allIssues.filter((i) => i.status === status).length}
							</span>
						</label>
					{/each}
				</fieldset>
			{/if}
		</section>
	{/if}

	<!-- Wide screens: what we estimate on the left, the estimating itself on the
	     right. Narrow screens: the same order, stacked. -->
	<div class="room-grid">
		<aside class="ticket-col">
			<div class="ticket-bar">
				{#if room.state.ticket}
					<p class="ticket">
						Aktuelles Ticket:
						{#if room.state.ticket.startsWith('http')}
							<a href={room.state.ticket} target="_blank" rel="noopener noreferrer">
								{ticketKey ?? room.state.ticket}
							</a>
						{:else}
							<strong>{room.state.ticket}</strong>
						{/if}
					</p>
				{:else}
					<p class="ticket ticket--empty">
						Noch kein Ticket{room.state.youAreModerator ? ' — oben eintragen' : ''}
					</p>
				{/if}
				{#if isModerator && allIssues.length > 0}
					<div class="ticket-nav">
						<button
							type="button"
							title="Vorheriges Ticket (←)"
							aria-label="Vorheriges Ticket im Backlog"
							disabled={backlogIndex <= 0}
							onclick={() => stepTicket(-1)}
						>
							<Icon name="chevron-left" size={14} />
						</button>
						<span class="ticket-nav__pos">
							{backlogIndex === -1 ? '–' : backlogIndex + 1} / {backlog.length}
						</span>
						<button
							type="button"
							title="Nächstes Ticket (→)"
							aria-label="Nächstes Ticket im Backlog"
							disabled={backlogIndex >= backlog.length - 1}
							onclick={() => stepTicket(1)}
						>
							<Icon name="chevron-right" size={14} />
						</button>
					</div>
				{/if}
			</div>
			{#if room.state.ticket && ticketPreview}
				<div class="ticket-preview">
					<p class="ticket-preview__title">
						{ticketPreview.summary}
						{#if ticketPreview.status}
							<span class="status-badge">{ticketPreview.status}</span>
						{/if}
					</p>
					{#if ticketPreview.descriptionHtml}
						<!-- Server-built from escaped ticket text and a fixed tag set
						     (adfToHtml in lib/server/jira) — safe to inject. -->
						<div class="ticket-preview__desc">
							{@html ticketPreview.descriptionHtml}
						</div>
					{/if}
				</div>
			{/if}
		</aside>

		<div class="vote-col">
			<section class="deck">
				<h2>Wähle deine Schätzung…</h2>
				<div class="cards">
					{#each room.state.deck as value (value)}
						<Card {value} selected={myVote === value} onpick={(v: CardType) => room.vote(v)} />
					{/each}
				</div>
			</section>

			<section class="table">
				<div class="table__head">
					<span>Teilnehmer</span>
					{#if room.state.revealed && summary}
						<span class="summary">
							Ø {summary.average ?? '–'}
							{#if summary.consensus}· Einigkeit 🎉{/if}
						</span>
					{/if}
				</div>
				<Participants
					room={room.state}
					selfId={getUserId()}
					onEditAvatar={() => (editingAvatar = true)}
				/>
			</section>

			{#if room.state.youAreModerator}
				<section class="controls">
					<button class="secondary" onclick={() => room.reset()}>
						<Icon name="reload" size={16} /> Zurücksetzen
					</button>
					<button onclick={() => room.reveal()} disabled={room.state.revealed}>
						<Icon name="search" size={16} /> Aufdecken
					</button>
				</section>
			{:else}
				<section class="controls">
					<button class="secondary" onclick={() => room.takeOver()}>
						<Icon name="key" size={16} /> Moderation übernehmen
					</button>
				</section>
			{/if}
		</div>
	</div>
{:else}
	<p>Verbinde mit dem Raum…</p>
{/if}

{#if editingAvatar && me}
	<AvatarEditor
		name={me.name}
		avatar={me.avatar}
		onchange={changeAvatar}
		onclose={() => (editingAvatar = false)}
	/>
{/if}

<style>
	.room-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--z-ds-space-m, 1rem);
		margin-bottom: var(--z-ds-space-l, 1.5rem);
	}
	.room-head h1 {
		margin: 0;
		font-size: var(--z-ds-font-size-l, 1.25rem);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--z-ds-space-xxs, 0.35rem);
		color: var(--z-ds-color-text-55, #69696c);
		text-decoration: none;
	}
	.room-title {
		display: flex;
		align-items: center;
	}
	.copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		color: var(--z-ds-color-text-55, #69696c);
		cursor: pointer;
		transition: color 0.2s ease;
	}
	.copy:hover {
		color: var(--z-ds-color-text-100, #252525);
	}
	.copy--done {
		color: var(--z-ds-color-background-success, #09864d);
	}
	/* Crossfade + scale between the link and checkmark icons on state switch. */
	.copy__icons {
		position: relative;
		width: 1.25rem;
		height: 1.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
	}
	.copy__icon {
		position: absolute;
		display: inline-flex;
		transition:
			opacity 0.2s ease,
			transform 0.2s ease;
	}
	.copy__icon--check {
		opacity: 0;
		transform: scale(0.4) rotate(-45deg);
	}
	.copy--done .copy__icon--link {
		opacity: 0;
		transform: scale(0.4) rotate(45deg);
	}
	.copy--done .copy__icon--check {
		opacity: 1;
		transform: none;
	}
	/* Two columns from ~62rem up: ticket (left) | voting (right). Below that a
	   single stack, ticket first. The Jira form is a full-width row of its own,
	   outside this grid. */
	.room-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--z-ds-space-xl, 2rem);
		align-items: start;
	}
	@media (min-width: 62rem) {
		.room-grid {
			grid-template-columns: minmax(0, 43rem) minmax(0, 1fr);
			gap: var(--z-ds-space-xl, 2rem) var(--z-ds-space-xxl, 3rem);
		}
		/* Long ticket descriptions must not push the deck out of view. */
		.ticket-col {
			position: sticky;
			top: var(--z-ds-space-m, 1rem);
		}
	}
	.deck {
		margin-bottom: var(--z-ds-space-xl, 2rem);
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: var(--z-ds-space-m, 1rem);
		margin-top: var(--z-ds-space-m, 1rem);
	}
	.table__head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: var(--z-ds-space-s, 0.75rem);
		font-weight: 600;
	}
	.summary {
		font-weight: 400;
		color: var(--z-ds-color-text-70, #444444);
	}
	.controls {
		display: flex;
		gap: var(--z-ds-space-s, 0.75rem);
		margin-top: var(--z-ds-space-xl, 2rem);
	}
	.controls button,
	.jira button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--z-ds-space-xxs, 0.4rem);
		padding: var(--z-ds-space-xs, 0.5rem) var(--z-ds-space-m, 1rem);
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-text-100, #252525);
		color: var(--z-ds-color-background-0, #ffffff);
		font: inherit;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.secondary {
		background: var(--z-ds-color-background-20, #dfdfe1);
		color: var(--z-ds-color-text-100, #252525);
	}
	.error {
		color: var(--z-ds-color-error-70, #bf4040);
	}
	.ticket-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--z-ds-space-s, 0.75rem);
		margin: 0 0 var(--z-ds-space-m, 1rem);
	}
	.ticket {
		margin: 0;
		color: var(--z-ds-color-text-70, #444444);
	}
	/* Moderator only: step through the backlog (also on the ← / → keys). */
	.ticket-nav {
		display: inline-flex;
		align-items: center;
		gap: var(--z-ds-space-xs, 0.5rem);
		color: var(--z-ds-color-text-55, #69696c);
		font-size: var(--z-ds-font-size-s, 0.875rem);
		white-space: nowrap;
	}
	.ticket-nav__pos {
		font-variant-numeric: tabular-nums;
	}
	.ticket-nav button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem;
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-background-20, #dfdfe1);
		color: var(--z-ds-color-text-100, #252525);
		cursor: pointer;
	}
	.ticket--empty {
		color: var(--z-ds-color-text-55, #69696c);
	}
	.ticket a {
		color: inherit;
		font-weight: 600;
	}
	.ticket-preview {
		margin: 0 0 var(--z-ds-space-m, 1rem);
		padding: var(--z-ds-space-s, 0.75rem);
		border-left: 3px solid var(--z-ds-color-border-70, #cccccc);
		background: var(--z-ds-color-background-10, #eeeeee);
	}
	.ticket-preview__title {
		margin: 0;
		font-weight: 600;
		color: var(--z-ds-color-text-100, #252525);
	}
	.ticket-preview__desc {
		margin: var(--z-ds-space-xs, 0.5rem) 0 0;
		color: var(--z-ds-color-text-70, #444444);
		font-size: var(--z-ds-font-size-s, 0.875rem);
		/* The whole description is shown; long ones scroll in place so the
		   deck stays in view. */
		max-height: 60vh;
		overflow-y: auto;
		overflow-wrap: anywhere;
	}
	/* The description is injected HTML, so its elements carry no scoping
	   class — style them through :global, anchored on the scoped wrapper. */
	.ticket-preview__desc :global(:is(h3, h4, h5, h6)) {
		margin: var(--z-ds-space-s, 0.75rem) 0 var(--z-ds-space-xxs, 0.25rem);
		font-size: inherit;
		font-weight: 600;
		color: var(--z-ds-color-text-100, #252525);
	}
	.ticket-preview__desc :global(:is(p, ul, ol, pre, blockquote, table)) {
		margin: 0 0 var(--z-ds-space-xs, 0.5rem);
	}
	.ticket-preview__desc :global(:is(ul, ol)) {
		padding-left: 1.5rem;
	}
	.ticket-preview__desc :global(li > :is(p, ul, ol):last-child),
	.ticket-preview__desc > :global(:last-child) {
		margin-bottom: 0;
	}
	.ticket-preview__desc > :global(:first-child) {
		margin-top: 0;
	}
	/* Checklists: the checkbox replaces the bullet. */
	.ticket-preview__desc :global(ul.adf-tasks) {
		padding-left: 0;
		list-style: none;
	}
	.ticket-preview__desc :global(ul.adf-tasks li) {
		display: flex;
		align-items: baseline;
		gap: var(--z-ds-space-xs, 0.5rem);
	}
	.ticket-preview__desc :global(ul.adf-tasks input) {
		flex: none;
		margin: 0;
	}
	.ticket-preview__desc :global(a) {
		color: inherit;
		font-weight: 600;
	}
	.ticket-preview__desc :global(code) {
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
		background: var(--z-ds-color-background-20, #dfdfe1);
		font-size: 0.9em;
	}
	.ticket-preview__desc :global(pre) {
		overflow-x: auto;
	}
	.ticket-preview__desc :global(blockquote) {
		padding-left: var(--z-ds-space-s, 0.75rem);
		border-left: 2px solid var(--z-ds-color-border-70, #cccccc);
	}
	.ticket-preview__desc :global(:is(th, td)) {
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--z-ds-color-border-70, #cccccc);
		text-align: left;
		vertical-align: top;
	}
	.ticket-preview__desc :global(table) {
		border-collapse: collapse;
	}
	/* Jira workflow status of a ticket (search hits and the preview title). */
	.status-badge {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		background: var(--z-ds-color-background-20, #dfdfe1);
		color: var(--z-ds-color-text-70, #444444);
		font-size: var(--z-ds-font-size-xs, 0.75rem);
		font-weight: 400;
		white-space: nowrap;
		vertical-align: middle;
	}
	.ticket-preview__title .status-badge {
		margin-left: var(--z-ds-space-xs, 0.5rem);
		background: var(--z-ds-color-background-0, #ffffff);
	}
	/* Search hits of the ticket field (`.jira__field` is the positioning
	   parent). Floats over the page so typing does not shift the layout, above
	   the sticky ticket column. Selectors are prefixed with `.jira` where they
	   have to outrank the shared `.jira button` / `.jira input` looks. */
	.backlog__results {
		position: absolute;
		z-index: 2;
		top: calc(100% + 0.25rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: var(--z-ds-space-xxs, 0.25rem);
		list-style: none;
		border: 1px solid var(--z-ds-color-background-20, #dfdfe1);
		border-radius: var(--z-ds-radius-s, 6px);
		background: var(--z-ds-color-background-0, #ffffff);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.15);
	}
	.jira .backlog__results button {
		display: flex;
		align-items: baseline;
		justify-content: flex-start;
		gap: var(--z-ds-space-s, 0.75rem);
		width: 100%;
		padding: var(--z-ds-space-xs, 0.5rem);
		border: 0;
		border-radius: var(--z-ds-radius-s, 6px);
		background: none;
		color: var(--z-ds-color-text-100, #252525);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.jira .backlog__results button:hover,
	.jira .backlog__results button:focus-visible {
		background: var(--z-ds-color-background-10, #eeeeee);
	}
	.backlog__key {
		flex: none;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.backlog__summary {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.backlog__note {
		padding: var(--z-ds-space-xs, 0.5rem);
		color: var(--z-ds-color-text-55, #69696c);
		font-size: var(--z-ds-font-size-s, 0.875rem);
	}
	.backlog__statuses {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--z-ds-space-xs, 0.5rem) var(--z-ds-space-m, 1rem);
		margin: var(--z-ds-space-s, 0.75rem) 0 0;
		padding: 0;
		border: 0;
		font-size: var(--z-ds-font-size-s, 0.875rem);
	}
	/* A legend only lays out inline as a float; keeps it in the flex row. */
	.backlog__statuses legend {
		float: left;
		padding: 0;
		color: var(--z-ds-color-text-55, #69696c);
	}
	.backlog__statuses label {
		display: inline-flex;
		align-items: center;
		gap: var(--z-ds-space-xxs, 0.35rem);
		cursor: pointer;
	}
	.jira .backlog__statuses input {
		margin: 0;
		padding: 0;
	}
	.backlog__count {
		color: var(--z-ds-color-text-55, #69696c);
		font-size: var(--z-ds-font-size-s, 0.875rem);
		font-variant-numeric: tabular-nums;
	}
	/* Leading row above the ticket/voting columns, separated by a hairline. */
	.jira {
		margin-bottom: var(--z-ds-space-l, 1.5rem);
		padding-bottom: var(--z-ds-space-l, 1.5rem);
		border-bottom: 1px solid var(--z-ds-color-border-70, #e4e4e4);
	}
	.jira__head {
		margin: 0 0 var(--z-ds-space-s, 0.75rem);
		font-size: var(--z-ds-font-size-m, 1rem);
	}
	.jira__form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--z-ds-space-s, 0.75rem);
	}
	.jira input,
	.jira select {
		padding: var(--z-ds-space-xs, 0.5rem);
		border: 1px solid var(--z-ds-color-background-20, #dfdfe1);
		border-radius: var(--z-ds-radius-s, 6px);
		background-color: var(--z-ds-color-background-0, #ffffff);
		color: var(--z-ds-color-text-100, #252525);
		font: inherit;
	}
	.jira__field {
		position: relative;
		display: flex;
		/* Wide basis so the ticket field takes a row of its own before the
		   points/save controls wrap next to it. */
		flex: 1 1 24rem;
	}
	/* `.jira input` (class + element) outranks a bare `.jira__link`, so the
	   padding override has to be scoped too — otherwise its `padding`
	   shorthand wins and the text runs under the clear button. */
	.jira .jira__link {
		flex: 1 1 auto;
		min-width: 0;
		/* room for the clear button sitting on top of the field */
		padding-right: 2.25rem;
	}
	.jira__link[aria-invalid='true'] {
		border-color: var(--z-ds-color-error-70, #bf4040);
	}
	/* Overrides the shared `.jira button` look: this one sits inside the field. */
	.jira .jira__clear {
		position: absolute;
		top: 50%;
		right: 0.35rem;
		transform: translateY(-50%);
		padding: 0.25rem;
		background: transparent;
		color: var(--z-ds-color-text-70, #444444);
		border-radius: var(--z-ds-radius-s, 6px);
	}
	.jira .jira__clear:hover {
		color: var(--z-ds-color-text-100, #252525);
		background: var(--z-ds-color-background-20, #dfdfe1);
	}
	.jira__points {
		width: 6rem;
		/* Custom select: hide the native arrow and draw the ZDS chevron-down
		   ourselves, nudged further in from the right edge. */
		appearance: none;
		padding-right: 2rem;
		background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 4L7 10L1 4' stroke='%23262626' stroke-width='1.5'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 12px;
		cursor: pointer;
	}
	/* The chevron's stroke color is baked into the data URI, so it needs a
	   light-on-dark swap the same way styles-zds.css switches its tokens:
	   once for the OS-driven "system" theme, once for the explicit toggle. */
	@media (prefers-color-scheme: dark) {
		:global(html:not(.color-scheme-light)) .jira__points {
			background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 4L7 10L1 4' stroke='%23ffffff' stroke-width='1.5'/%3E%3C/svg%3E");
		}
	}
	:global(html.color-scheme-dark) .jira__points {
		background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 4L7 10L1 4' stroke='%23ffffff' stroke-width='1.5'/%3E%3C/svg%3E");
	}
	.jira__status {
		margin: var(--z-ds-space-xs, 0.5rem) 0 0;
		color: var(--z-ds-color-background-success, #09864d);
	}
	.jira__status--error {
		color: var(--z-ds-color-error-70, #bf4040);
	}
</style>
