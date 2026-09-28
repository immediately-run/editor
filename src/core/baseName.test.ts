import { describe, it, expect } from 'vitest';
import { baseName } from './baseName';

describe('baseName', () => {
  it('returns the last non-empty segment', () => {
    expect(baseName('/a/b/notes.txt')).toBe('notes.txt');
    expect(baseName('notes.txt')).toBe('notes.txt');
  });

  it('falls back to the input when there is no non-empty segment', () => {
    expect(baseName('/')).toBe('/');
  });

  it('ignores a trailing slash', () => {
    expect(baseName('/a/b/')).toBe('b');
  });
});
