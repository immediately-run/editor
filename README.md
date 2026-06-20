# editor — the immediately.run code editor, as a forkable app

This is the immediately.run **editor**, reclassified from host kernel into a
**forkable system app** (`EDITOR_AS_APP_SPEC`, plan `docs/plans/editor-as-app/`,
roadmap R3-54 / Phase 04). It renders **raw CodeMirror 6** in an opaque iframe and
reaches the kernel **only through the SDK** — the read-write working-tree port, the
editor-session channels, and the session intents. It is a drop-in successor to the
native `Edit.tsx` + `EditorTabs.tsx` surface.

## The boundary (don't cross it)

The kernel owns the **document** — the working-tree bytes, transpilation, the
COW/journal, the Sandpack client. This app owns the **view** — CodeMirror state,
cursor, undo, tabs, decorations. The app never drives the transpile loop and never
hosts `SandpackProvider`; it edits a kernel-owned document over the SDK.

## How it works

- **Content over the rw port.** The active file (from the editor-session channel) is
  read through the working-tree mount (`src/fs/mountFs.ts`, reused from the
  file-explorer app; `src/fs/workingTree.ts` maps repo-relative paths to the mount).
  Every keystroke updates the in-iframe CodeMirror state at **0 hops**.
- **Debounced write — the sole timing knob.** Edits are debounced
  (`src/core/debounce.ts`) and written back to the rw port. We debounce the **write**,
  not compilation: the host recompiles **immediately** whenever its ZenFS watch
  observes a write (host `recompileMode:'immediate'`), so there is no `recompileDelay`
  to match. A pending write is **flushed before teardown** (branch-switch remount /
  grant revocation) so the user's last edit is never silently dropped (spec §12.5).
- **The §6 conflict surface.** An external write to a file with unsaved edits does
  **not** modify the buffer — it raises a **blocking** conflict (*keep mine* / *take
  theirs* / *show diff*) and **blocks save** until resolved. The user's keystrokes are
  never touched. A clean buffer re-reads silently. This is the code-integrity
  invariant: the editor anchors "Save to GitHub", so silent byte-substitution into the
  about-to-be-saved buffer is rejected (`src/core/buffer.ts`, threat M6).
- **Active-file-vanished (§12.4).** A file deleted/renamed under the open buffer shows
  a "this file was removed" placeholder and is **never written back** (no
  resurrection).
- **Tabs + intents.** The open-tab set renders from the session channel; clicks call
  `setActiveFile` / `closeFile` (the `editor:document` capability). The app holds no
  local tab state — it renders the echoed channel (single source of truth).
- **Diagnostics, theme, form-factor** ride their channels (`useDiagnostics`,
  `useHostTheme`, `useFormFactor`).

## Security invariants

- **Opaque origin, SDK-only.** The app never assumes same-origin and never touches
  `window.parent`; it reaches the kernel exclusively through the SDK.
- **Writes only the files the user edits.** The vanished handler explicitly does not
  re-create a deleted file — a buggy/forked editor's blast radius is bounded to
  user-driven edits in the user's own working copy.
- **No `contribute:*`.** The app cannot push. Saving to GitHub stays a separate,
  separately-consented authority. A fork scribbles only in the user's own working copy.

## Status

**Phase 04 — parity-in-isolation.** Built behind the kernel kill-switch; **not yet
bound to `panel.editor`** (that flip + the native-editor deletion is Phase 05,
operator-gated on `HOST_ORIGIN_HARDENING` + a deploy). Two host-side dependencies are
not on `main` yet and have documented stand-ins here:

- **`onFsChange` channel (Phase 02).** External-change detection currently uses a
  low-frequency re-read poll (`src/hooks/useFileBuffer.ts`); swap it for the channel
  subscription when it lands — the buffer transitions are unchanged.
- **Host ZenFS-watch recompile + per-port origin-exclusion (Phase 01).** The write
  debounce here assumes the host recompiles on watch and excludes this port from the
  fs-change fan-out.

## Tests

The decision logic is pure and unit-tested (`src/core/*.test.ts`): the conflict state
machine, the readiness race, diagnostics mapping, the debounce flush/cancel, language
selection, and the working-tree resolver. The React surface has jsdom smoke tests
(`src/App.test.tsx`).

```sh
npm install
npm test       # vitest
npm run build  # tsc -b && vite build
```

## Forking

Fork it, edit it, run it — it is an ordinary immediately.run app. A fork inherits a
read-write port to **your own** working copy (the `exposesWorkingTree:'rw'` region
property), so its blast radius is self-contained. It cannot push and cannot reach
another user's tree.
