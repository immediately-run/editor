import { describe, it, expect, vi } from 'vitest';

// The functions under test (joinMount/resolveWorkingTreeRoot/isWritable) are pure
// and never call the SDK; mock it only so importing workingTree.ts doesn't pull
// the SDK's extensionless ESM re-exports through vitest's strict resolver.
vi.mock('@immediately-run/sdk', () => ({
  getMounts: () => [],
  getAppMountPath: () => '/app',
}));

import { joinMount, resolveWorkingTreeRoot, isWritable } from './workingTree';

interface SandboxMount {
  path: string;
  type: string;
  mode?: 'ro' | 'rw';
}

describe('joinMount', () => {
  it('joins a mount root with a repo-relative path', () => {
    expect(joinMount('/mnt/abc', '/src/App.tsx')).toBe('/mnt/abc/src/App.tsx');
    expect(joinMount('/mnt/abc/', 'src/App.tsx')).toBe('/mnt/abc/src/App.tsx');
    expect(joinMount('/app', '/index.html')).toBe('/app/index.html');
  });
});

describe('resolveWorkingTreeRoot', () => {
  it('prefers an explicit rw working-tree mount', () => {
    const mounts: SandboxMount[] = [{ path: '/mnt/wt', type: 'worktree', mode: 'rw' }];
    expect(resolveWorkingTreeRoot(mounts, '/app')).toBe('/mnt/wt');
  });

  it('falls back to the app mount path when there is no rw mount', () => {
    expect(resolveWorkingTreeRoot([], '/app')).toBe('/app');
    const ro: SandboxMount[] = [{ path: '/spaces/x', type: 'firestore', mode: 'ro' }];
    expect(resolveWorkingTreeRoot(ro, '/app')).toBe('/app');
  });
});

describe('isWritable', () => {
  it('is writable by default (the repo mount has no mode)', () => {
    expect(isWritable([])).toBe(true);
    expect(isWritable([{ path: '/app', type: 'repo' }])).toBe(true);
  });

  it('is read-only when the only mount is ro', () => {
    expect(isWritable([{ path: '/spaces/x', type: 'firestore', mode: 'ro' }])).toBe(false);
  });

  it('is writable when an rw mount is present alongside an ro one', () => {
    expect(
      isWritable([
        { path: '/spaces/x', type: 'firestore', mode: 'ro' },
        { path: '/mnt/wt', type: 'worktree', mode: 'rw' },
      ]),
    ).toBe(true);
  });
});
