// The Host check and the write guard, as plain functions (http.test.ts runs them as middleware).

import { describe, expect, it } from "vitest";
import { checkHost, checkSameOrigin } from "../server/services/guard.ts";

describe("checkHost", () => {
  it.each([["127.0.0.1:4100"], ["127.0.0.1"], ["localhost:4107"], ["LOCALHOST:4100"], ["[::1]:4100"]])("accepts the loopback host %s", (host) => {
    expect(checkHost(host)).toEqual({ ok: true });
  });

  it.each([["evil.example:4100"], ["192.168.1.20:4100"], ["0.0.0.0:4100"], ["127.0.0.1.evil.example"], ["localhost.evil.example:4100"]])(
    "refuses %s with 403 (DNS rebinding, the LAN address)",
    (host) => {
      expect(checkHost(host)).toMatchObject({ ok: false, status: 403 });
    },
  );

  it.each([[undefined], [""], ["127.0.0.1:4100/path"], ["user@127.0.0.1"], ["127.0.0.1 evil.example"], ["127.0.0.1:99999"]])("refuses the malformed Host %j with 400", (host) => {
    expect(checkHost(host)).toMatchObject({ ok: false, status: 400 });
  });

  it("accepts an extra host name only when it is configured", () => {
    expect(checkHost("studio.test:4100")).toMatchObject({ ok: false, status: 403 });
    expect(checkHost("studio.test:4100", ["studio.test"])).toEqual({ ok: true });
  });
});

describe("checkSameOrigin", () => {
  const host = "127.0.0.1:4100";

  it("lets reads through without an Origin", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) expect(checkSameOrigin({ method, host, origin: undefined })).toEqual({ ok: true });
  });

  it("lets a read through even from another origin (reads are covered by the Host check)", () => {
    expect(checkSameOrigin({ method: "GET", host, origin: "https://evil.example" })).toEqual({ ok: true });
  });

  it.each([["POST"], ["PUT"], ["PATCH"], ["DELETE"], ["post"]])("accepts %s from the studio's own origin", (method) => {
    expect(checkSameOrigin({ method, host, origin: "http://127.0.0.1:4100" })).toEqual({ ok: true });
  });

  it("refuses a write without an Origin", () => {
    expect(checkSameOrigin({ method: "POST", host, origin: undefined })).toMatchObject({ ok: false, status: 403, message: "a write request needs an Origin header" });
    expect(checkSameOrigin({ method: "POST", host, origin: "" })).toMatchObject({ ok: false, status: 403 });
  });

  it.each([
    ["https://evil.example"],
    ["http://127.0.0.1:4101"], // another port is another origin
    ["http://localhost:4100"], // another name for the same machine is another origin too
    ["http://127.0.0.1"],
    ["null"], // a sandboxed frame, a file: page
    ["file://"],
    ["not an origin"],
  ])("refuses a write from %s", (origin) => {
    expect(checkSameOrigin({ method: "POST", host, origin })).toMatchObject({ ok: false, status: 403 });
  });

  it("treats the default port as no port", () => {
    expect(checkSameOrigin({ method: "POST", host: "localhost", origin: "http://localhost" })).toEqual({ ok: true });
    expect(checkSameOrigin({ method: "POST", host: "localhost:80", origin: "http://localhost" })).toEqual({ ok: true });
  });

  it("refuses a write without a usable Host", () => {
    expect(checkSameOrigin({ method: "POST", host: undefined, origin: "http://127.0.0.1:4100" })).toMatchObject({ ok: false, status: 400 });
  });
});
