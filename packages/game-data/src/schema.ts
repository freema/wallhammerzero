// The schema dialect of game data: a small, strict subset of JSON Schema (draft 2020-12), so a
// schema here is also a schema for any standard tool, plus three `x-` annotations of our own.
//
// What is different from plain JSON Schema, on purpose:
//   - there is no "number": every number is an `integer`, and it must declare `minimum` and
//     `maximum` (game data has no floats; fixed point and basis points instead);
//   - an integer must also be written as one (`3`, not `3.0` or `3e0`);
//   - an object must say what it does with other keys: `additionalProperties` is `false` or a
//     schema, never left out;
//   - a keyword this file does not know is an error when the schema is compiled, so a typo in
//     a schema never turns a rule off.
//
// The annotations:
//   - `x-ref` on a string: the value is an id that must resolve (see refs.ts);
//   - `x-text` on a string: display text (Unicode NFC, no control characters but a newline);
//   - `x-unique` on an array of objects: the named string field is unique among the items;
//   - `x-tag` beside `oneOf`: the field that says which variant an object is.

import { itemPath, memberOf, memberPath } from "./json.ts";
import type { JsonNode, ObjectNode } from "./json.ts";
import { parseRef } from "./refs.ts";

interface Described {
  readonly description?: string;
}

export interface ObjectSchema extends Described {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  /** `false`: no other keys. A schema: any other key (see `propertyNames`) with such a value. */
  readonly additionalProperties: false | Schema;
  /** What the other keys must look like. Only with an `additionalProperties` schema. */
  readonly propertyNames?: { readonly pattern: string; readonly maxLength?: number; readonly description?: string };
  readonly minProperties?: number;
}

export interface ArraySchema extends Described {
  readonly type: "array";
  readonly items: Schema;
  readonly minItems?: number;
  readonly maxItems?: number;
  /** For lists of strings or integers. */
  readonly uniqueItems?: boolean;
  /** For lists of objects: this string field is unique among the items (`"id"`). */
  readonly "x-unique"?: string;
}

export interface StringSchema extends Described {
  readonly type: "string";
  readonly pattern?: string;
  /** Lengths count code points. */
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly enum?: readonly string[];
  readonly const?: string;
  /** The value is an id that must resolve: `row:items`, `string`, `asset:sprite`, ... (refs.ts). */
  readonly "x-ref"?: string;
  /** The value is display text. */
  readonly "x-text"?: boolean;
}

export interface IntegerSchema extends Described {
  readonly type: "integer";
  readonly minimum: number;
  readonly maximum: number;
}

export interface BooleanSchema extends Described {
  readonly type: "boolean";
}

/** One of several object shapes, told apart by the constant in the `x-tag` field of each. */
export interface UnionSchema extends Described {
  readonly oneOf: readonly ObjectSchema[];
  readonly "x-tag": string;
}

/** A named schema of the same document: `{ "$ref": "#/$defs/node" }`. This is how a tree is written. */
export interface RefSchema {
  readonly $ref: string;
}

export type Schema = ObjectSchema | ArraySchema | StringSchema | IntegerSchema | BooleanSchema | UnionSchema | RefSchema;

/** A schema that is itself wrong. Thrown when it is compiled, never while data is checked. */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

/** Something in the data that the schema does not allow. */
export interface SchemaIssue {
  /** The JSON path of the value: `$.rows[2].price`. */
  readonly path: string;
  /** Its offset in the text. */
  readonly offset: number;
  readonly message: string;
}

/** A string the schema marks as an id that must resolve. */
export interface RefUse {
  /** The `x-ref` of the schema: `row:items`, `string`, `clip:sprite`, ... */
  readonly ref: string;
  readonly value: string;
  readonly path: string;
  readonly offset: number;
  /** The object the string is a field of, for refs that depend on a sibling field. */
  readonly parent: ObjectNode | null;
}

export interface SchemaCheck {
  readonly issues: SchemaIssue[];
  readonly refs: RefUse[];
}

/** A schema that passed `compileSchema`. */
export interface CompiledSchema {
  /** Its name in messages and in its `$id`: `game`, `locale`, `table/items`. */
  readonly name: string;
  readonly schema: Schema;
  readonly defs: Readonly<Record<string, Schema>>;
  /** Checks a parsed document. Never throws for bad data. */
  check(root: JsonNode): SchemaCheck;
  /** The schema as a standard JSON Schema document. */
  toJsonSchema(): Record<string, unknown>;
}

/** The `$schema` of the documents `toJsonSchema` gives. */
export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

const DEF_REF = /^#\/\$defs\/([A-Za-z][A-Za-z0-9]*)$/;
const INTEGER_TEXT = /^-?(?:0|[1-9][0-9]*)$/;

const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  object: ["type", "description", "properties", "required", "additionalProperties", "propertyNames", "minProperties"],
  array: ["type", "description", "items", "minItems", "maxItems", "uniqueItems", "x-unique"],
  string: ["type", "description", "pattern", "minLength", "maxLength", "enum", "const", "x-ref", "x-text"],
  integer: ["type", "description", "minimum", "maximum"],
  boolean: ["type", "description"],
  union: ["description", "oneOf", "x-tag"],
  ref: ["$ref"],
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const own = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

function kindOf(schema: unknown, where: string): string {
  if (!isRecord(schema)) throw new SchemaError(`${where}: a schema must be an object`);
  if (own(schema, "$ref")) return "ref";
  if (own(schema, "oneOf")) return "union";
  const type = schema["type"];
  if (type === "object" || type === "array" || type === "string" || type === "integer" || type === "boolean") return type;
  if (type === "number") {
    throw new SchemaError(`${where}: there is no "number" in game data; declare an "integer" with a minimum and a maximum (fixed point, basis points)`);
  }
  throw new SchemaError(`${where}: unknown type ${JSON.stringify(type)} (object, array, string, integer, boolean, or oneOf, or $ref)`);
}

function regex(pattern: unknown, where: string): RegExp {
  if (typeof pattern !== "string") throw new SchemaError(`${where}: the pattern must be a string`);
  try {
    return new RegExp(pattern, "u");
  } catch (error) {
    throw new SchemaError(`${where}: the pattern ${JSON.stringify(pattern)} is not a regular expression: ${(error as Error).message}`);
  }
}

/** Checks a schema and everything below it. `patterns` collects the compiled regular expressions. */
function verify(schema: Schema, where: string, defs: Readonly<Record<string, Schema>>, patterns: Map<string, RegExp>): void {
  const kind = kindOf(schema, where);
  const record = schema as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(KEYWORDS[kind] as readonly string[]).includes(key)) {
      throw new SchemaError(`${where}: unknown keyword ${JSON.stringify(key)} for ${kind === "union" ? "a oneOf" : kind === "ref" ? "a $ref" : `type "${kind}"`}`);
    }
  }
  if (own(record, "description") && typeof record["description"] !== "string") throw new SchemaError(`${where}: the description must be a string`);

  if (kind === "ref") {
    const match = DEF_REF.exec(String(record["$ref"]));
    if (match === null) throw new SchemaError(`${where}: $ref must look like "#/$defs/<name>", got ${JSON.stringify(record["$ref"])}`);
    if (!own(defs, match[1] as string)) throw new SchemaError(`${where}: $ref names ${JSON.stringify(match[1])}, which is not in $defs`);
    return;
  }

  if (kind === "integer") {
    const { minimum, maximum } = schema as IntegerSchema;
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      throw new SchemaError(`${where}: an integer must declare its bounds: "minimum" and "maximum", both safe integers`);
    }
    if (minimum > maximum) throw new SchemaError(`${where}: minimum ${minimum} is above maximum ${maximum}`);
    return;
  }

  if (kind === "boolean") return;

  if (kind === "string") {
    const text = schema as StringSchema;
    if (text.pattern !== undefined) patterns.set(text.pattern, regex(text.pattern, where));
    for (const name of ["minLength", "maxLength"] as const) {
      if (text[name] !== undefined && !isCount(text[name])) throw new SchemaError(`${where}: ${name} must be a non-negative integer`);
    }
    if (text.enum !== undefined && (!Array.isArray(text.enum) || text.enum.length === 0 || text.enum.some((item) => typeof item !== "string"))) {
      throw new SchemaError(`${where}: enum must be a non-empty list of strings`);
    }
    if (text.const !== undefined && typeof text.const !== "string") throw new SchemaError(`${where}: const must be a string`);
    if (text["x-text"] !== undefined && typeof text["x-text"] !== "boolean") throw new SchemaError(`${where}: x-text must be true or false`);
    if (text["x-ref"] !== undefined) {
      try {
        parseRef(text["x-ref"]);
      } catch (error) {
        throw new SchemaError(`${where}: ${(error as Error).message}`);
      }
    }
    return;
  }

  if (kind === "array") {
    const list = schema as ArraySchema;
    if (!own(record, "items")) throw new SchemaError(`${where}: an array must declare its "items"`);
    verify(list.items, `${where}.items`, defs, patterns);
    for (const name of ["minItems", "maxItems"] as const) {
      if (list[name] !== undefined && !isCount(list[name])) throw new SchemaError(`${where}: ${name} must be a non-negative integer`);
    }
    const itemKind = kindOf(list.items, `${where}.items`);
    if (list.uniqueItems !== undefined) {
      if (typeof list.uniqueItems !== "boolean") throw new SchemaError(`${where}: uniqueItems must be true or false`);
      if (list.uniqueItems && itemKind !== "string" && itemKind !== "integer") {
        throw new SchemaError(`${where}: uniqueItems is for lists of strings or integers; for objects use "x-unique" with the name of the id field`);
      }
    }
    const unique = list["x-unique"];
    if (unique !== undefined) {
      const items = list.items as ObjectSchema;
      const field = itemKind === "object" && typeof unique === "string" ? items.properties?.[unique] : undefined;
      if (field === undefined || kindOf(field, `${where}.items.properties.${String(unique)}`) !== "string" || !(items.required ?? []).includes(unique)) {
        throw new SchemaError(`${where}: x-unique must name a required string field of the items (an object schema), got ${JSON.stringify(unique)}`);
      }
    }
    return;
  }

  if (kind === "object") {
    const object = schema as ObjectSchema;
    const properties = object.properties ?? {};
    if (!isRecord(properties)) throw new SchemaError(`${where}: properties must be an object of schemas`);
    for (const key of Object.keys(properties)) verify(properties[key] as Schema, `${where}.properties${memberPath("", key)}`, defs, patterns);
    if (object.required !== undefined) {
      if (!Array.isArray(object.required)) throw new SchemaError(`${where}: required must be a list of field names`);
      for (const name of object.required) {
        if (typeof name !== "string" || !own(properties, name)) throw new SchemaError(`${where}: required names ${JSON.stringify(name)}, which is not in properties`);
      }
    }
    if (!own(record, "additionalProperties")) {
      throw new SchemaError(`${where}: an object must declare "additionalProperties": false (no other keys) or a schema for them`);
    }
    if (object.additionalProperties === false) {
      if (object.propertyNames !== undefined) throw new SchemaError(`${where}: propertyNames needs an additionalProperties schema`);
    } else {
      verify(object.additionalProperties, `${where}.additionalProperties`, defs, patterns);
      const names = object.propertyNames;
      if (names !== undefined) {
        if (!isRecord(names) || Object.keys(names).some((key) => !["pattern", "maxLength", "description"].includes(key))) {
          throw new SchemaError(`${where}.propertyNames: only "pattern", "maxLength" and "description" are supported`);
        }
        patterns.set(names.pattern, regex(names.pattern, `${where}.propertyNames`));
        if (names.maxLength !== undefined && !isCount(names.maxLength)) throw new SchemaError(`${where}.propertyNames: maxLength must be a non-negative integer`);
      }
    }
    if (object.minProperties !== undefined && !isCount(object.minProperties)) throw new SchemaError(`${where}: minProperties must be a non-negative integer`);
    return;
  }

  // A union: every variant is an object with a constant in the tag field.
  const union = schema as UnionSchema;
  const tag = union["x-tag"];
  if (typeof tag !== "string" || tag === "") throw new SchemaError(`${where}: a oneOf needs "x-tag", the field that tells the variants apart`);
  if (!Array.isArray(union.oneOf) || union.oneOf.length === 0) throw new SchemaError(`${where}: oneOf must be a non-empty list of object schemas`);
  const seen = new Set<string>();
  union.oneOf.forEach((variant, index) => {
    const at = `${where}.oneOf[${index}]`;
    if (kindOf(variant, at) !== "object") throw new SchemaError(`${at}: a variant must be an object schema`);
    verify(variant, at, defs, patterns);
    const marker = variant.properties?.[tag] as StringSchema | undefined;
    if (marker === undefined || kindOf(marker, at) !== "string" || marker.const === undefined || !(variant.required ?? []).includes(tag)) {
      throw new SchemaError(`${at}: a variant needs the required field ${JSON.stringify(tag)} with a "const"`);
    }
    if (seen.has(marker.const)) throw new SchemaError(`${at}: the ${tag} ${JSON.stringify(marker.const)} is used by two variants`);
    seen.add(marker.const);
  });
}

function describe(node: JsonNode): string {
  if (node.kind === "object") return "an object";
  if (node.kind === "array") return "an array";
  if (node.kind === "null") return "null";
  if (node.kind === "number") return `the number ${node.raw}`;
  if (node.kind === "boolean") return String(node.value);
  const text = node.value.length > 40 ? `${node.value.slice(0, 40)}…` : node.value;
  return `the string ${JSON.stringify(text)}`;
}

const codePoints = (text: string): number => {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if ((text.codePointAt(i) as number) > 0xffff) i += 1;
    count += 1;
  }
  return count;
};

function textProblem(value: string): string | null {
  if (value.normalize("NFC") !== value) return "the text is not in Unicode normal form NFC (an accent is stored apart from its letter)";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)) {
      return `the text holds the control character U+${code.toString(16).padStart(4, "0").toUpperCase()} (only a newline is allowed)`;
    }
  }
  return null;
}

/**
 * Checks a schema and returns it ready to use. Throws a `SchemaError` if the schema is wrong:
 * an integer without bounds, an object without `additionalProperties`, an unknown keyword, a
 * bad pattern, a bad `x-ref`, a `$ref` that is not in `defs`.
 */
export function compileSchema(name: string, schema: Schema, defs: Readonly<Record<string, Schema>> = {}): CompiledSchema {
  const patterns = new Map<string, RegExp>();
  for (const key of Object.keys(defs)) verify(defs[key] as Schema, `schema ${name}: $defs.${key}`, defs, patterns);
  verify(schema, `schema ${name}: $`, defs, patterns);

  const walk = (node: JsonNode, at: Schema, path: string, parent: ObjectNode | null, out: SchemaCheck): void => {
    const issue = (message: string, offset = node.offset, where = path): void => {
      out.issues.push({ path: where, offset, message });
    };

    if ("$ref" in at) {
      walk(node, defs[(DEF_REF.exec(at.$ref) as RegExpExecArray)[1] as string] as Schema, path, parent, out);
      return;
    }

    if ("oneOf" in at) {
      const tag = at["x-tag"];
      if (node.kind !== "object") {
        issue(`expected an object with a ${JSON.stringify(tag)} field, found ${describe(node)}`);
        return;
      }
      const marker = memberOf(node, tag);
      const known = at.oneOf.map((variant) => (variant.properties?.[tag] as StringSchema).const as string);
      if (marker === undefined) {
        issue(`the field ${JSON.stringify(tag)} is missing (one of: ${known.join(", ")})`);
        return;
      }
      const index = marker.value.kind === "string" ? known.indexOf(marker.value.value) : -1;
      if (index < 0) {
        issue(`unknown ${tag} ${describe(marker.value).replace(/^the string /, "")} (one of: ${known.join(", ")})`, marker.value.offset, memberPath(path, tag));
        return;
      }
      walk(node, at.oneOf[index] as ObjectSchema, path, parent, out);
      return;
    }

    if (at.type === "integer") {
      const declared = `an integer from ${at.minimum} to ${at.maximum} is declared`;
      if (node.kind !== "number") issue(`expected an integer, found ${describe(node)} (${declared})`);
      else if (!INTEGER_TEXT.test(node.raw) || node.raw === "-0") {
        issue(`${node.raw} is not an integer: ${declared}, written without a fraction or an exponent`);
      } else if (!Number.isSafeInteger(node.value)) issue(`${node.raw} is too large for an integer (${declared})`);
      else if (node.value < at.minimum || node.value > at.maximum) issue(`${node.raw} is outside ${at.minimum}..${at.maximum} (${declared})`);
      return;
    }

    if (at.type === "boolean") {
      if (node.kind !== "boolean") issue(`expected true or false, found ${describe(node)}`);
      return;
    }

    if (at.type === "string") {
      if (node.kind !== "string") {
        issue(`expected a string, found ${describe(node)}`);
        return;
      }
      const { value } = node;
      const before = out.issues.length;
      const what = at.description === undefined ? "" : ` (${at.description})`;
      if (at.const !== undefined && value !== at.const) issue(`must be ${JSON.stringify(at.const)}, found ${JSON.stringify(value)}`);
      if (at.enum !== undefined && !at.enum.includes(value)) issue(`${JSON.stringify(value)} is not one of: ${at.enum.join(", ")}`);
      const length = codePoints(value);
      if (at.minLength !== undefined && length < at.minLength) {
        issue(value === "" ? `the string is empty${what}` : `${JSON.stringify(value)} is shorter than ${at.minLength} characters${what}`);
      } else if (at.maxLength !== undefined && length > at.maxLength) issue(`the string is longer than ${at.maxLength} characters${what}`);
      else if (at.pattern !== undefined && !(patterns.get(at.pattern) as RegExp).test(value)) {
        issue(`${JSON.stringify(value)} does not match ${at.pattern}${what}`);
      }
      if (at["x-text"] === true) {
        const problem = textProblem(value);
        if (problem !== null) issue(problem);
      }
      if (at["x-ref"] !== undefined && out.issues.length === before) {
        out.refs.push({ ref: at["x-ref"], value, path, offset: node.offset, parent });
      }
      return;
    }

    if (at.type === "array") {
      if (node.kind !== "array") {
        issue(`expected an array, found ${describe(node)}`);
        return;
      }
      if (at.minItems !== undefined && node.items.length < at.minItems) issue(`${node.items.length} items, at least ${at.minItems} are needed`);
      if (at.maxItems !== undefined && node.items.length > at.maxItems) issue(`${node.items.length} items, at most ${at.maxItems} are allowed`);
      const first = new Map<string, number>();
      const unique = at["x-unique"];
      node.items.forEach((item, index) => {
        const where = itemPath(path, index);
        walk(item, at.items, where, null, out);
        if (at.uniqueItems === true && (item.kind === "string" || item.kind === "number")) {
          const key = `${item.kind}:${String(item.value)}`;
          const earlier = first.get(key);
          if (earlier === undefined) first.set(key, index);
          else issue(`${describe(item).replace(/^the (string|number) /, "")} is listed twice (first in ${itemPath(path, earlier)})`, item.offset, where);
        }
        if (unique !== undefined && item.kind === "object") {
          const field = memberOf(item, unique);
          if (field !== undefined && field.value.kind === "string") {
            const earlier = first.get(field.value.value);
            if (earlier === undefined) first.set(field.value.value, index);
            else {
              issue(
                `the ${unique} ${JSON.stringify(field.value.value)} is used twice (first in ${itemPath(path, earlier)})`,
                field.value.offset,
                memberPath(where, unique),
              );
            }
          }
        }
      });
      return;
    }

    // An object.
    if (node.kind !== "object") {
      issue(`expected an object, found ${describe(node)}`);
      return;
    }
    const properties = at.properties ?? {};
    for (const member of node.members) {
      const where = memberPath(path, member.key);
      if (own(properties, member.key)) {
        walk(member.value, properties[member.key] as Schema, where, node, out);
      } else if (at.additionalProperties === false) {
        const known = Object.keys(properties);
        issue(`unknown field ${JSON.stringify(member.key)} (known: ${known.length === 0 ? "none" : known.join(", ")})`, member.keyOffset, where);
      } else {
        const names = at.propertyNames;
        if (names !== undefined) {
          const what = names.description === undefined ? "" : ` (${names.description})`;
          if (names.maxLength !== undefined && codePoints(member.key) > names.maxLength) {
            issue(`the key is longer than ${names.maxLength} characters${what}`, member.keyOffset, where);
          } else if (!(patterns.get(names.pattern) as RegExp).test(member.key)) {
            issue(`the key ${JSON.stringify(member.key)} does not match ${names.pattern}${what}`, member.keyOffset, where);
          }
        }
        walk(member.value, at.additionalProperties, where, node, out);
      }
    }
    for (const name of at.required ?? []) {
      if (memberOf(node, name) === undefined) issue(`the field ${JSON.stringify(name)} is missing`);
    }
    if (at.minProperties !== undefined && node.members.length < at.minProperties) {
      issue(`${node.members.length} fields, at least ${at.minProperties} are needed`);
    }
  };

  return {
    name,
    schema,
    defs,
    check(root) {
      const out: SchemaCheck = { issues: [], refs: [] };
      walk(root, schema, "$", null, out);
      return out;
    },
    toJsonSchema() {
      return {
        $schema: JSON_SCHEMA_DIALECT,
        $id: `wz:game-data/${name}`,
        ...(schema as unknown as Record<string, unknown>),
        ...(Object.keys(defs).length === 0 ? {} : { $defs: defs }),
      };
    },
  };
}
