// The React Router request handler, as an Express app. This is the entry of the server build
// (vite.config.ts) and the module Vite reloads in dev, so it creates nothing long-lived: the
// services come from server.ts through `res.locals.studio`, and go to loaders and actions as
// `context.get(studioContext)`.

import { createRequestHandler } from "@react-router/express";
import express from "express";
import { RouterContextProvider } from "react-router";
import { studioContext } from "../app/context.ts";
import type { StudioServices } from "./services/index.ts";

export const app = express();
app.disable("x-powered-by");

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext(_req, res) {
      const services = res.locals["studio"] as StudioServices | undefined;
      if (services === undefined) throw new Error("server/app.ts must be mounted by server.ts, which provides the services");
      const context = new RouterContextProvider();
      context.set(studioContext, services);
      return context;
    },
  }),
);
