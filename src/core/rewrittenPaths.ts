// Paths the sandbox rewrites on every mount (e.g. `package.json` gets its deps
// normalised) — native CP-3 (§6a#31c). A user edit to one would be accepted by
// CodeMirror then silently discarded on the next mount, so the editor renders
// them read-only and refuses input up front. Pure + tested so the policy is one
// auditable list, not scattered string checks.

const REWRITTEN_BASENAMES = new Set(['package.json']);

const baseName = (p: string) => p.split('/').filter(Boolean).pop() || p;

/** True ⟺ the working tree regenerates this path on mount (render it read-only). */
export function isRewrittenPath(repoRelative: string): boolean {
  return REWRITTEN_BASENAMES.has(baseName(repoRelative));
}
