# Zapricot website

Pre-launch website for Zapricot: one metal tap-to-charge card for every EV charger in India.
Pages: home (3D card ring), product (card rolodex), about, privacy, terms, plus the contact dialog.
Early access is a Google Form (`EARLY_ACCESS_URL` in `src/config.ts`), opened in a new tab.

## Tech stack

- **Vite 8 + React 18 + TypeScript**, prerendered to static HTML at build time (SSG) and hydrated on the client
- **three.js** via `@react-three/fiber` and `@react-three/drei` for the 3D cards
- **Node.js 20 + Express** (`server.js`): serves the built site from `dist/` with the security headers
  (helmet + CSP), redirects and caching, plus `GET /api/health`

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in values (see below)
npm run dev                  # http://localhost:5173
```

## Build

```bash
npm run build         # typecheck, client build, SSR build, prerender → dist/
npm run start:local   # production server with .env.local (http://localhost:3000)
npm start             # production server, env vars from the host (listens on $PORT)
```

Card textures, poster stills and about-page images in `public/` are already optimized and committed.
They are generated from raw source photos (`assets/`, `assets-src/`) that are **not** in the
repository; `npm run assets` and `npm run assets:about` only work with those folders present locally.
Card proportions for every card on the site come from `src/cardSpec.ts`.

## Environment variables

Only one, and it is optional; see `.env.example`.

| Name | Purpose |
| --- | --- |
| `SITE_URL` | Canonical origin, e.g. `https://zapricot.in`: canonical/OG URLs, `robots.txt`, `sitemap.xml` (build time) and the www → apex redirect (runtime). Defaults to `https://zapricot.in`. |

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

Set `SITE_URL` under **Environment Variables** on the app's dashboard if the domain isn't
zapricot.in, then redeploy. `https://<your-domain>/api/health` returns `{"status":"ok"}` when the app is up.

Logs: **Runtime Logs** on the app's dashboard (live stdout/stderr of the latest deployment) and the
deployment log under **Deployments** for build output.
