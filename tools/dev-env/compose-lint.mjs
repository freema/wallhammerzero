// Lints compose.yaml for the rules of docs/dev-environment.md that a reader cannot see break:
//
// - every Node image is pinned by version and digest;
// - every published port is "127.0.0.1:${WHZ_<NAME>_PORT:-<default>}:<container port>":
//   loopback only, a fixed default, overridable by an environment variable;
// - no two ports share a default or a variable; no service uses the host network.
//
// A line scanner, not a YAML parser (the repo's tools have no dependencies). It reads the
// short port syntax only and reports anything else under `ports:` as an error.

const PORT = /^127\.0\.0\.1:\$\{(WHZ_[A-Z0-9_]+_PORT):-(\d+)\}:(\d+)(?:\/(?:tcp|udp))?$/;
const PINNED_IMAGE = /^[\w./-]+:\d+\.\d+\.\d+[\w.-]*@sha256:[0-9a-f]{64}$/;

const unquote = (text) => text.trim().replace(/^(["'])(.*)\1$/, "$2");
const stripComment = (line) => line.replace(/(^|\s)#.*$/, "");
const indentOf = (line) => line.length - line.trimStart().length;

/**
 * @param {string} text contents of compose.yaml
 * @returns {{errors: string[], ports: {line: number, variable: string, hostPort: number, containerPort: number}[], images: string[]}}
 */
export function lintCompose(text) {
  const errors = [];
  const ports = [];
  const images = [];
  const lines = text.split(/\r?\n/);

  const addPort = (raw, lineNumber) => {
    const value = unquote(raw);
    const match = PORT.exec(value);
    if (!match) {
      errors.push(
        `line ${lineNumber}: port "${value}" must look like "127.0.0.1:\${WHZ_<NAME>_PORT:-<default>}:<container port>"`,
      );
      return;
    }
    ports.push({ line: lineNumber, variable: match[1], hostPort: Number(match[2]), containerPort: Number(match[3]) });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripComment(lines[i]);
    const lineNumber = i + 1;

    const image = /^\s*image:\s*(.+)$/.exec(line);
    if (image) {
      const value = unquote(image[1]);
      images.push(value);
      if (!PINNED_IMAGE.test(value)) {
        errors.push(`line ${lineNumber}: image "${value}" must be pinned as <name>:<x.y.z>@sha256:<digest>`);
      }
    }

    if (/^\s*network_mode:\s*["']?host["']?\s*$/.test(line)) {
      errors.push(`line ${lineNumber}: network_mode: host publishes every port on every interface`);
    }

    const portsKey = /^(\s*)ports:\s*(.*)$/.exec(line);
    if (!portsKey) continue;
    const inline = portsKey[2].trim();
    if (inline !== "") {
      const flow = /^\[(.*)\]$/.exec(inline);
      if (!flow) {
        errors.push(`line ${lineNumber}: cannot read this ports value; use a list of short-syntax strings`);
        continue;
      }
      for (const item of flow[1].split(",")) if (item.trim() !== "") addPort(item, lineNumber);
      continue;
    }
    const keyIndent = portsKey[1].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = stripComment(lines[j]);
      if (next.trim() === "") continue;
      if (indentOf(next) < keyIndent) break;
      const item = /^\s*-\s*(.*)$/.exec(next);
      if (!item) {
        if (indentOf(next) === keyIndent) break; // the next key of the same service
        errors.push(`line ${j + 1}: long port syntax is not supported here; use the short string form`);
        continue;
      }
      addPort(item[1], j + 1);
    }
  }

  const byHostPort = new Map();
  const byVariable = new Map();
  for (const port of ports) {
    if (byHostPort.has(port.hostPort)) {
      errors.push(`line ${port.line}: default port ${port.hostPort} is already used on line ${byHostPort.get(port.hostPort)}`);
    } else byHostPort.set(port.hostPort, port.line);
    if (byVariable.has(port.variable)) {
      errors.push(`line ${port.line}: ${port.variable} is already used on line ${byVariable.get(port.variable)}`);
    } else byVariable.set(port.variable, port.line);
  }

  return { errors, ports, images };
}
