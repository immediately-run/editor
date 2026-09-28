import { describe, it, expect } from 'vitest';
import { baseName } from './baseName';

describe('baseName', () => {
  it('returns the last non-empty segment', () => {
    expect(baseName('/a/b/logo.png')).toBe('logo.png');
    expect(baseName('logo.png')).toBe('logo.png');
  });

  it('falls back to the input when there is no non-empty segment', () => {
    expect(baseName('/')).toBe('/');
  });

  it('ignores a trailing slash', () => {
    expect(baseName('/a/b/')).toBe('b');
  });
});
