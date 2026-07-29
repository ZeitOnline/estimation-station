<script lang="ts">
import { onDestroy, onMount, untrack } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Card, Icon, Participants } from '$components';
import { authFetch, SessionExpiredError } from '$lib/auth-fetch';
import { parseIssueKey } from '$lib/jira-link';
import { getName, getToken, getUserId } from '$lib/poker/identity';
import { createRoom } from '$lib/poker/room.svelte';
import { voteSummary } from '$lib/poker/summary';
import { isStoryPointValue, nearestStoryPointValue, STORY_POINT_VALUES } from '$lib/story-points';
import type { Card as CardType } from '$types';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const room = createRoom();

// Your own current pick (derived from the server state for this user).
const myVote = $derived(
	room.state?.participants.find((p) => p.userId === getUserId())?.vote ?? null
);
const summary = $derived(room.state ? voteSummary(room.state.participants) : null);

onMount(() => {
	const name = getName();
	if (!name) {
		// no name yet → go pick one on the landing page
		goto(resolve('/'));
		return;
	}
	room.connect(data.roomId, getUserId(), name, getToken());
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
let ticketPreview = $state<{ key: string; summary: string; description: string } | null>(null);

$effect(() => {
	const key = ticketKey;
	ticketPreview = null;
	if (!key) return;
	const timer = setTimeout(async () => {
		try {
			const res = await authFetch(
				`${resolve('/api/jira/preview')}?issue=${encodeURIComponent(key)}`
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
	jiraStatus = null;
	room.setTicket(jiraLink.trim());
}

// Explicit "remove ticket": clear the input, drop the ticket for the room, and
// forget the pending points so the next round starts clean.
function clearTicket() {
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
		const res = await authFetch(resolve('/api/jira/story-points'), {
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
			<h2 class="jira__head">Story Points → Jira</h2>
			<form class="jira__form" onsubmit={submitStoryPoints}>
				<div class="jira__field">
					<input
						class="jira__link"
						type="text"
						placeholder="ENG-958 oder https://…/browse/ENG-958"
						aria-label="Jira-Ticket: Link oder Ticket-Nummer"
						aria-invalid={linkInvalid}
						bind:value={jiraLink}
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
			{#if linkInvalid}
				<p class="jira__status jira__status--error">
					Kein Ticket erkannt — Ticket-Nummer (ENG-958) oder Link (…/browse/ENG-958) eingeben
				</p>
			{:else if jiraStatus}
				<p class="jira__status" class:jira__status--error={!jiraStatus.ok}>{jiraStatus.text}</p>
			{/if}
		</section>
	{/if}

	<!-- Wide screens: what we estimate on the left, the estimating itself on the
	     right. Narrow screens: the same order, stacked. -->
	<div class="room-grid">
		<aside class="ticket-col">
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
				{#if ticketPreview}
					<div class="ticket-preview">
						<p class="ticket-preview__title">{ticketPreview.summary}</p>
						{#if ticketPreview.description}
							<p class="ticket-preview__desc">{ticketPreview.description}</p>
						{/if}
					</div>
				{/if}
			{:else}
				<p class="ticket ticket--empty">
					Noch kein Ticket{room.state.youAreModerator ? ' — oben eintragen' : ''}
				</p>
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
				<Participants room={room.state} />
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
	.ticket {
		margin: 0 0 var(--z-ds-space-m, 1rem);
		color: var(--z-ds-color-text-70, #444444);
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
		background: var(--z-ds-color-background-95, #f6f6f6);
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
		white-space: pre-line;
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
		background-color: transparent;
		background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 4L7 10L1 4' stroke='%23262626' stroke-width='1.5'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 12px;
		cursor: pointer;
	}
	.jira__status {
		margin: var(--z-ds-space-xs, 0.5rem) 0 0;
		color: var(--z-ds-color-background-success, #09864d);
	}
	.jira__status--error {
		color: var(--z-ds-color-error-70, #bf4040);
	}
</style>
