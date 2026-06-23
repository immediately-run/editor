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
// External-change source: the Phase-02 `onFsChange` channel is not built yet
// (EDITOR_AS_APP_STATUS), so we detect external writes by re-reading the active
// file when the host's §4.2 `onFsChange` channel reports it changed. The detection
// is origin-safe by construction — our own writes advance the buffer `baseline`,
// so the §6 machine treats an echoed change (disk == buffer) as a no-op, never a
// foreign divergence.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMounts, onFsChange } from '@immediately-run/sdk';
import {
  openBuffer,
  applyEdit,
  applyExternalChange,
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
      tree
        .write(path, text)
        .then(() => {
          setSaveError(null);
          const cur = bufferRef.current;
          if (cur && cur.path === path && cur.buffer === text) setBuffer(markSaved(cur));
        })
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
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
  // Origin-exclusion: the host fans this out to ALL working-tree consumers
  // INCLUDING us, so a batch can be the echo of our OWN debounced write. We don't
  // filter by origin host-side; instead `applyExternalChange` is a no-op when the
  // disk bytes equal our buffer (the §6 machine re-baselines without a conflict),
  // so an echo never surfaces as a false external change.
  useEffect(() => {
    if (!activeFile) return;
    let stopped = false;
    const reread = async () => {
      const cur = bufferRef.current;
      if (!cur || cur.path !== activeFile) return;
      const tree = WorkingTree.current();
      try {
        const disk = await tree.read(activeFile);
        if (stopped) return;
        if (disk !== cur.baseline) setBuffer(applyExternalChange(bufferRef.current!, disk));
      } catch {
        if (stopped) return;
        // Distinguish a vanished file from a transient unreadable fs.
        const gone = !(await tree.exists(activeFile));
        if (!stopped && gone && bufferRef.current?.path === activeFile) {
          setBuffer(applyExternalDelete(bufferRef.current));
        }
      }
    };
    const unsubscribe = onFsChange((change) => {
      // epoch 0 is the empty initial (fires immediately on subscribe) — nothing to
      // re-read. Otherwise re-read iff the active file is in this batch.
      if (change.epoch === 0) return;
      if (change.paths.some((p) => samePath(p, activeFile))) void reread();
    });
    return () => {
      stopped = true;
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
