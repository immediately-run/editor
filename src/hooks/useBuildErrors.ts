// Inline build/transpile errors for the active file (plan Phase 04 step 6).
//
// These ride the `diagnostics:read` channel (R3-74) — the host captures the
// PREVIEWED app's build/transpile errors and pushes them to a sibling holding
// `diagnostics:read` (the editor's binding grants it). The SDK's `useDiagnostics`
// surfaces them; the pure mapping (`core/diagnostics.ts`) turns each into a
// CodeMirror lint mark for the active file, and `CodeMirrorView` renders them —
// the successor to the native editor's `showInlineErrors`.
//
// Returns the empty snapshot until the host answers (or if the binding lacks
// `diagnostics:read`), so the editor degrades to "no inline errors" rather than
// throwing.

import { useDiagnostics } from '@immediately-run/sdk';
import type { SourceError } from '../core/diagnostics';

export function useBuildErrors(): SourceError[] {
  // `BuildError` (SDK) and `SourceError` (core) share the {message, path?, line?,
  // column?} shape, so the build errors map straight through.
  return useDiagnostics().buildErrors;
}
