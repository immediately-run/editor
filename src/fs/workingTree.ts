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
 * The absolute root the editor reads/writes through. Selects the working tree by
 * IDENTITY — the §3.5 `worktree` port the host publishes (`type: 'worktree'`,
 * `exposesWorkingTree`) — regardless of `ro`/`rw`. A read-only source (local-dev,
 * zip cache, read-only space, anonymous GitHub viewer) is still THE tree to read;
 * writability gates SAVE only (see {@link isWritable}). Falls back to any rw mount,
 * then the app's own repo mount path.
 */
export function resolveWorkingTreeRoot(mounts: SandboxMount[], appMountPath: string): string {
  // Prefer the explicit working-tree port, ro or rw. Selecting by `mode === 'rw'`
  // alone skipped a `ro` worktree (the editor `exposesWorkingTree:'rw'`, but the
  // SOURCE mode clamps it to `ro` for local/zip/space) and fell back to
  // `appMountPath` — the editor's OWN repo, dual-mounted rw at `/mnt/{hash}` — so
  // the editor silently read and edited ITSELF instead of the session's tree.
  const worktree = mounts.find((m) => m.type === 'worktree');
  if (worktree) return worktree.path;
  // Legacy fallback: any rw mount rooted at the repo, then the app's own mount.
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
