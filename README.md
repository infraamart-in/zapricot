# Zapricot website

Pre-launch website for Zapricot: one metal tap-to-charge card for every EV charger in India.
Pages: home (3D card ring), product (card rolodex), about, privacy, terms, plus the early-access
and contact dialogs.

## Tech stack

- **Vite 8 + React 18 + TypeScript**, prerendered to static HTML at build time (SSG) and hydrated on the client
- **three.js** via `@react-three/fiber` and `@react-three/drei` for the 3D cards
- **Vercel** static hosting + one serverless function (`api/register.ts` → `server/register.ts`)
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
npm run build     # typecheck, client build, SSR build, prerender → dist/
npm run preview   # serve dist/ like Vercel does (http://localhost:4173)
npm test          # server-side form handler tests
```

Card textures, poster stills and about-page images in `public/` are already optimized and committed.
They are generated from raw source photos (`assets/`, `assets-src/`) that are **not** in the
repository; `npm run assets` and `npm run assets:about` only work with those folders present locally.
Card proportions for every card on the site come from `src/cardSpec.ts`.

## Environment variables

Names only; see `.env.example`. Never commit real values.

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_TURNSTILE_SITE_KEY` | build time, public | Turnstile site key (shipped to the browser) |
| `TURNSTILE_SECRET_KEY` | server only | Verifies Turnstile tokens (required in production; the form fails closed without it) |
| `JOTFORM_API_KEY` | server only | Jotform API key used to submit registrations |
| `JOTFORM_FORM_ID` | server only | Jotform form ID (defaults to the current form) |
| `SITE_URL` | build time | Canonical origin for canonical/OG URLs, `robots.txt` and `sitemap.xml` |
| `UPSTASH_REDIS_REST_URL` | server only, optional | Shared rate limiting (falls back to in-memory) |
| `UPSTASH_REDIS_REST_TOKEN` | server only, optional | Token for the above |
| `JOTFORM_DRY_RUN` | local only | `1` (default) = dev/preview server never forwards to Jotform |

## Deploy (Vercel)

1. Import the repository in Vercel. Framework preset: **Vite**; build command `npm run build`;
   output directory `dist` (both are the defaults for Vite).
2. Add the environment variables above (Production, and Preview if you use preview deployments).
   `VITE_TURNSTILE_SITE_KEY` and `SITE_URL` are read at build time, so redeploy after changing them.
3. Add the domain. `vercel.json` already sets clean URLs, security headers (CSP, HSTS…), caching and
   a 301 from `www.zapricot.in` to `zapricot.in`; update that host if the domain differs.
4. In Cloudflare Turnstile, allow the production domain for the site key.
