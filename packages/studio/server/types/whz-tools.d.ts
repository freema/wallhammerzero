// The repo's own JavaScript tools, as the studio uses them. The tools are plain .mjs with JSDoc
// types; these declarations name the parts the studio imports (keep them equal to the JSDoc).

declare module "@whz/task-queue" {
  export interface QueueRow {
    readonly number: number;
    readonly title: string;
    readonly file: string;
    readonly gate: string;
    readonly dependsOn: string;
    readonly line: number;
  }
  export interface ParsedQueue {
    readonly rows: QueueRow[];
    readonly errors: string[];
    readonly warnings: string[];
    /** The 1-based line of the `queue:end` marker, or null without it. */
    readonly endMarkerLine: number | null;
    readonly lastNumber: number | null;
    /** The number a new row takes. */
    readonly nextNumber: number;
  }
  export const QUEUE_END_MARKER: string;
  export const QUEUE_LAST_NUMBER_MARKER: string;
  export function parseQueue(readme: string): ParsedQueue;
  export function parseNoteHeader(text: string): { gate: string | null; dependsOn: string | null; remaining: boolean };
  export function parseGate(text: string): { open: boolean; partial: string | null };
  export function slugOf(file: string): string;
}

declare module "@whz/docs-check/lib/index.mjs" {
  export interface Problem {
    readonly file: string;
    readonly line: number;
    readonly message: string;
    readonly rule: string;
  }
  export function checkDocs(root: string): { problems: Problem[]; stats: Record<string, number> };
  export function formatProblem(problem: Problem): string;
}
