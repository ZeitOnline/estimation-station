// =============================================================================
// server.js  —  YOUR OWN Node server.
// =============================================================================
// This is deliberately hand-written (not a framework's built-in server) so you
// can see every moving part. It does two jobs:
//
//   1. Serves an HTML page at  GET /            (server-side rendered)
//   2. Accepts a form POST at  POST /notes      (creates a note)
//
// Both talk to PostgREST over HTTP — the Node server never touches Postgres
// directly. That mirrors how the ZEIT frontends (wally/merkl) call their API.
//
// The PostgREST base URL is injected via the API_BASE env var, so the exact
// same code runs under `npm start`, docker-compose, and k8s.
// =============================================================================

import express from 'express';

const PORT = process.env.PORT || 3001;
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

const app = express();
app.use(express.urlencoded({ extended: false }));

const escape = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]),
  );

function page(notes) {
  const rows = notes
    .map(
      (n) => `
      <li>
        <strong>${escape(n.title)}</strong>
        <span class="meta">#${n.id} · updated ${escape(n.modified)}</span>
        <p>${escape(n.body)}</p>
      </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Notes — learn-zeit-structure</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; }
    h1 { margin-bottom: .25rem; }
    .sub { color: #666; margin-top: 0; }
    ul { list-style: none; padding: 0; }
    li { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: .75rem 0; }
    .meta { color: #999; font-size: .8rem; margin-left: .5rem; }
    form { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1.5rem 0; }
    input, textarea { font: inherit; padding: .5rem; border: 1px solid #ccc; border-radius: 6px; flex: 1; }
    button { font: inherit; padding: .5rem 1rem; border: 0; border-radius: 6px; background: #111; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Notes</h1>
  <p class="sub">Rendered by your Node server, data from PostgREST at <code>${escape(API_BASE)}</code>.</p>

  <form method="post" action="/notes">
    <input name="title" placeholder="Title" required />
    <input name="body" placeholder="Body" />
    <button type="submit">Add note</button>
  </form>

  <ul>${rows || '<li>No notes yet — add one above.</li>'}</ul>
</body>
</html>`;
}

// Home page: fetch notes from PostgREST and render them.
app.get('/', async (_req, res) => {
  try {
    const r = await fetch(`${API_BASE}/notes?order=modified.desc`);
    if (!r.ok) throw new Error(`PostgREST returned ${r.status}`);
    const notes = await r.json();
    res.type('html').send(page(notes));
  } catch (err) {
    res
      .status(502)
      .type('html')
      .send(`<h1>API unavailable</h1><pre>${escape(err.message)}</pre>
             <p>Is PostgREST running at <code>${escape(API_BASE)}</code>?</p>`);
  }
});

// Create a note by POSTing to PostgREST, then redirect back home.
app.post('/notes', async (req, res) => {
  const { title, body } = req.body;
  try {
    const r = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    if (!r.ok) throw new Error(`PostgREST returned ${r.status}: ${await r.text()}`);
    res.redirect('/');
  } catch (err) {
    res.status(502).type('html').send(`<h1>Could not save</h1><pre>${escape(err.message)}</pre>`);
  }
});

// Liveness endpoint for k8s.
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

app.listen(PORT, () => {
  console.log(`node server listening on :${PORT} (API_BASE=${API_BASE})`);
});
