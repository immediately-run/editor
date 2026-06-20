import { describe, it, expect } from 'vitest';
import { isRewrittenPath } from './rewrittenPaths';

describe('isRewrittenPath', () => {
  it('flags package.json anywhere in the tree', () => {
    expect(isRewrittenPath('/package.json')).toBe(true);
    expect(isRewrittenPath('package.json')).toBe(true);
    expect(isRewrittenPath('/nested/package.json')).toBe(true);
  });

  it('does not flag ordinary source files', () => {
    expect(isRewrittenPath('/src/App.tsx')).toBe(false);
    expect(isRewrittenPath('/package-lock.json')).toBe(false);
    expect(isRewrittenPath('/README.md')).toBe(false);
  });
});
