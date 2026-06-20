// Resolve a CodeMirror 6 language extension for a path. Keeps the (impure,
// dependency-heavy) CodeMirror imports out of the pure `core/langForPath.ts`
// selector, which is what the unit tests exercise.

import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { langForPath, isTypeScript, isJsx } from '../core/langForPath';

export function languageExtension(path: string): Extension[] {
  switch (langForPath(path)) {
    case 'javascript':
      return [javascript({ typescript: isTypeScript(path), jsx: isJsx(path) })];
    case 'json':
      return [json()];
    case 'css':
      return [css()];
    case 'html':
      return [html()];
    case 'markdown':
      return [markdown()];
    case 'none':
      return [];
  }
}
