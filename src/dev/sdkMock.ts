// DEV-ONLY harness mock of `@immediately-run/sdk`. Aliased in for
// `vite.harness.config.ts` so the editor app can be exercised standalone in a
// browser — supplying exactly what the host normally provides (the editor-session
// channel + an rw working-tree port) without a live immediately.run host.
//
// NOT shipped: the production build uses the real SDK. This file exists only so
// the Phase-04 "parity-in-isolation" target is demonstrable in Chrome.

import { useSyncExternalStore } from 'react';

export type HostTheme = 'light' | 'dark';
export interface FormFactor {
  class: 'mobile' | 'tablet' | 'desktop';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
}
export interface SandboxMount {
  path: string;
  type: string;
  mode?: 'ro' | 'rw';
}
interface EditorContext {
  activeFile: string | null;
  openFiles: string[];
  dirtyPaths: string[];
}

// ---- reactive store --------------------------------------------------------
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const state = {
  editorContext: {
    activeFile: '/src/App.tsx',
    openFiles: ['/src/App.tsx', '/src/main.tsx'],
    dirtyPaths: [],
  } as EditorContext,
  theme: 'dark' as HostTheme,
  formFactor: { class: 'desktop', orientation: 'landscape', width: 1280, height: 800 } as FormFactor,
  mounts: [{ path: '/app', type: 'repo', mode: 'rw' }] as SandboxMount[],
};

// ---- in-memory working-tree port (the rw mount at /app) --------------------
const files = new Map<string, string>([
  [
    '/app/src/App.tsx',
    "export default function App() {\n  return <h1>Hello from the editor app</h1>;\n}\n",
  ],
  ['/app/src/main.tsx', "import App from './App';\n\n// entry\n"],
]);
const enc = new TextEncoder();
const dec = new TextDecoder();
const fakeFs = {
  promises: {
    readFile: async (p: string) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return enc.encode(files.get(p)!);
    },
    writeFile: async (p: string, data: Uint8Array | string) => {
      files.set(p, typeof data === 'string' ? data : dec.decode(data));
    },
    stat: async (p: string) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { isDirectory: () => false, isFile: () => true };
    },
  },
};
(globalThis as unknown as { __sandpackSharedFs: unknown }).__sandpackSharedFs = fakeFs;

// Expose handles so a Chrome MCP session can drive scenarios from the page:
//   __editorHarness.externalWrite('/app/src/App.tsx', '...')  → §6 conflict
//   __editorHarness.externalDelete('/app/src/App.tsx')        → §12.4 vanished
//   __editorHarness.setTheme('light'); __editorHarness.activate('/src/main.tsx')
(window as unknown as { __editorHarness: unknown }).__editorHarness = {
  files,
  read: (p: string) => files.get(p),
  externalWrite: (p: string, content: string) => {
    files.set(p, content);
  },
  externalDelete: (p: string) => {
    files.delete(p);
  },
  setTheme: (t: HostTheme) => {
    state.theme = t;
    emit();
  },
  activate: (p: string) => setActiveFile(p),
  state,
};

// ---- the SDK surface the app imports ---------------------------------------
export const useEditorContext = (): EditorContext =>
  useSyncExternalStore(subscribe, () => state.editorContext);
export const useHostTheme = (): HostTheme => useSyncExternalStore(subscribe, () => state.theme);
export const useFormFactor = (): FormFactor =>
  useSyncExternalStore(subscribe, () => state.formFactor);
export const useMounts = (): SandboxMount[] => useSyncExternalStore(subscribe, () => state.mounts);
export const getMounts = (): SandboxMount[] => state.mounts;
export const getAppMountPath = (): string => '/app';

export const setActiveFile = async (path: string): Promise<void> => {
  const ec = state.editorContext;
  state.editorContext = {
    ...ec,
    activeFile: path,
    openFiles: ec.openFiles.includes(path) ? ec.openFiles : [...ec.openFiles, path],
  };
  emit();
};
export const closeFile = async (path: string): Promise<void> => {
  const ec = state.editorContext;
  const openFiles = ec.openFiles.filter((p) => p !== path);
  state.editorContext = {
    ...ec,
    openFiles,
    activeFile: ec.activeFile === path ? (openFiles[openFiles.length - 1] ?? null) : ec.activeFile,
  };
  emit();
};
