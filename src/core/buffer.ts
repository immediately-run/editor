// The per-file editor buffer state machine — the security-critical core of the
// editor app (EDITOR_AS_APP_SPEC §6, plan Phase 04 step 4). Pure and exhaustively
// unit-tested; the React surface (CodeMirror, the working-tree port) only drives
// these transitions and renders the result.
//
// The editor anchors a *save to GitHub*. So the load-bearing invariant is: an
// external write to a file the user is editing must NEVER silently substitute
// bytes into the about-to-be-saved buffer. A dirty buffer that receives an
// external change enters a BLOCKING conflict and save is refused until the user
// resolves it; the user's keystrokes are never touched. (Spec §6 / threat M6.)

/** A file the editor has open. `baseline` is the working-tree content as the app
 *  last observed it (the bytes a save would currently be based on); `buffer` is
 *  what the user is editing. `dirty` ⟺ the two differ. */
export interface FileBuffer {
  path: string;
  /** Working-tree content as last read/written by this app. */
  baseline: string;
  /** Current editor content (the user's live keystrokes). */
  buffer: string;
  /** A pending external change to this file that arrived while the buffer was
   *  dirty — the bytes another writer put on disk. Non-null ⟺ blocking conflict. */
  conflict: { theirs: string } | null;
  /** The file was deleted/renamed out from under the open buffer (spec §12.4). */
  vanished: boolean;
}

/** Open `path` with freshly-read working-tree `content` (a clean buffer). */
export function openBuffer(path: string, content: string): FileBuffer {
  return { path, baseline: content, buffer: content, conflict: null, vanished: false };
}

/** True ⟺ the buffer differs from the working-tree baseline (unsaved edits). */
export function isDirty(b: FileBuffer): boolean {
  return b.buffer !== b.baseline;
}

/**
 * Whether a save (debounced write to the rw port) is currently permitted. Save is
 * BLOCKED while a conflict is unresolved or the file vanished — writing then would
 * either clobber an external change the user hasn't seen, or resurrect a deleted
 * file (spec §6 / §12.4). A clean buffer has nothing to save.
 */
export function canSave(b: FileBuffer): boolean {
  return isDirty(b) && b.conflict === null && !b.vanished;
}

/** The user typed: replace the buffer. Never touches `baseline`/`conflict` — a
 *  conflict, once raised, stays until explicitly resolved. */
export function applyEdit(b: FileBuffer, next: string): FileBuffer {
  return { ...b, buffer: next };
}

/**
 * An external write to this file landed (delivered by the host's fs-change
 * fan-out; this app is origin-excluded from its own writes — Phase 01). Behaviour
 * per spec §6:
 *   - clean buffer  → adopt silently (re-read replaces the buffer).
 *   - dirty buffer  → do NOT modify the buffer; raise a blocking conflict.
 * A file that had vanished and is now re-created clears the vanished flag and is
 * treated as the external content arriving.
 */
export function applyExternalChange(b: FileBuffer, theirs: string): FileBuffer {
  if (isDirty(b) && !b.vanished) {
    // Dirty: keep the user's keystrokes untouched; surface the conflict. If the
    // incoming bytes equal what the user already typed, there is nothing to
    // resolve — just re-baseline (now clean).
    if (theirs === b.buffer) {
      return { ...b, baseline: theirs, conflict: null };
    }
    return { ...b, conflict: { theirs } };
  }
  // Clean (or previously vanished): adopt the new content as the new baseline.
  return { path: b.path, baseline: theirs, buffer: theirs, conflict: null, vanished: false };
}

/** The active/open file was deleted or renamed externally (spec §12.4). Mark it
 *  vanished; the app shows a placeholder and must NOT write the path back (which
 *  would resurrect the file). The user's buffer is preserved in case they want to
 *  copy it out, but save stays blocked. */
export function applyExternalDelete(b: FileBuffer): FileBuffer {
  return { ...b, vanished: true, conflict: null };
}

/** Resolve a conflict by keeping the user's version. The external bytes become the
 *  new baseline (so the buffer is still dirty and a save will overwrite them with
 *  the user's content), and the block lifts. */
export function resolveKeepMine(b: FileBuffer): FileBuffer {
  if (!b.conflict) return b;
  return { ...b, baseline: b.conflict.theirs, conflict: null };
}

/** Resolve a conflict by taking the external version. The buffer is replaced with
 *  their bytes (the user's edits are discarded) and the buffer becomes clean. */
export function resolveTakeTheirs(b: FileBuffer): FileBuffer {
  if (!b.conflict) return b;
  const theirs = b.conflict.theirs;
  return { ...b, baseline: theirs, buffer: theirs, conflict: null };
}

/** A debounced write of the current buffer committed to the working tree: the
 *  buffer is now the baseline (clean). Only valid when {@link canSave} held. */
export function markSaved(b: FileBuffer): FileBuffer {
  return { ...b, baseline: b.buffer };
}
