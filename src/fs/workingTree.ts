// Resolve the rw working-tree mount and map repo-relative paths (the channel's
// `activeFile`, e.g. `/src/App.tsx`) to absolute sandbox paths to read/write
// through `mountFs.ts` (plan Phase 04 step 2).
//
// The editor-as-app design (Phase 01) exposes the working tree as an rw port via
// the region property `exposesWorkingTree:'rw'`, announced as a `mount-add`. Until
// that binding is wired (Phase 05), and as a robust fallback, we resolve the
// writable root from the SDK mount set: the rw mount whose path roots the repo, or
// `getAppMountPath()` (the repo's own mount, dual-mounted at `/app`).

import { getMounts, getAppMountPath, type SandboxMount } from '@immediately-run/sdk';
import { readFileText, writeFileText, exists, fsAvailable } from './mountFs';

/** Join a mount root with a repo-relative path, collapsing the slash seam. */
export function joinMount(root: string, repoRelative: string): string {
  const r = root.replace(/\/+$/, '');
  const rel = repoRelative.startsWith('/') ? repoRelative : `/${repoRelative}`;
  return `${r}${rel}`;
}

/**
 * The absolute root the editor reads/writes through. Prefers an explicit rw
 * working-tree mount (the `exposesWorkingTree:'rw'` port, mode `'rw'`); falls back
 * to the app's own repo mount path. The repo mount has no `mode` and is treated
 * as writable (it is the user's own working copy).
 */
export function resolveWorkingTreeRoot(mounts: SandboxMount[], appMountPath: string): string {
  // A whole-mount rw grant rooted at the repo — the Phase-01 working-tree port.
  const rw = mounts.find((m) => m.mode === 'rw');
  if (rw) return rw.path;
  return appMountPath;
}

/** Is the working tree writable here? False for an `ro` mount / anonymous viewer
 *  (the native editor's read-only case — hide the save path, mark CodeMirror
 *  read-only). */
export function isWritable(mounts: SandboxMount[]): boolean {
  // An explicit `ro` mount with no rw sibling is read-only.
  const anyRo = mounts.some((m) => m.mode === 'ro');
  const anyRw = mounts.some((m) => m.mode === 'rw');
  if (anyRo && !anyRw) return false;
  return true;
}

/** The live working-tree accessor bound to the current mount root. Recomputed
 *  when the mount set changes (a role downgrade re-announces the mount `ro`). */
export class WorkingTree {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  static current(): WorkingTree {
    return new WorkingTree(resolveWorkingTreeRoot(getMounts(), getAppMountPath()));
  }

  abs(repoRelative: string): string {
    return joinMount(this.root, repoRelative);
  }

  read(repoRelative: string): Promise<string> {
    return readFileText(this.abs(repoRelative));
  }

  write(repoRelative: string, text: string): Promise<void> {
    return writeFileText(this.abs(repoRelative), text);
  }

  exists(repoRelative: string): Promise<boolean> {
    return exists(this.abs(repoRelative));
  }

  /** Has the port arrived (is the sandbox fs reachable)? Drives §12.7 readiness. */
  get ready(): boolean {
    return fsAvailable();
  }
}
