// Map host build/transpile errors (the `diagnostics:read` channel, SDK
// `useDiagnostics`) to CodeMirror lint diagnostics for the ACTIVE file — the
// successor to the native editor's `showInlineErrors` (plan Phase 04 step 6).
//
// Pure: takes the raw errors + the document text and returns offset-resolved
// marks. The React surface feeds the result into CodeMirror's `setDiagnostics`.
// Only errors located in the active file are shown (provenance is enforced
// host-side; this is a client-side path filter, never a trust boundary).

/** Mirrors the relevant fields of the SDK's `BuildError` without importing it, so
 *  the core stays dependency-free and trivially testable. */
export interface SourceError {
  message: string;
  /** Repo-relative path (leading slash) when file-located. */
  path?: string;
  /** 1-based line. */
  line?: number;
  /** 1-based column. */
  column?: number;
}

export interface CodeMirrorMark {
  from: number;
  to: number;
  severity: 'error';
  message: string;
}

/** Normalise a path for comparison: ensure a single leading slash, strip a
 *  trailing one. Tolerates the host sending `src/a.ts` vs `/src/a.ts`. */
export function normalizePath(p: string): string {
  const withLead = p.startsWith('/') ? p : `/${p}`;
  return withLead.length > 1 ? withLead.replace(/\/+$/, '') : withLead;
}

/** Offset (0-based) of the start of 1-based `line` in `text`, clamped in range. */
function lineStartOffset(text: string, line: number): number {
  if (line <= 1) return 0;
  let offset = 0;
  let seen = 1;
  while (seen < line) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) return text.length; // past the end → clamp
    offset = nl + 1;
    seen++;
  }
  return offset;
}

/** Offset of the end of the line that starts at `lineStart`. */
function lineEndOffset(text: string, lineStart: number): number {
  const nl = text.indexOf('\n', lineStart);
  return nl === -1 ? text.length : nl;
}

/**
 * Resolve the build errors that belong to `activePath` into CodeMirror marks
 * against `text`. An error with a `line`/`column` marks from that column to the
 * end of the line; a file-level error (no line) marks the whole first line. Errors
 * for other files are dropped.
 */
export function toCodeMirrorMarks(
  errors: SourceError[],
  activePath: string,
  text: string,
): CodeMirrorMark[] {
  const active = normalizePath(activePath);
  const marks: CodeMirrorMark[] = [];
  for (const e of errors) {
    if (e.path && normalizePath(e.path) !== active) continue;
    const lineStart = lineStartOffset(text, e.line ?? 1);
    const lineEnd = lineEndOffset(text, lineStart);
    const col = e.column && e.column > 0 ? e.column - 1 : 0;
    const from = Math.min(lineStart + col, lineEnd);
    marks.push({ from, to: lineEnd, severity: 'error', message: e.message });
  }
  return marks;
}
