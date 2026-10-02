// JSON for build outputs (atlas.json, lint.json): stable and readable. A value that fits one
// line is written on one line; anything longer is broken up one level. A table (a list of flat
// records, like the frames of an atlas) is always one row per record, however long the row
// is, so a diff of two reports lines up. The same value always gives the same text.

function inline(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "[]" : `[${value.map(inline).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return entries.length === 0 ? "{}" : `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(", ")} }`;
  }
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error(`formatJson: ${String(value)} cannot be written as JSON`);
  return text;
}

const isPlain = (value: unknown): boolean => typeof value !== "object" || value === null;

/** A flat record: an object whose values are plain values or lists of plain values. */
function isRow(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((item) => isPlain(item) || (Array.isArray(item) && item.every(isPlain)));
}

function write(value: unknown, indent: string, room: number, width: number): string {
  const flat = inline(value);
  if (flat.length <= room || typeof value !== "object" || value === null) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items = value.map((item) => `${inner}${isRow(item) ? inline(item) : write(item, inner, width - inner.length - 1, width)}`);
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  const lines = entries.map(([key, item]) => {
    const head = `${inner}${JSON.stringify(key)}: `;
    return `${head}${write(item, inner, width - head.length - 1, width)}`;
  });
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

/**
 * `value` as JSON text that ends with a newline. The top level is one field per line; below
 * it, a value is written on one line when it fits `width` characters.
 */
export function formatJson(value: unknown, width = 220): string {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    const lines = entries.map(([key, item]) => {
      const head = `  ${JSON.stringify(key)}: `;
      return `${head}${write(item, "  ", width - head.length - 1, width)}`;
    });
    return `{\n${lines.join(",\n")}\n}\n`;
  }
  return `${write(value, "", width, width)}\n`;
}
