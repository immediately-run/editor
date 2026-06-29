// The editor's working-tree file helpers, over the SDK's typed sandbox-fs accessor.
//
// The ZenFS resolution order (globalThis.__sandpackSharedFs, with the bundler-layer
// fallback) used to be hand-rolled here AND in the file-explorer app, kept in sync by
// hand. It now lives ONCE in `@immediately-run/sdk/fs` (`sandboxFs`/`fsAvailable`,
// SDK_FS_SURFACE_SPEC). This file keeps only the editor's domain helpers — UTF-8
// read/write/exists over absolute working-tree paths — which use the SDK's `sandboxFs`
// escape hatch because the editor works in absolute `/src/...` paths that span the
// whole working tree (not a single mount-anchored `openFs`).
import { sandboxFs, fsAvailable } from '@immediately-run/sdk/fs';

/** Is the sandbox fs reachable at all? (false in local dev / before boot.) Re-exported
 *  from the SDK so existing imports of `mountFs` are unchanged. */
export { fsAvailable };

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/* eslint-disable @typescript-eslint/no-explicit-any */
// The node-compatible promises surface of the resolved ZenFS, or throw if unavailable.
function port(): any {
  const fs: any = sandboxFs();
  if (!fs) throw new Error('sandbox filesystem unavailable');
  return fs.promises ?? fs;
}

/** Read a working-tree file as UTF-8 text. Throws if the fs is unavailable or the
 *  read fails (e.g. the file vanished). */
export async function readFileText(absPath: string): Promise<string> {
  const data = await port().readFile(absPath);
  if (typeof data === 'string') return data;
  return decoder.decode(data instanceof Uint8Array ? data : new Uint8Array(data));
}

/** Write UTF-8 `text` to a working-tree file over the rw port. The host's ZenFS watch
 *  observes the write and recompiles immediately (the editor is origin-excluded from the
 *  resulting fs-change fan-out — Phase 01). Throws on an unavailable fs or a rejected
 *  write (e.g. an `ro` mount → EROFS). */
export async function writeFileText(absPath: string, text: string): Promise<void> {
  await port().writeFile(absPath, encoder.encode(text));
}

/** Does `absPath` exist? Used to detect the active-file-vanished case (§12.4) without
 *  throwing. */
export async function exists(absPath: string): Promise<boolean> {
  const fs: any = sandboxFs();
  if (!fs) return false;
  const p = fs.promises ?? fs;
  try {
    await p.stat(absPath);
    return true;
  } catch {
    return false;
  }
}
