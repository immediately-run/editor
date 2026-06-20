// CodeMirror theming driven by the host `theme` channel (plan Phase 04 step 7).
// The native editor inherits theme from the Sandpack provider; as a standalone
// app we must pull it ourselves (`useHostTheme`) and translate to a CodeMirror
// EditorView theme. Kept minimal — colours read from the app's CSS variables so
// the editor chrome and the CodeMirror surface stay in step.

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { HostTheme } from '@immediately-run/sdk';

const dark = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--cm-fg)' },
    '.cm-content': { caretColor: 'var(--cm-caret)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--cm-gutter)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--cm-caret)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--cm-selection)',
    },
  },
  { dark: true },
);

const light = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--cm-fg)' },
    '.cm-content': { caretColor: 'var(--cm-caret)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--cm-gutter)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--cm-caret)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--cm-selection)',
    },
  },
  { dark: false },
);

export function editorTheme(theme: HostTheme): Extension {
  return theme === 'light' ? light : dark;
}
