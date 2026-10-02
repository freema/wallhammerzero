import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lintCompose } from "../compose-lint.mjs";

const DIGEST = `sha256:${"ab".repeat(32)}`;
const service = (body) => `services:\n  studio:\n    image: node:24.21.0-bookworm-slim@${DIGEST}\n${body}\n`;

test("the repo's compose.yaml follows the rules", () => {
  const text = readFileSync(new URL("../../../compose.yaml", import.meta.url), "utf8");
  const { errors, images } = lintCompose(text);
  assert.deepEqual(errors, []);
  assert.ok(images.length >= 1, "compose.yaml names at least one image");
});

test("accepts the port convention, in block and in flow style", () => {
  const block = lintCompose(service('    ports:\n      - "127.0.0.1:${WHZ_STUDIO_PORT:-4100}:4100"\n      # a comment\n      - 127.0.0.1:${WHZ_HMR_PORT:-4102}:24678/tcp\n    command: x'));
  assert.deepEqual(block.errors, []);
  assert.deepEqual(block.ports.map((port) => [port.variable, port.hostPort, port.containerPort]), [
    ["WHZ_STUDIO_PORT", 4100, 4100],
    ["WHZ_HMR_PORT", 4102, 24678],
  ]);
  const flow = lintCompose(service('    ports: ["127.0.0.1:${WHZ_STUDIO_PORT:-4100}:4100"]'));
  assert.deepEqual(flow.errors, []);
  assert.equal(flow.ports.length, 1);
});

test("rejects ports that are not loopback-only, fixed or overridable", () => {
  const bad = [
    '"4100:4100"', // every interface
    '"0.0.0.0:4100:4100"',
    '"127.0.0.1:4100:4100"', // no override variable
    '"127.0.0.1:${WHZ_STUDIO_PORT}:4100"', // no default
    '"127.0.0.1:${STUDIO_PORT:-4100}:4100"', // wrong variable name
    '"${WHZ_STUDIO_PORT:-4100}:4100"', // no address
    '"127.0.0.1::4100"', // random host port
    '"4100"',
  ];
  for (const entry of bad) {
    const { errors } = lintCompose(service(`    ports:\n      - ${entry}`));
    assert.equal(errors.length, 1, `${entry} must be rejected`);
    assert.match(errors[0], /^line 5: port /);
  }
});

test("rejects the long port syntax instead of skipping it", () => {
  const { errors } = lintCompose(service("    ports:\n      - target: 4100\n        published: 4100\n    command: x"));
  assert.ok(errors.length >= 1);
  assert.match(errors.join("\n"), /port "target: 4100" must look like|long port syntax/);
});

test("rejects two services on the same default port or variable", () => {
  const text = `${service('    ports:\n      - "127.0.0.1:${WHZ_STUDIO_PORT:-4100}:4100"')}  other:\n    ports:\n      - "127.0.0.1:\${WHZ_OTHER_PORT:-4100}:80"\n      - "127.0.0.1:\${WHZ_STUDIO_PORT:-4105}:81"\n`;
  const { errors } = lintCompose(text);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /default port 4100 is already used on line 5/);
  assert.match(errors[1], /WHZ_STUDIO_PORT is already used on line 5/);
});

test("rejects unpinned images and the host network", () => {
  const cases = ["node:24", "node:24.21.0-bookworm-slim", "node:latest", `node@${DIGEST}`, `node:24-slim@${DIGEST}`];
  for (const image of cases) {
    const { errors } = lintCompose(`services:\n  dev:\n    image: ${image}\n`);
    assert.equal(errors.length, 1, `${image} must be rejected`);
    assert.match(errors[0], /must be pinned/);
  }
  const host = lintCompose(service("    network_mode: host"));
  assert.match(host.errors[0], /network_mode: host/);
  assert.deepEqual(lintCompose(service("    network_mode: bridge")).errors, []);
});

test("ignores commented-out ports", () => {
  const { errors, ports } = lintCompose(service('    # ports:\n    #   - "4100:4100"'));
  assert.deepEqual(errors, []);
  assert.deepEqual(ports, []);
});
