# Zapricot website

Pre-launch website for Zapricot: one metal tap-to-charge card for every EV charger in India.
Pages: home (3D card ring), product (card rolodex), about, privacy, terms, plus the early-access
and contact dialogs.

## Tech stack

- **Vite 8 + React 18 + TypeScript**, prerendered to static HTML at build time (SSG) and hydrated on the client
- **three.js** via `@react-three/fiber` and `@react-three/drei` for the 3D cards
- **Node.js 20 + Express** (`server.js`): serves the built site from `dist/` with the security headers
  (helmet + CSP), redirects and caching, plus the API: `POST /api/register` and `GET /api/health`
  (form logic in `server/register.ts`, compiled to `server-dist/` by the build)
- **Jotform** (early-access submissions, forwarded server-side), **Cloudflare Turnstile** (bot check),
  optional **Upstash Redis** (rate limiting)

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in values (see below)
npm run dev                  # http://localhost:5173
```

Locally the `/api/register` endpoint runs in dry-run mode (it never forwards to Jotform) unless
`JOTFORM_DRY_RUN=0`.

## Build

```bash
npm run build         # typecheck, client build, SSR build, prerender → dist/, server handler → server-dist/
npm run start:local   # production server with .env.local (http://localhost:3000)
npm start             # production server, env vars from the host (listens on $PORT)
npm test              # server-side form handler tests (Node 22+)
```

Card textures, poster stills and about-page images in `public/` are already optimized and committed.
They are generated from raw source photos (`assets/`, `assets-src/`) that are **not** in the
repository; `npm run assets` and `npm run assets:about` only work with those folders present locally.
Card proportions for every card on the site come from `src/cardSpec.ts`.

## Environment variables

Names only; see `.env.example`. Never commit real values. All are read by `server.js` at runtime;
`VITE_TURNSTILE_SITE_KEY` is also injected into the pages at runtime, and `SITE_URL` is additionally
used at build time for canonical/OG URLs, `robots.txt` and `sitemap.xml` (defaults to https://zapricot.in).

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_TURNSTILE_SITE_KEY` | yes | Turnstile site key (public, shown to the browser) |
| `TURNSTILE_SECRET_KEY` | yes | Verifies Turnstile tokens; without it every submission is refused in production |
| `SITE_URL` | yes | Canonical origin, e.g. `https://zapricot.in` (origin check, www → apex redirect) |
| `JOTFORM_API_KEY` | recommended | Jotform API key; without it submissions go to the public submit endpoint |
| `JOTFORM_FORM_ID` | optional | Jotform form ID (defaults to the current form) |
| `UPSTASH_REDIS_REST_URL` | optional | Shared rate limiting (falls back to in-memory, per process) |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Token for the above |
| `JOTFORM_DRY_RUN` | local only | `1` = never forward to Jotform (leave unset or `0` in production) |

## Deploy (Hostinger Node.js app)

Settings in hPanel → Websites → your Node.js app → build settings:

| Field | Value |
| --- | --- |
| Framework / application type | Express |
| Node.js version | 20.x |
| Build command | `npm run build` |
| Output directory | leave empty (server.js serves `dist/` itself) |
| Entry file | `server.js` |
| Start command (if asked) | `npm start` |

Add the variables above under **Environment Variables** on the app's dashboard, then redeploy.
Check `https://<your-domain>/api/health` afterwards: `"status":"ok"` and an empty `missing_env`.

Logs: **Runtime Logs** on the app's dashboard (live stdout/stderr of the latest deployment) and the
deployment log under **Deployments** for build output. Failure reasons are logged as short codes:
`missing_env:<NAME>`, `turnstile_failed codes=…`, `jotform_<status>`, `upstash_auth_failed`,
`origin_rejected`, `rate_limited`, `invalid_input`.
