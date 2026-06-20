// React-surface smoke tests for the editor app. The SDK channels and the
// working-tree port are mocked so the readiness states (§12.7) and the tab strip
// render without a live sandbox. The decision logic itself is covered by the pure
// core suites (buffer / readiness / diagnostics / debounce).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- SDK mock ---------------------------------------------------------------
const editorContext = {
  activeFile: null as string | null,
  openFiles: [] as string[],
  dirtyPaths: [] as string[],
};
const mounts: unknown[] = [];

vi.mock('@immediately-run/sdk', () => ({
  useEditorContext: () => editorContext,
  useHostTheme: () => 'dark',
  useFormFactor: () => ({ class: 'desktop', orientation: 'landscape', width: 1280, height: 800 }),
  useDiagnostics: () => ({ buildErrors: [], consoleEntries: [], provenance: null }),
  useMounts: () => mounts,
  getMounts: () => mounts,
  getAppMountPath: () => '/app',
  setActiveFile: vi.fn(() => Promise.resolve()),
  closeFile: vi.fn(() => Promise.resolve()),
}));

// --- working-tree port mock --------------------------------------------------
const fs = {
  available: false,
  files: new Map<string, string>(),
};
vi.mock('./fs/mountFs', () => ({
  fsAvailable: () => fs.available,
  readFileText: (p: string) =>
    fs.files.has(p) ? Promise.resolve(fs.files.get(p)!) : Promise.reject(new Error('ENOENT')),
  writeFileText: (p: string, t: string) => {
    fs.files.set(p, t);
    return Promise.resolve();
  },
  exists: (p: string) => Promise.resolve(fs.files.has(p)),
}));

import App from './App';

beforeEach(() => {
  editorContext.activeFile = null;
  editorContext.openFiles = [];
  editorContext.dirtyPaths = [];
  fs.available = false;
  fs.files.clear();
});

describe('App readiness states', () => {
  it('shows "awaiting port" when the working tree has not attached', () => {
    fs.available = false;
    editorContext.activeFile = '/src/App.tsx';
    render(<App />);
    expect(screen.getByText(/connecting to the working tree/i)).toBeInTheDocument();
  });

  it('shows "no file open" when the port is up but nothing is focused', () => {
    fs.available = true;
    editorContext.activeFile = null;
    render(<App />);
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
  });

  it('renders the open tabs from the session channel', () => {
    fs.available = true;
    editorContext.openFiles = ['/src/App.tsx', '/src/main.tsx'];
    editorContext.activeFile = '/src/App.tsx';
    fs.files.set('/app/src/App.tsx', 'export default 1;');
    render(<App />);
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
    expect(screen.getByText('main.tsx')).toBeInTheDocument();
  });
});
