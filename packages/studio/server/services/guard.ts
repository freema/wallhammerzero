// Who may talk to the studio. It listens on loopback only, but a web page the owner has open
// in the same browser can still send requests to 127.0.0.1. Two checks stop that:
//
// - the Host check, on every request: the Host header must name a loopback host. A page that
//   reaches the studio through a DNS name it controls (DNS rebinding) is refused, so it can
//   read nothing.
// - the write guard, on every request that is not GET, HEAD or OPTIONS: the Origin header must
//   be there and must be the origin the request was sent to (Origin host = Host). A form or a
//   fetch from another site is refused, and so is a request without an Origin.
//
// Later notes add write endpoints (verdicts, task notes, builds); none of them needs its own
// check, because the guard sits in front of the whole app.

/** The host names that always pass the Host check. */
export const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]"];

/** Methods that change nothing and need no Origin. */
const SAFE_METHODS: readonly string[] = ["GET", "HEAD", "OPTIONS"];

export type GuardVerdict = { readonly ok: true } | { readonly ok: false; readonly status: 400 | 403; readonly message: string };

const OK: GuardVerdict = { ok: true };
const refuse = (status: 400 | 403, message: string): GuardVerdict => ({ ok: false, status, message });

/** The `host[:port]` of a Host header in the form `URL` gives it, or null if it is not one. */
function parseHost(header: string | undefined): { host: string; hostname: string } | null {
  if (header === undefined || header === "" || /[\s/\\@?#]/.test(header)) return null;
  try {
    const url = new URL(`http://${header}`);
    return { host: url.host.toLowerCase(), hostname: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/** The Host check: the request must be addressed to a loopback name (or an allowed extra name). */
export function checkHost(hostHeader: string | undefined, extraHosts: readonly string[] = []): GuardVerdict {
  const parsed = parseHost(hostHeader);
  if (parsed === null) return refuse(400, "the request has no valid Host header");
  if (LOOPBACK_HOSTS.includes(parsed.hostname) || extraHosts.includes(parsed.hostname)) return OK;
  return refuse(403, `the studio does not answer to the host ${JSON.stringify(parsed.hostname)}`);
}

/** What the write guard reads of a request. */
export interface WriteRequest {
  readonly method: string;
  readonly host: string | undefined;
  readonly origin: string | undefined;
}

/** The write guard: a request that can change something must come from the studio's own page. */
export function checkSameOrigin(request: WriteRequest): GuardVerdict {
  if (SAFE_METHODS.includes(request.method.toUpperCase())) return OK;
  const target = parseHost(request.host);
  if (target === null) return refuse(400, "the request has no valid Host header");
  if (request.origin === undefined || request.origin === "") return refuse(403, "a write request needs an Origin header");
  let origin: URL;
  try {
    origin = new URL(request.origin);
  } catch {
    return refuse(403, "the Origin header is not an origin");
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") return refuse(403, "the Origin header is not an http origin");
  // Compared through URL, so `localhost:80` and `localhost` are the same host for http.
  const expected = new URL(`${origin.protocol}//${target.host}`).host.toLowerCase();
  if (origin.host.toLowerCase() !== expected) return refuse(403, "a write request must come from the studio's own origin");
  return OK;
}
