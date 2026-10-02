// A JSON writer for the checked-in data files: like JSON.stringify(value, null, 2), but short
// values stay on one line and long lists of numbers are packed, so the files stay readable and
// their diffs small.

const WIDTH = 110;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

function inline(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${(value as readonly Json[]).map(inline).join(", ")}]`;
  const entries = Object.entries(value as { readonly [key: string]: Json });
  if (entries.length === 0) return "{}";
  return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(", ")} }`;
}

function isPrimitive(value: Json): boolean {
  return value === null || typeof value !== "object";
}

function render(value: Json, indent: number, used: number): string {
  const short = inline(value);
  if (isPrimitive(value) || indent + used + short.length <= WIDTH) return short;
  const pad = " ".repeat(indent + 2);
  const end = " ".repeat(indent);
  if (Array.isArray(value)) {
    const items = value as readonly Json[];
    if (items.every(isPrimitive)) {
      // Pack primitives into rows.
      const rows: string[] = [];
      let row = "";
      for (const item of items) {
        const text = JSON.stringify(item);
        if (row !== "" && pad.length + row.length + 2 + text.length + 1 > WIDTH) {
          rows.push(row);
          row = "";
        }
        row = row === "" ? text : `${row}, ${text}`;
      }
      if (row !== "") rows.push(row);
      return `[\n${rows.map((line) => pad + line).join(",\n")}\n${end}]`;
    }
    return `[\n${items.map((item) => pad + render(item, indent + 2, 1)).join(",\n")}\n${end}]`;
  }
  const entries = Object.entries(value as { readonly [key: string]: Json });
  const lines = entries.map(([key, item]) => {
    const name = `${JSON.stringify(key)}: `;
    return pad + name + render(item, indent + 2, name.length + 1);
  });
  return `{\n${lines.join(",\n")}\n${end}}`;
}

/** The text of a data file: formatted JSON with a final newline. */
export function stringifyData(value: unknown): string {
  // Round-trip first, so only plain JSON values are written.
  const plain = JSON.parse(JSON.stringify(value)) as Json;
  return `${render(plain, 0, 0)}\n`;
}
