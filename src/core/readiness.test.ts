import { describe, it, expect } from 'vitest';
import { resolvePhase } from './readiness';

describe('readiness (§12.7 init race)', () => {
  it('awaits the port when it has not arrived (either input order)', () => {
    expect(resolvePhase({ portReady: false, activeFile: null })).toBe('awaiting-port');
    // activeFile pushed before the port — still awaiting the port, never a crash:
    expect(resolvePhase({ portReady: false, activeFile: '/src/a.ts' })).toBe('awaiting-port');
  });

  it('shows "no active file" once the port is ready but nothing is focused', () => {
    expect(resolvePhase({ portReady: true, activeFile: null })).toBe('no-active-file');
  });

  it('is ready only when both the port and an active file are present', () => {
    expect(resolvePhase({ portReady: true, activeFile: '/src/a.ts' })).toBe('ready');
  });
});
