import { describe, it, expect } from 'vitest';
import { langForPath, isTypeScript, isJsx } from './langForPath';

describe('langForPath', () => {
  it('maps common extensions', () => {
    expect(langForPath('/src/App.tsx')).toBe('javascript');
    expect(langForPath('a.js')).toBe('javascript');
    expect(langForPath('a.json')).toBe('json');
    expect(langForPath('styles.css')).toBe('css');
    expect(langForPath('page.html')).toBe('html');
    expect(langForPath('README.md')).toBe('markdown');
    expect(langForPath('notes.mdx')).toBe('markdown');
  });

  it('falls back to none for unknown / extensionless paths', () => {
    expect(langForPath('LICENSE')).toBe('none');
    expect(langForPath('archive.tar.gz')).toBe('none');
    expect(langForPath('/a/b/c')).toBe('none');
  });

  it('detects TypeScript and JSX dialects', () => {
    expect(isTypeScript('/a.ts')).toBe(true);
    expect(isTypeScript('/a.tsx')).toBe(true);
    expect(isTypeScript('/a.js')).toBe(false);
    expect(isJsx('/a.tsx')).toBe(true);
    expect(isJsx('/a.jsx')).toBe(true);
    expect(isJsx('/a.ts')).toBe(false);
  });
});
