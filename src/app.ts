import express, { type Express, type Request, type Response } from "express";

export const SERVICE_NAME = "start-fresh";
export const VERSION = process.env.npm_package_version ?? "0.1.0";

/**
 * Build the Express application.
 *
 * Kept as a factory (no port binding) so tests can exercise routes with
 * supertest without opening a socket. `index.ts` owns the actual listen().
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  // Liveness/readiness probe — Render health check points here.
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Minimal hello-world landing page. Real UI lands in a later task.
  app.get("/", (_req: Request, res: Response) => {
    res.status(200).type("html").send(landingPage());
  });

  return app;
}

function landingPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Start Fresh</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
           margin: 0; min-height: 100vh; display: grid; place-items: center;
           background: #0b1020; color: #e8ecf5; }
    main { max-width: 34rem; padding: 2.5rem; text-align: center; }
    h1 { font-size: 2.25rem; margin: 0 0 .5rem; letter-spacing: -.02em; }
    p { color: #a9b4cc; line-height: 1.6; }
    .badge { display: inline-block; margin-top: 1.25rem; padding: .35rem .75rem;
             border: 1px solid #2a3660; border-radius: 999px; color: #8fa0c8; font-size: .8rem; }
    a { color: #7aa2ff; }
  </style>
</head>
<body>
  <main>
    <h1>Start Fresh</h1>
    <p>Clear your name. Reclaim your privacy. We scan the open web and data brokers,
       build your reputation report, and run removals on your behalf.</p>
    <p>Foundation is live. Product features are on the way.</p>
    <span class="badge">v${VERSION} · <a href="/api/health">health</a></span>
  </main>
</body>
</html>`;
}
