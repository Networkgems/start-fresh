import { createApp, SERVICE_NAME, VERSION } from "./app.js";

// Render injects PORT; default to 3000 for local dev.
const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] v${VERSION} listening on :${PORT}`);
});

// Graceful shutdown so Render deploys/rollbacks don't drop in-flight requests.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[${SERVICE_NAME}] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
