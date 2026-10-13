/** Leading-slash-tolerant path equality — the host pushes `/src/App.tsx` while a
 *  caller may hold `src/App.tsx` (the same tolerance the hook's `samePath` has
 *  always applied). One home (R6): the reread judge and the file buffer hook both
 *  consume this; the hook re-exports it for its existing importers. */
export const samePath = (a: string, b: string): boolean =>
  a.replace(/^\/+/, "") === b.replace(/^\/+/, "");
