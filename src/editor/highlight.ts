// Syntax highlighting for the CodeMirror surface. Replaces CodeMirror's generic
// red/green `defaultHighlightStyle` with the design-system editor palette
// (Monokai-Pro-derived, keyed to the brand pink/violet — see the "Editor Color
// Proposal" bundle). Colours are read from `--cm-t-*` CSS variables so the
// theme flips with the host `theme` channel like the rest of the surface
// (src/index.css, src/editor/theme.ts).

import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const keyword = 'var(--cm-t-keyword)';
const attribute = 'var(--cm-t-attribute)';
const string = 'var(--cm-t-string)';
const constant = 'var(--cm-t-constant)';
const punctuation = 'var(--cm-t-punctuation)';
const comment = 'var(--cm-t-comment)';

export const editorHighlightStyle = HighlightStyle.define([
  // Comments + doctype/meta
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: comment, fontStyle: 'italic' },
  { tag: [t.meta, t.documentMeta, t.processingInstruction], color: comment },

  // Pink — keywords, tags, operators-as-words, storage modifiers
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.modifier,
      t.self,
      t.tagName,
      t.heading,
    ],
    color: keyword,
  },

  // Green — attributes, functions, properties, types/classes
  {
    tag: [
      t.attributeName,
      t.propertyName,
      t.function(t.variableName),
      t.function(t.propertyName),
      t.definition(t.variableName),
      t.typeName,
      t.className,
      t.namespace,
    ],
    color: attribute,
  },

  // Yellow — strings, regexps, escapes, links
  {
    tag: [t.string, t.special(t.string), t.regexp, t.escape, t.link, t.url, t.attributeValue],
    color: string,
  },

  // Violet — numbers, booleans, constants, atoms
  { tag: [t.number, t.bool, t.atom, t.null, t.constant(t.name), t.literal], color: constant },

  // Grey — punctuation, brackets, operators
  {
    tag: [
      t.punctuation,
      t.separator,
      t.bracket,
      t.angleBracket,
      t.squareBracket,
      t.paren,
      t.brace,
      t.operator,
      t.derefOperator,
    ],
    color: punctuation,
  },

  // Plain identifiers fall back to the editor foreground
  { tag: [t.variableName, t.name], color: 'var(--cm-fg)' },

  // Inline emphasis (markdown etc.)
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },

  // Errors
  { tag: t.invalid, color: 'var(--danger)' },
]);
