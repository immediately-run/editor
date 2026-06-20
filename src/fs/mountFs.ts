// Access the sandbox's node-compatible ZenFS — the canonical accessor, adapted
// from the file-explorer app's `src/fs/mountFs.ts` (plan Phase 04 step 2:
// "reuse it; do not reinvent"). Adds the rw `writeFile` the editor needs.
//
// Mounts (a space / a granted subtree / the working tree) are attached into the
// sandbox's own filesystem at their absolute `path` by ZenFS's global `mount()`.
// To read/write through them we need a node-compatible fs (`promises.readFile`/
// `writeFile`/`stat`) rooted at `/` so those absolute mount paths resolve.
//
// IMPORTANT: that is NOT `module.evaluation.module.bundler.fs` — despite the name
// that is the bundler's own layered `FileSystem` whose surface is only
// `readFile`/`isFile`/`writeFile`; it has no `promises`/`stat`. The
// node-compatible fs is the ZenFS bound context the sandbox creates at
// `globalThis.__sandpackSharedFs` (`bindContext({root:'/'})`), mirrored by the
// bundler's `zenFsLayer.boundContext.fs`. This helper only works inside the
// sandbox (where these globals exist); every access is guarded so local `vite`
// dev simply reports "unavailable".

/* eslint-disable @typescript-eslint/no-explicit-any */
const hasFs = (fs: any): boolean =>
  typeof fs?.promises?.readFile === 'function' || typeof fs?.readFile === 'function';

function sandboxFs(): any | null {
  // 1. The sandbox publishes a '/'-rooted bound ZenFS on globalThis.
  try {
    const shared = (globalThis as any).__sandpackSharedFs;
    if (hasFs(shared)) return shared;
  } catch {
    /* not in the sandbox */
  }
  // 2. Fall back to the bundler's ZenFS layer bound context (also '/'-rooted).
  try {
    // @ts-expect-error - `module` is injected by the sandbox runtime (SDK mounts.ts)
    const layers = module?.evaluation?.module?.bundler?.fs?.layers;
    if (Array.isArray(layers)) {
      for (const layer of layers) {
        const fs = layer?.boundContext?.fs;
        if (hasFs(fs)) return fs;
      }
    }
  } catch {
    /* not in the sandbox */
  }
  return null;
}

/** Is the sandbox fs reachable at all? (false in local dev / before boot). */
export function fsAvailable(): boolean {
  return sandboxFs() != null;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Read a working-tree file as UTF-8 text. Throws if the fs is unavailable or the
 *  read fails (e.g. the file vanished). */
export async function readFileText(absPath: string): Promise<string> {
  const fs = sandboxFs();
  if (!fs) throw new Error('sandbox filesystem unavailable');
  const p = fs.promises ?? fs;
  const data = await p.readFile(absPath);
  if (typeof data === 'string') return data;
  return decoder.decode(data instanceof Uint8Array ? data : new Uint8Array(data));
}

/** Write UTF-8 `text` to a working-tree file over the rw port. The host's ZenFS
 *  watch observes the write and recompiles immediately (the editor is
 *  origin-excluded from the resulting fs-change fan-out — Phase 01). Throws on an
 *  unavailable fs or a rejected write (e.g. an `ro` mount → EROFS). */
export async function writeFileText(absPath: string, text: string): Promise<void> {
  const fs = sandboxFs();
  if (!fs) throw new Error('sandbox filesystem unavailable');
  const p = fs.promises ?? fs;
  await p.writeFile(absPath, encoder.encode(text));
}

/** Does `absPath` exist? Used to detect the active-file-vanished case (§12.4)
 *  without throwing. */
export async function exists(absPath: string): Promise<boolean> {
  const fs = sandboxFs();
  if (!fs) return false;
  const p = fs.promises ?? fs;
  try {
    await p.stat(absPath);
    return true;
  } catch {
    return false;
  }
}
