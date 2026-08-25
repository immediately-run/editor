/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect --
   This hook is the editor's imperative write/conflict engine. It (a) holds the
   latest buffer in a ref so the debounced-write and change-poll closures read the
   current value (the React-sanctioned "latest value in an async callback" pattern),
   and (b) synchronises React state from two genuinely-external systems — the
   working-tree port read and the change poll — inside effects. Neither fits the
   "derive during render" model the react-hooks compiler rules assume; the rest of
   the app keeps those rules on. */
// Orchestrates one active file: read it through the rw working-tree port into the
// pure buffer state machine (`core/buffer.ts`), debounce writes back to the port,
// and fold external changes into the §6 conflict surface. The React glue lives
// here; the decision logic (when to conflict / block / resurrect) is in the
// unit-tested pure core.
//
// External-change source: we detect external writes by re-reading the active file
// when the host's §4.2 `onFsChange` channel reports it changed. The host fans that
// stream out to ALL working-tree consumers INCLUDING us, so a batch can be the
// echo of our own debounced write; the exclusion is consumer-side (the host does
// not tag ports).
//
// That exclusion used to be "disk == buffer ⇒ it was mine", which is not sound.
// The user keeps typing while a write is in flight, so the echo of write N
// legitimately differs from the buffer by keystroke N+1 — and the §6 machine,
// unable to see an origin, called that a foreign divergence and raised a BLOCKING
// conflict against nobody. So the exclusion is now identity-based: remember the
// exact bytes we last sent and the fact that a write is in flight, and recognise
// our own echo by those. Buffer equality remains as the innermost fallback inside
// `applyExternalChange`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMounts, onFsChange } from '@immediately-run/sdk';
import {
  openBuffer,
  applyEdit,
  applyExternalChange,
  applyOwnWriteEcho,
  applyExternalDelete,
  resolveKeepMine as keepMine,
  resolveTakeTheirs as takeTheirs,
  markSaved,
  canSave as canSaveOf,
  type FileBuffer,
} from '../core/buffer';
import { debounce, type Debounced } from '../core/debounce';
import { WorkingTree, isWritable } from '../fs/workingTree';

/** Compare two repo-relative paths tolerant of a leading-slash mismatch (the host
 *  pushes `/src/App.tsx`; the active file is also leading-slash, but be defensive). */
const samePath = (a: string, b: string): boolean =>
  a.replace(/^\/+/, '') === b.replace(/^\/+/, '');

export interface UseFileBuffer {
  buffer: FileBuffer | null;
  loadError: string | null;
  saveError: string | null;
  writable: boolean;
  portReady: boolean;
  setText: (next: string) => void;
  resolveKeepMine: () => void;
  resolveTakeTheirs: () => void;
  /** Flush any pending debounced write now (teardown / file switch, §12.5). */
  flush: () => void;
}

export function useFileBuffer(activeFile: string | null): UseFileBuffer {
  const mounts = useMounts();
  const writable = isWritable(mounts);

  const [buffer, setBufferState] = useState<FileBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [portReady, setPortReady] = useState(false);

  // Refs mirror the latest state for the debounced-write and poll closures.
  const bufferRef = useRef<FileBuffer | null>(null);
  const writeRef = useRef<Debounced<[string, string]> | null>(null);

  // ── Origin exclusion state (see the header note) ───────────────────────────
  /** The exact bytes of our most recent write, and where they went. An fs-change
   *  whose disk content equals this is our own echo, whatever the buffer now holds. */
  const lastWriteRef = useRef<{ path: string; text: string } | null>(null);
  /** Writes we have issued and not yet seen settle, per path. While one is open,
   *  re-reading the path is pointless at best: the announcement can only be our
   *  own, and a read racing an in-flight write is not guaranteed to be whole. */
  const inFlightRef = useRef(new Map<string, number>());
  /** An fs-change we deferred because our own write was open. Drained when it settles. */
  const deferredRereadRef = useRef(false);
  /** Re-read generation. Re-reads overlap (a batch can announce while an earlier
   *  read is still resolving) and there is no ordering guarantee on when they come
   *  back — so an OLDER read can resolve last and fold yesterday's bytes into the
   *  buffer. That is what threw the cursor to the top of the file: a stale
   *  clean-adopt replaced the whole CodeMirror document, and a whole-document
   *  replace maps every position to 0. Only the newest read is applied. */
  const readSeqRef = useRef(0);
  /** Set by the fs-change effect so the write-settle path can drain the deferral. */
  const rereadRef = useRef<(() => void) | null>(null);

  const endWrite = useCallback((path: string) => {
    const open = (inFlightRef.current.get(path) ?? 1) - 1;
    if (open > 0) inFlightRef.current.set(path, open);
    else inFlightRef.current.delete(path);
    if (open > 0 || !deferredRereadRef.current) return;
    deferredRereadRef.current = false;
    rereadRef.current?.();
  }, []);

  const setBuffer = useCallback((next: FileBuffer | null) => {
    bufferRef.current = next;
    setBufferState(next);
  }, []);

  // The debounced port write — created once. Writes `text` to `path`; on success
  // re-baselines (markSaved) iff the buffer is unchanged since, on failure
  // surfaces the error and leaves the buffer dirty (the user keeps their edit).
  if (!writeRef.current) {
    writeRef.current = debounce<[string, string]>((path, text) => {
      const tree = WorkingTree.current();
      // Record what we are about to send BEFORE awaiting: the host's fs-change
      // announcement can reach us before our own write promise resolves, and the
      // echo has to be recognisable as ours at that moment.
      lastWriteRef.current = { path, text };
      inFlightRef.current.set(path, (inFlightRef.current.get(path) ?? 0) + 1);
      tree
        .write(path, text)
        .then(() => {
          setSaveError(null);
          const cur = bufferRef.current;
          if (cur && cur.path === path && cur.buffer === text) setBuffer(markSaved(cur));
        })
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)))
        .finally(() => endWrite(path));
    });
  }

  // Track port readiness independently of the active file: the working-tree mount
  // can attach before OR after the first session push (§12.7 race), and a poll is
  // needed because the sandbox globals appear after boot, not via a React input.
  useEffect(() => {
    if (portReady) return;
    const check = () => {
      if (WorkingTree.current().ready) setPortReady(true);
    };
    check();
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, [portReady]);

  // Load the active file when it changes. Flush a pending write for the old file
  // first so the user's last edit is never dropped at the switch (§12.5).
  useEffect(() => {
    writeRef.current?.flush();
    setLoadError(null);
    setSaveError(null);
    if (!activeFile) {
      setBuffer(null);
      return;
    }
    let cancelled = false;
    const tree = WorkingTree.current();
    setPortReady(tree.ready);
    tree
      .read(activeFile)
      .then((content) => {
        if (cancelled) return;
        setPortReady(true);
        setBuffer(openBuffer(activeFile, content));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPortReady(tree.ready);
        // Port not up yet vs a genuine read failure: the readiness gate (App)
        // shows "awaiting port" for the former; surface the latter.
        setLoadError(e instanceof Error ? e.message : String(e));
        setBuffer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFile, setBuffer]);

  // React to external changes via the §4.2 `onFsChange` channel: when the active
  // file appears in a change batch, re-read it and fold the result through the
  // buffer machine (clean → silent adopt, dirty → blocking conflict; a read failure
  // on a previously-present file means it vanished, §12.4). This replaces the
  // earlier re-read poll — the host now pushes the changed paths, so we re-read
  // exactly the active file exactly when it changes, not on a timer.
  //
  // Origin exclusion (see the header note): a batch can be the echo of our OWN
  // debounced write, and neither the host nor the stream tags it as ours — so we
  // recognise it here, by the bytes we sent and by whether a write of ours is
  // still open.
  useEffect(() => {
    if (!activeFile) return;
    let stopped = false;
    const reread = async () => {
      const cur = bufferRef.current;
      if (!cur || cur.path !== activeFile) return;
      // Our own write is still open: this announcement can only be that write, and
      // reading now would race it. Reconcile once it settles.
      if ((inFlightRef.current.get(activeFile) ?? 0) > 0) {
        deferredRereadRef.current = true;
        return;
      }
      const tree = WorkingTree.current();
      const seq = ++readSeqRef.current;
      try {
        const disk = await tree.read(activeFile);
        // A newer re-read overtook us: its bytes are the truth, ours are history.
        if (stopped || seq !== readSeqRef.current) return;
        // Re-read the LIVE buffer, not the pre-await snapshot: a write of ours may
        // have re-baselined it while this read was out.
        const now = bufferRef.current;
        if (!now || now.path !== activeFile || disk === now.baseline) return;
        const ours = lastWriteRef.current;
        if (ours && samePath(ours.path, activeFile) && disk === ours.text) {
          // Exactly the bytes we last sent — our echo, never a foreign change,
          // even if the user has typed since.
          setBuffer(applyOwnWriteEcho(now, disk));
          return;
        }
        setBuffer(applyExternalChange(now, disk));
      } catch {
        if (stopped || seq !== readSeqRef.current) return;
        // Distinguish a vanished file from a transient unreadable fs.
        const gone = !(await tree.exists(activeFile));
        if (!stopped && gone && bufferRef.current?.path === activeFile) {
          setBuffer(applyExternalDelete(bufferRef.current));
        }
      }
    };
    // The write-settle path drains a deferral through this.
    rereadRef.current = () => void reread();
    const unsubscribe = onFsChange((change) => {
      // epoch 0 is the empty initial (fires immediately on subscribe) — nothing to
      // re-read. Otherwise re-read iff the active file is in this batch.
      if (change.epoch === 0) return;
      if (change.paths.some((p) => samePath(p, activeFile))) void reread();
    });
    return () => {
      stopped = true;
      rereadRef.current = null;
      // A deferral belongs to the file we are leaving; the load effect re-reads
      // the new one from scratch.
      deferredRereadRef.current = false;
      unsubscribe();
    };
  }, [activeFile, setBuffer]);

  // Flush the pending write on unmount so a debounced edit isn't lost on a
  // branch-switch remount / revocation (§12.5).
  useEffect(() => {
    const w = writeRef.current;
    return () => w?.flush();
  }, []);

  const setText = useCallback(
    (next: string) => {
      const cur = bufferRef.current;
      if (!cur) return;
      const updated = applyEdit(cur, next);
      setBuffer(updated);
      // Only schedule a write when a save is actually permitted (not while
      // blocked by a conflict or vanished file — §6 / §12.4).
      if (canSaveOf(updated) && writable) writeRef.current?.(updated.path, updated.buffer);
      else writeRef.current?.cancel();
    },
    [setBuffer, writable],
  );

  const resolveKeepMine = useCallback(() => {
    const cur = bufferRef.current;
    if (!cur) return;
    const updated = keepMine(cur);
    setBuffer(updated);
    if (canSaveOf(updated) && writable) writeRef.current?.(updated.path, updated.buffer);
  }, [setBuffer, writable]);

  const resolveTakeTheirs = useCallback(() => {
    const cur = bufferRef.current;
    if (!cur) return;
    setBuffer(takeTheirs(cur));
  }, [setBuffer]);

  const flush = useCallback(() => writeRef.current?.flush(), []);

  return {
    buffer,
    loadError,
    saveError,
    writable,
    portReady,
    setText,
    resolveKeepMine,
    resolveTakeTheirs,
    flush,
  };
}
