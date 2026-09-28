/* eslint-disable react-hooks/set-state-in-effect --
   This hook synchronises React state from two genuinely-external systems — the
   working-tree byte read and the host's fs-change stream — inside an effect,
   exactly like useFileBuffer. Neither fits the "derive during render" model. */
// R3-804 — the image counterpart of `useFileBuffer`. When the active file is a
// recognised raster image (`core/imageFile.ts`), read its BYTES through the
// working-tree port and hand the view an object URL; the §6 text state machine
// does not apply (an image is never dirty and never conflicts). The overlay
// this feeds covers the still-mounted CodeMirror view, so the text→image→text
// round trip costs no editor teardown.
//
// Lifecycle: the object URL is revoked when the file changes, when a re-read
// replaces it, and on unmount — the bound is one URL per shown image (R17).
// External changes ride the §4.2 `onFsChange` channel like the text path: a
// batch naming the active path triggers a re-read; a read failure on a file
// that no longer exists is the §12.4 vanished case, otherwise an honest error.

import { useEffect, useState } from 'react';
import { onFsChange } from '@immediately-run/sdk';
import { imageMimeForPath } from '../core/imageFile';
import { samePath } from './useFileBuffer';
import { WorkingTree } from '../fs/workingTree';

export type ImagePreview =
  /** The active file is not a recognised image (or there is none) — the text
   *  path owns the pane. */
  | { state: 'idle' }
  | { state: 'loading'; path: string }
  | { state: 'ready'; path: string; url: string; mime: string }
  /** The read failed but the file still exists. */
  | { state: 'error'; path: string; message: string }
  /** The image was deleted/renamed out from under the preview (§12.4). */
  | { state: 'vanished'; path: string };

export function useImagePreview(
  activeFile: string | null,
  portReady: boolean,
): ImagePreview {
  const mime = activeFile ? imageMimeForPath(activeFile) : null;
  const [preview, setPreview] = useState<ImagePreview>({ state: 'idle' });
  // Bumped by the fs-change subscription to re-read the shown image.
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!activeFile || !mime || !portReady) {
      setPreview({ state: 'idle' });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreview({ state: 'loading', path: activeFile });
    const tree = WorkingTree.current();
    tree
      .readBytes(activeFile)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        setPreview({ state: 'ready', path: activeFile, url: objectUrl, mime });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Distinguish a vanished file from a transient unreadable fs (§12.4).
        void tree
          .exists(activeFile)
          .then((present) => {
            if (cancelled) return;
            setPreview(
              present
                ? {
                    state: 'error',
                    path: activeFile,
                    message: e instanceof Error ? e.message : String(e),
                  }
                : { state: 'vanished', path: activeFile },
            );
          });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeFile, mime, portReady, reloadNonce]);

  // Re-read when the host's fs-change batch names the shown image (R-IX-4: a
  // write renders its own result). epoch 0 is the empty initial — nothing to do.
  useEffect(() => {
    if (!activeFile || !mime) return;
    return onFsChange((change) => {
      if (change.epoch === 0) return;
      if (change.paths.some((p) => samePath(p, activeFile))) {
        setReloadNonce((n) => n + 1);
      }
    });
  }, [activeFile, mime]);

  return preview;
}
