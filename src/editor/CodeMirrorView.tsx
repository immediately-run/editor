// The raw CodeMirror 6 surface (plan Phase 04 §4.0). A thin React wrapper that
// owns an `EditorView` imperatively: it is created once and then *reconfigured*
// (never recreated) as the active file, theme, read-only state, and diagnostics
// change — so the user's local view-state (cursor, selection, undo history)
// survives prop churn. Every keystroke updates the in-iframe state at 0 hops and
// reports the new text up via `onChange`; persistence is debounced upstream.

import { useEffect, useRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { baseExtensions } from './codemirrorSetup';
import { languageExtension } from './language';
import { editorTheme } from './theme';
import { toCodeMirrorMarks, type SourceError } from '../core/diagnostics';
import type { HostTheme } from '@immediately-run/sdk';

export interface CodeMirrorViewProps {
  /** Repo-relative path of the file being edited (drives language + diagnostics). */
  path: string;
  /** The document text. A change to this that does NOT match the view's current
   *  content triggers a full replace (file switch / external take-theirs); a
   *  change that matches (the echo of the user's own edit) is a no-op. */
  doc: string;
  readOnly: boolean;
  theme: HostTheme;
  /** Build errors for the active file (already filtered upstream is fine; this
   *  filters again by path defensively). */
  errors: SourceError[];
  onChange: (next: string) => void;
}

export function CodeMirrorView({ path, doc, readOnly, theme, errors, onChange }: CodeMirrorViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  // Keep the latest onChange without re-creating the view (updated post-render).
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Compartments let us reconfigure single facets without rebuilding the state.
  const langC = useRef(new Compartment());
  const themeC = useRef(new Compartment());
  const roC = useRef(new Compartment());

  // Create the view once.
  useEffect(() => {
    if (!host.current) return;
    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) onChangeRef.current(u.state.doc.toString());
    });
    const state = EditorState.create({
      doc,
      extensions: [
        baseExtensions,
        langC.current.of(languageExtension(path)),
        themeC.current.of(editorTheme(theme)),
        roC.current.of(readOnlyExtension(readOnly)),
        updateListener,
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Intentionally create-once; subsequent prop changes are handled by the
    // reconfigure effects below so view-state survives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace the document only when the incoming text diverges from the view's
  // current content — i.e. a file switch or an external take-theirs, never the
  // echo of the user's own keystroke.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (doc !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
    }
  }, [doc]);

  // Reconfigure language when the active file (hence its type) changes.
  useEffect(() => {
    view.current?.dispatch({ effects: langC.current.reconfigure(languageExtension(path)) });
  }, [path]);

  useEffect(() => {
    view.current?.dispatch({ effects: themeC.current.reconfigure(editorTheme(theme)) });
  }, [theme]);

  useEffect(() => {
    view.current?.dispatch({ effects: roC.current.reconfigure(readOnlyExtension(readOnly)) });
  }, [readOnly]);

  // Push diagnostics into CodeMirror's lint state.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const text = v.state.doc.toString();
    const marks = toCodeMirrorMarks(errors, path, text);
    const diags: Diagnostic[] = marks.map((m) => ({
      from: m.from,
      to: m.to,
      severity: m.severity,
      message: m.message,
    }));
    v.dispatch(setDiagnostics(v.state, diags));
  }, [errors, path, doc]);

  return <div ref={host} className="cm-host" />;
}

function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

export default CodeMirrorView;
