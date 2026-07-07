# Bangkok Weed Shop Tracker — setup (Netlify-only)

Everything runs on Netlify — no external database or account needed.
Storage is handled by **Netlify Blobs** (Netlify's built-in key-value
store) through two **Netlify Functions** (`shops.js` and `auth.js`).

## Deploy

Netlify Functions need a build step to install the `@netlify/blobs`
dependency, so a plain drag-and-drop of the zip **won't** wire up the
backend — use one of these instead:

**Option A — Git (recommended)**
1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Build settings are already set in `netlify.toml` (publish `.`, functions
   in `netlify/functions`) — just click Deploy.

**Option B — Netlify CLI**
```bash
npm install -g netlify-cli
cd bangkok-weed-shop-tracker
netlify deploy --prod
```
The CLI installs dependencies and deploys the functions for you.

That's it — no signup for a separate database, no API keys to paste in.

## How it works

- **`netlify/functions/shops.js`** — GET/POST/PATCH/DELETE for the shop
  directory, stored in a Netlify Blobs store called `weed-tracker`. On the
  very first request, it seeds itself from the bundled `data/shops.json`
  (the cleaned 500-shop dataset), so you don't need a separate import step.
- **`netlify/functions/auth.js`** — login/register, backed by the same
  Blobs store. Seeds a default `admin` / `000000` account automatically.
- **`app.js`** — calls these functions instead of a database directly.
  Every status change is stamped with whoever is logged in.
- **Sync across devices**: Netlify Blobs has no realtime push, so instead
  the app polls the functions every 7 seconds (and on window focus) and
  only re-renders if something actually changed. Updates on other
  devices/tabs show up within a few seconds — not instant, but genuinely
  synced through the same backend.
- **No functions available** (e.g. you open `index.html` directly as a
  local file instead of through Netlify): the app falls back to
  browser-only storage automatically, so you can still preview it.

## ⚠️ Security, honestly

Login is a simple username + 6-digit-passcode check done inside the
function, not a full auth system — passcodes are stored as plain text in
the Blobs store. The functions also don't verify *who* is calling them
beyond that passcode check, so this is appropriate for a small internal
outreach tracker, not for anything with sensitive personal or financial
data. If you want it hardened later (hashed passcodes, rate limiting,
per-user permissions), that's a reasonable next step — happy to help.

## Files

- `index.html`, `styles.css`, `app.js` — the app
- `config.js` — just points the app at `/.netlify/functions`
- `netlify.toml` — tells Netlify where the functions live
- `package.json` — the one dependency (`@netlify/blobs`)
- `netlify/functions/shops.js` — shop CRUD
- `netlify/functions/auth.js` — login/register
- `netlify/functions/data/shops.json` — seed data (500 shops)
- `shops.json` (top level) — same seed data, used only by the local-only
  fallback mode
