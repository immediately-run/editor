// Choose a syntax-highlighting language by file extension (pure selector → key;
// the CodeMirror extension is resolved from the key in src/editor/language.ts so
// this stays dependency-free and unit-testable).

export type LangKey = 'javascript' | 'json' | 'css' | 'html' | 'markdown' | 'none';

const BY_EXT: Record<string, LangKey> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
};

/** Is this path a TypeScript dialect (so the JS language enables TS parsing)? */
export function isTypeScript(path: string): boolean {
  return /\.(ts|tsx)$/i.test(path);
}

/** Does this path use JSX (so the JS language enables JSX parsing)? */
export function isJsx(path: string): boolean {
  return /\.(jsx|tsx)$/i.test(path);
}

export function langForPath(path: string): LangKey {
  const m = /\.([^.\\/]+)$/.exec(path);
  if (!m) return 'none';
  return BY_EXT[m[1].toLowerCase()] ?? 'none';
}
