// Inline build/transpile errors for the active file (plan Phase 04 step 6).
//
// These ride the `diagnostics:read` channel (R3-74) via the SDK's `useDiagnostics`
// — but that surface is not in the published SDK yet (@immediately-run/sdk 0.11.0
// exports no `useDiagnostics`; it lives in unpublished SDK src). Until it publishes,
// this returns no errors. The plumbing downstream is complete and tested: the pure
// mapping (`core/diagnostics.ts`) turns these into CodeMirror marks, and
// `CodeMirrorView` already renders whatever it receives — so adopting the channel
// is a one-line swap:
//
//   import { useDiagnostics } from '@immediately-run/sdk';
//   export const useBuildErrors = (): SourceError[] => useDiagnostics().buildErrors;

import type { SourceError } from '../core/diagnostics';

const EMPTY: SourceError[] = [];

export function useBuildErrors(): SourceError[] {
  return EMPTY;
}
