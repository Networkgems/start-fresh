# Start Fresh

Reputation-and-privacy cleanup service. A user gives us their name; we scan the
open web and data brokers, produce a reputation report, then run removals:
negative content, data-broker records, stale data history, social-media
connections, and images.

This repo is the product foundation — a deployable hello-world that every later
feature builds on.

## Stack

| Concern        | Choice                          | Why |
| -------------- | ------------------------------- | --- |
| Runtime        | Node.js 22 (LTS)                | Modern, matches Render's node runtime |
| Language       | TypeScript (strict)             | Type safety across the whole product |
| Web framework  | Express 4                       | Minimal, battle-tested, easy to extend into APIs |
| Tests          | Vitest + supertest              | Fast; exercises HTTP routes without a live socket |
| Package manager | npm                            | Zero-config on Render + GitHub Actions (`npm ci`) |
| CI             | GitHub Actions                  | typecheck → build → test on every push/PR |
| Hosting        | Render (web service)            | Simple git-driven deploys, health checks, blueprint IaC |

A React/Next front end and a database can be layered on later; the foundation is
kept lean and deployable.

## Layout

```
src/app.ts     Express app factory (routes; no port binding — testable)
src/index.ts   Server entrypoint (reads PORT, graceful shutdown)
test/          Vitest + supertest route tests
render.yaml    Render Blueprint (infra-as-code)
.github/workflows/ci.yml   CI pipeline
```

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # run tests
npm run typecheck  # type-only check
npm run build      # emit dist/
```

## Endpoints

- `GET /` — hello-world landing page
- `GET /api/health` — JSON health probe (used by Render's health check)

## Deploy (Render)

Deploys are git-driven from `main`. Build `npm ci && npm run build`, start
`npm run start`, health check `/api/health`. Config is committed in
`render.yaml`.
