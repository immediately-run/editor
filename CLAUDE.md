# CLAUDE.md — editor app

The immediately.run code editor as a forkable system app (raw CodeMirror 6 + SDK).
See `README.md` for the full design; `EDITOR_AS_APP_SPEC` + `docs/plans/editor-as-app/`
in the `docs` repo are the source of truth.

## Architecture rules

- **Boundary:** kernel owns the document (bytes, transpile, COW, Sandpack client); this
  app owns the view (CodeMirror state, cursor, undo, tabs). Never drive the transpile
  loop or host `SandpackProvider`.
- **Pure core, tested.** All decision logic lives in `src/core/` as pure functions with
  unit tests — the conflict state machine (`buffer.ts`), readiness (`readiness.ts`),
  diagnostics mapping (`diagnostics.ts`), debounce (`debounce.ts`), language/rewritten
  selectors. The React layer (`src/editor/`, `src/hooks/`, `src/chrome/`, `App.tsx`) is
  glue: keep logic out of it.
- **Debounce the WRITE, not compilation.** The host recompiles on its ZenFS watch; do
  not add a compile debounce or match `recompileDelay`.
- **§6 is load-bearing.** Never silently substitute external bytes into a dirty buffer.
  A conflict blocks save until the user resolves it. Don't "improve" this into an
  auto-merge.
- **No same-origin, no `window.parent`, no `contribute:*`.** SDK channels/port/intents
  only.

## Commands

- `npm run dev` — local Vite dev (the working-tree port is absent → "awaiting port").
- `npm test` — vitest (the suite that must stay green).
- `npm run lint` / `npm run build` — match the CI gate (warnings are errors under CI).

## Reusing across repos

`src/fs/mountFs.ts` keeps only the editor's domain helpers (UTF-8 read/write/exists); the
sandbox-fs **resolution** lives in `@immediately-run/sdk/fs` (`sandboxFs`/`fsAvailable`),
shared with the file-explorer app — so there is nothing to "keep in sync" by hand anymore.
If the sandbox fs accessor changes, it changes once, in the SDK.
