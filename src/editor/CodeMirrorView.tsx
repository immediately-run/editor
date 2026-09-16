// The raw CodeMirror 6 surface (plan Phase 04 §4.0). A thin React wrapper that
// owns an `EditorView` imperatively: it is created once and then *reconfigured*
// (never recreated) as the active file, theme, read-only state, and diagnostics
// change — so the user's local view-state (cursor, selection, undo history)
// survives prop churn. Every keystroke updates the in-iframe state at 0 hops and
// reports the new text up via `onChange`; persistence is debounced upstream.

import { useEffect, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { baseExtensions } from "./codemirrorSetup";
import { languageExtension } from "./language";
import { editorTheme } from "./theme";
import { toCodeMirrorMarks, type SourceError } from "../core/diagnostics";
import type { HostTheme } from "@immediately-run/sdk";

/** Path comparison that survives the leading-slash difference between the host's
 *  normalized form (`/src/App.tsx`) and a caller's repo-relative one. */
const normalize = (p: string): string => (p.startsWith("/") ? p : `/${p}`);

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
  /** R3-388 — a one-shot request to put the caret somewhere in this document, or
   *  `null`. Applied once per `nonce`: two clicks on the SAME diagnostic must move
   *  the caret twice, and every value between here and the host is de-duped, so the
   *  nonce is the only thing that makes a repeat distinguishable. `line`/`column` are
   *  1-indexed and are what the CALLER asked for — clamping to this document happens
   *  here, which is why the host never has to resolve (and therefore never reveals)
   *  how long the file is. */
  selection: {
    path: string;
    line: number;
    column?: number;
    nonce: number;
  } | null;
  onChange: (next: string) => void;
}

export function CodeMirrorView({
  path,
  doc,
  readOnly,
  theme,
  errors,
  selection,
  onChange,
}: CodeMirrorViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // R3-388 — the caret request (nonce) this component has applied; see below.
  const lastAppliedNonce = useRef<number | null>(null);
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
    // A fresh view has applied nothing. The nonce ledger is a ref and outlives the
    // view under a StrictMode-style effect double-run (mount → cleanup → mount), so
    // without this reset the SECOND view — the one that stays on screen — would skip
    // a request the first, already-destroyed view had consumed.
    lastAppliedNonce.current = null;
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
    view.current?.dispatch({
      effects: langC.current.reconfigure(languageExtension(path)),
    });
  }, [path]);

  useEffect(() => {
    view.current?.dispatch({
      effects: themeC.current.reconfigure(editorTheme(theme)),
    });
    // R3-653 fault injection (reverted by the next commit): `theme` dropped from the
    // dependency array, which is a react-hooks/exhaustive-deps WARNING in this repo.
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: roC.current.reconfigure(readOnlyExtension(readOnly)),
    });
  }, [readOnly]);

  // R3-388 — apply a one-shot caret request.
  //
  // `[doc]` is in the deps, not just `[selection]`, and that is the load-bearing part:
  // the host announces the target immediately after switching the active file, so the
  // request routinely arrives BEFORE this view has the new document. Reacting only to
  // the selection would land the caret in the outgoing file, or nowhere. Re-running on
  // `doc` lets the same nonce apply once the right text is in the view.
  useEffect(() => {
    const v = view.current;
    if (!v || !selection) return;
    if (lastAppliedNonce.current === selection.nonce) return;
    // The target is for a specific file; ignore it until this view is showing that
    // file, rather than moving the caret in whatever happens to be open.
    if (normalize(selection.path) !== normalize(path)) return;
    // Clamp, don't fail: a diagnostic outlives the edit that shortened its file, and
    // landing on the last line beats not navigating at all.
    const lineNo = Math.min(
      Math.max(1, Math.floor(selection.line)),
      v.state.doc.lines,
    );
    const line = v.state.doc.line(lineNo);
    const col = selection.column ? Math.floor(selection.column) : 1;
    const pos = Math.min(line.from + Math.max(0, col - 1), line.to);
    lastAppliedNonce.current = selection.nonce;
    v.dispatch({
      selection: { anchor: pos },
      // Centred rather than `"nearest"`: the caller is sending someone to a problem
      // they have not seen, so context above and below it is the point. A reveal that
      // parks the line at the very bottom of the viewport reads as having missed.
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    // Focus is NOT taken. The caller is a panel the user is driving with the keyboard;
    // stealing focus here would break arrow-key traversal of the problems list.
  }, [selection, doc, path]);

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
