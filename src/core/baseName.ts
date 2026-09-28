// The one home of "the file's display name" (implementation standards R6 — this
// used to be spelled per call site and the copies had already drifted). A
// trailing slash or an all-separator path falls back to the input itself, so
// the caller always has something to show.

/** The last non-empty path segment — `'/a/b/notes.txt'` → `'notes.txt'`. */
export function baseName(p: string): string {
  return p.split('/').filter(Boolean).pop() || p;
}
