// readFileBytes (R3-804): the image path's byte read. Drives the real function
// against a mocked SDK sandbox fs — the string re-encode branch, the plain
// Uint8Array branch, and the SharedArrayBuffer-view copy the Blob type demands.

import { describe, it, expect, vi, beforeEach } from 'vitest';

let fsImpl: { readFile: (p: string) => Promise<unknown> } | null = null;
vi.mock('@immediately-run/sdk/fs', () => ({
  // Referenced lazily (test time), like the workingTree.test.ts mocks.
  sandboxFs: () => fsImpl,
  fsAvailable: () => fsImpl !== null,
}));

import { readFileBytes } from './mountFs';

beforeEach(() => {
  fsImpl = null;
});

describe('readFileBytes', () => {
  it('rejects when the sandbox fs is unavailable', async () => {
    await expect(readFileBytes('/app/a.png')).rejects.toThrow(
      /sandbox filesystem unavailable/,
    );
  });

  it('re-encodes a string payload as UTF-8 bytes', async () => {
    fsImpl = { readFile: () => Promise.resolve('héllo') };
    const bytes = await readFileBytes('/app/a.png');
    expect(bytes).toEqual(new TextEncoder().encode('héllo'));
  });

  it('returns the bytes of a plain Uint8Array payload', async () => {
    const payload = new Uint8Array([137, 80, 78, 71]);
    fsImpl = { readFile: () => Promise.resolve(payload) };
    const bytes = await readFileBytes('/app/a.png');
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('copies a SharedArrayBuffer-backed view onto an ArrayBuffer', async () => {
    const sab = new SharedArrayBuffer(4);
    const view = new Uint8Array(sab);
    view.set([1, 2, 3, 4]);
    fsImpl = { readFile: () => Promise.resolve(view) };
    const bytes = await readFileBytes('/app/a.png');
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
    expect(bytes.buffer).not.toBeInstanceOf(SharedArrayBuffer);
  });
});
