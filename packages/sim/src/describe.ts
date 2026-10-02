// The state as text, for agents: reading numbers is more reliable than reading screenshots.

import { SimError } from "./errors.ts";
import type { Row, Value } from "./fields.ts";
import type { DescribeOptions, Sim } from "./kernel.ts";
import { sortedKeys } from "./order.ts";

function cell(value: Value): string {
  return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
}

/**
 * The state as compact text: one header line, then every table. A one-row table is one line
 * of `field=value`; the others are a line of column names and one line per row.
 */
export function describeSim(sim: Sim, options: DescribeOptions = {}): string {
  const maxRows = options.maxRows ?? 40;
  if (!Number.isSafeInteger(maxRows) || maxRows < 0) throw new SimError(`describe: maxRows must be a non-negative integer, got ${String(maxRows)}`);
  const lines = [
    `sim tick ${sim.tick} seed ${sim.seed} data ${sim.simDataHash} digest ${sim.digestHex()}`,
    `systems: ${sim.systems.join(" ")}`,
  ];
  for (const table of sim.tables()) {
    const rows = sim.read(table.name);
    if (table.shape === "one") {
      const row = rows[0] as Row;
      lines.push(`${table.name}: ${table.fields.map((name) => `${name}=${cell(row[name] as Value)}`).join(" ")}`);
      continue;
    }
    const key = table.shape === "entities" ? "id" : "key";
    const columns = [key, ...table.fields];
    lines.push(`${table.name} (${rows.length} by ${key}): ${columns.join(" ")}`);
    for (const row of rows.slice(0, maxRows)) {
      lines.push(`  ${columns.map((name) => cell(row[name] as Value)).join(" ")}`);
    }
    if (rows.length > maxRows) lines.push(`  ... ${rows.length - maxRows} more`);
  }
  const pending = sim.pending();
  if (pending.length > 0) {
    lines.push(`pending commands (${pending.length}): tick seq type payload`);
    for (const command of pending.slice(0, maxRows)) {
      const payload = sortedKeys(command.payload).map((name) => `${name}=${cell(command.payload[name] as Value)}`);
      lines.push(`  ${command.tick} ${command.seq} ${command.type} ${payload.join(" ")}`.trimEnd());
    }
    if (pending.length > maxRows) lines.push(`  ... ${pending.length - maxRows} more`);
  }
  return `${lines.join("\n")}\n`;
}
