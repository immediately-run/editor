// The base CodeMirror 6 extension set — a lean, hand-assembled "basic setup"
// (raw CodeMirror, not the all-in-one `basic-setup` package nor a re-hosted
// Sandpack — plan Phase 04 §4.0 / don't-reimplement). Matches the native
// editor's `showLineNumbers` + inline lint.

import type { Extension } from '@codemirror/state';
import {
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  keymap,
  EditorView,
} from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintGutter } from '@codemirror/lint';

export const baseExtensions: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  history(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  lintGutter(),
  EditorView.lineWrapping,
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
];
