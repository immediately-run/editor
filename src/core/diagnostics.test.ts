import { describe, it, expect } from 'vitest';
import { toCodeMirrorMarks, normalizePath } from './diagnostics';

const TEXT = 'const a = 1;\nconst b = 2;\nconst c = 3;';
//            0..............13............26

describe('normalizePath', () => {
  it('adds a leading slash and strips trailing ones', () => {
    expect(normalizePath('src/a.ts')).toBe('/src/a.ts');
    expect(normalizePath('/src/a.ts/')).toBe('/src/a.ts');
    expect(normalizePath('/')).toBe('/');
  });
});

describe('toCodeMirrorMarks', () => {
  it('marks from the column to end of line for the active file', () => {
    const marks = toCodeMirrorMarks(
      [{ message: 'bad', path: '/src/a.ts', line: 2, column: 7 }],
      '/src/a.ts',
      TEXT,
    );
    expect(marks).toHaveLength(1);
    // line 2 starts at offset 13; column 7 → +6 = 19; end of line 2 content
    // (the ';' at index 24) is offset 25, just before the '\n'.
    expect(marks[0]).toEqual({ from: 19, to: 25, severity: 'error', message: 'bad' });
  });

  it('drops errors for other files', () => {
    const marks = toCodeMirrorMarks(
      [{ message: 'elsewhere', path: '/src/b.ts', line: 1 }],
      '/src/a.ts',
      TEXT,
    );
    expect(marks).toHaveLength(0);
  });

  it('tolerates a host sending a path without a leading slash', () => {
    const marks = toCodeMirrorMarks(
      [{ message: 'x', path: 'src/a.ts', line: 1 }],
      '/src/a.ts',
      TEXT,
    );
    expect(marks).toHaveLength(1);
  });

  it('a file-level error (no line) marks the first line', () => {
    const marks = toCodeMirrorMarks([{ message: 'whole file', path: '/src/a.ts' }], '/src/a.ts', TEXT);
    expect(marks[0].from).toBe(0);
    expect(marks[0].to).toBe(12);
  });

  it('a path-less error is treated as belonging to the active file', () => {
    const marks = toCodeMirrorMarks([{ message: 'no path', line: 1 }], '/src/a.ts', TEXT);
    expect(marks).toHaveLength(1);
  });

  it('clamps a line past the end of the document', () => {
    const marks = toCodeMirrorMarks([{ message: 'oob', line: 999 }], '/a', TEXT);
    expect(marks[0].from).toBe(TEXT.length);
    expect(marks[0].to).toBe(TEXT.length);
  });
});
