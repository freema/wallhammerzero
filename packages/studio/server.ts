// The studio server: one Node process that serves the app and owns the long-lived services.
//
// It follows React Router's node-custom-server template: Express in front, Vite in middleware
// mode in dev (HMR over the same port), the built app in production. Node runs this file as it
// is (TypeScript with erasable syntax only), so there is no build step for the server.
//
// The services (asset index, bake worker, file access) are created here, once, and reach the
// loaders through the router context (server/app.ts reads `res.locals.studio`). Code under
// `app/` is reloaded by Vite on every edit; this file and `server/services/` are not, so a
// change here needs a restart.
//
//   node --conditions development packages/studio/server.ts     dev (npm run dev)
//   NODE_ENV=production node packages/studio/server.ts          the built app (npm start)
//
// Settings come from WHZ_STUDIO_* variables: see server/services/config.ts and docs/studio.md.

import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { RequestHandler } from "express";
import { readConfig } from "./server/services/config.ts";
import { eventsHandler, filesHandler, hostGuard, writeGuard } from "./server/services/http.ts";
import { createServices } from "./server/services/index.ts";

const PACKAGE_DIR = fileURLToPath(new URL(".", import.meta.url));

const config = readConfig();
const services = createServices(config);

const app = express();
app.disable("x-powered-by");
const server = createServer(app);

// In front of everything: who may talk to the studio at all, and who may write.
app.use(hostGuard(config.allowedHosts));
app.use(writeGuard());
app.use("/api/files", filesHandler(services.files.resolve));
app.use("/api/events", eventsHandler(services.events, () => services.live.state()));
app.use((_req, res, next) => {
  res.locals["studio"] = services;
  next();
});

if (config.dev) {
  const vite = await import("vite");
  const viteDevServer = await vite.createServer({
    root: PACKAGE_DIR,
    // HMR's WebSocket shares the HTTP server, so one published port is enough.
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(viteDevServer.middlewares);
  app.use(async (req, res, next) => {
    try {
      const source = (await viteDevServer.ssrLoadModule("./server/app.ts")) as { app: RequestHandler };
      await source.app(req, res, next);
    } catch (error) {
      if (error instanceof Error) viteDevServer.ssrFixStacktrace(error);
      next(error);
    }
  });
} else {
  const client = join(PACKAGE_DIR, "build", "client");
  app.use("/assets", express.static(join(client, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(client, { maxAge: "1h" }));
  // A variable, so the type checker does not look for the build output.
  const build = join(PACKAGE_DIR, "build", "server", "index.js");
  app.use(((await import(build)) as { app: RequestHandler }).app);
}

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.port;
  const where = config.host === "0.0.0.0" ? `port ${port} of the container; open http://127.0.0.1:<the published port> (docs/studio.md)` : `http://${config.host}:${port}`;
  console.log(`[studio] ${config.dev ? "dev" : "production"} server on ${where}`);
  console.log(`[studio] assets: ${config.assetsDir}`);
  console.log(`[studio] outputs: ${config.outDir}`);
  console.log(`[studio] live reload: ${config.watch ? `watching the assets folder (a sweep every ${config.watchPollMs} ms)` : "off (WHZ_STUDIO_WATCH=0)"}`);
  services.start();
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    // Open HMR and keep-alive connections would hold `close` back: do not wait for them.
    void services.close().finally(() => process.exit(0));
  });
}
