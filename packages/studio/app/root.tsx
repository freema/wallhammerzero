// The app shell: the document, the top bar with the navigation, and the error page.

import type { ReactNode } from "react";
import { isRouteErrorResponse, Link, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { LiveEvents, LiveIndicator } from "./live.tsx";
import { PREVIEW_LAYER_ID } from "./preview/host.ts";
import "./app.css";

/** The navigation. A later note that adds a page adds its entry here. */
const NAV: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/gallery", label: "Gallery" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        {/* No favicon file: an empty one stops the browser from asking for /favicon.ico. */}
        <link rel="icon" href="data:," />
        <Meta />
        <Links />
      </head>
      <body>
        <header className="topbar">
          <Link to="/" className="brand">
            Wallhammer Zero <span>studio</span>
          </Link>
          <nav aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end ?? false}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <LiveIndicator />
        </header>
        <LiveEvents />
        {/* The one canvas every preview of the page is drawn on (app/preview/host.ts). */}
        <div id={PREVIEW_LAYER_ID} className="preview-layer" aria-hidden="true" />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something broke";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Not found" : `Error ${error.status}`;
    details = typeof error.data === "string" && error.data !== "" ? error.data : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
    if (import.meta.env.DEV) stack = error.stack;
  }
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>{details}</p>
      {stack === undefined ? null : <pre className="error-text">{stack}</pre>}
    </main>
  );
}
