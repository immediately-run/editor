// Initial-load readiness (EDITOR_AS_APP_SPEC §12.7, plan Phase 04 step 2).
//
// The app needs TWO independent, unordered inputs before it can read a file:
//   1. the working-tree mount port (arrives via `mount-add`), and
//   2. an `activeFile` (arrives via the editor-session channel).
// Neither precedes the other reliably, so the app must render an explicit state
// rather than assume an order or crash on a missing port. This pure resolver maps
// the two inputs to a single render state.

export type EditorPhase =
  /** The mount port has not arrived yet — nothing to read through. */
  | 'awaiting-port'
  /** Port is ready but no file is focused yet — "no active file". */
  | 'no-active-file'
  /** Both present — load/show the active file. */
  | 'ready';

export interface ReadinessInputs {
  /** Has the working-tree mount port been resolved? */
  portReady: boolean;
  /** The focused file (repo-relative) or null. */
  activeFile: string | null;
}

export function resolvePhase({ portReady, activeFile }: ReadinessInputs): EditorPhase {
  if (!portReady) return 'awaiting-port';
  if (!activeFile) return 'no-active-file';
  return 'ready';
}
