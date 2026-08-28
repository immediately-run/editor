// R3-388 — the caret one-shot, including the two cases that are the entire reason the
// transport carries a nonce (G-TOOL-1b/1c). Both were dead ends in the first design:
// the editor-context payload is de-duped by value, so a repeat request pushed nothing,
// and re-opening the already-active file changed neither `activeFile` nor `doc`.
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { CodeMirrorView } from "./CodeMirrorView";

const DOC = [
  "const a = 1;",
  "const b = 2;",
  "const c = 3;",
  "const d = 4;",
].join("\n");

// The view is created imperatively inside the component. `EditorView.findFromDOM` is
// CodeMirror's own public way back to it — reaching for an internal field instead is
// how a test starts asserting an implementation detail.
const viewOf = (container: HTMLElement): EditorView => {
  const v = EditorView.findFromDOM(container);
  expect(v).toBeTruthy();
  return v as EditorView;
};
const caretLine = (container: HTMLElement): number => {
  const v = viewOf(container);
  return v.state.doc.lineAt(v.state.selection.main.head).number;
};

const view = (selection: unknown, doc = DOC, path = "/src/a.ts") =>
  render(
    <CodeMirrorView
      path={path}
      doc={doc}
      readOnly={false}
      theme="dark"
      errors={[]}
      selection={selection as never}
      onChange={vi.fn()}
    />,
  );

describe("caret requests (R3-388)", () => {
  it("lands on the requested line", () => {
    const { container } = view({ path: "/src/a.ts", line: 3, nonce: 1 });
    expect(caretLine(container)).toBe(3);
  });

  it("G-TOOL-2: a line past end-of-file clamps to the last line rather than failing", () => {
    const { container } = view({ path: "/src/a.ts", line: 999, nonce: 1 });
    expect(caretLine(container)).toBe(4);
  });

  it("tolerates the leading-slash difference between host and caller paths", () => {
    const { container } = view({ path: "src/a.ts", line: 2, nonce: 1 });
    expect(caretLine(container)).toBe(2);
  });

  it("ignores a request aimed at a DIFFERENT file — no caret move in the wrong document", () => {
    const { container } = view({ path: "/src/other.ts", line: 3, nonce: 1 });
    expect(caretLine(container)).toBe(1);
  });

  it("G-TOOL-1b: the SAME target with a new nonce moves the caret again", () => {
    const { container, rerender } = view({
      path: "/src/a.ts",
      line: 3,
      nonce: 1,
    });
    expect(caretLine(container)).toBe(3);
    // Simulate the user clicking elsewhere in the document between the two clicks.
    viewOf(container).dispatch({ selection: { anchor: 0 } });
    expect(caretLine(container)).toBe(1);
    rerender(
      <CodeMirrorView
        path="/src/a.ts"
        doc={DOC}
        readOnly={false}
        theme="dark"
        errors={[]}
        selection={{ path: "/src/a.ts", line: 3, nonce: 2 }}
        onChange={vi.fn()}
      />,
    );
    expect(caretLine(container)).toBe(3);
  });

  it("applies a repeated NONCE only once — a re-render must not re-move the caret", () => {
    const sel = { path: "/src/a.ts", line: 3, nonce: 7 };
    const { container, rerender } = view(sel);
    viewOf(container).dispatch({ selection: { anchor: 0 } });
    rerender(
      <CodeMirrorView
        path="/src/a.ts"
        doc={DOC}
        readOnly={false}
        theme="dark"
        errors={[]}
        selection={sel}
        onChange={vi.fn()}
      />,
    );
    expect(caretLine(container)).toBe(1);
  });

  it("applies once the RIGHT document arrives — the request routinely beats the doc", () => {
    // The host announces the target immediately after switching the active file, so
    // this view often has the outgoing document when the request lands.
    const { container, rerender } = view(
      { path: "/src/a.ts", line: 3, nonce: 1 },
      "x = 1;\n",
      "/src/old.ts",
    );
    expect(caretLine(container)).toBe(1);
    rerender(
      <CodeMirrorView
        path="/src/a.ts"
        doc={DOC}
        readOnly={false}
        theme="dark"
        errors={[]}
        selection={{ path: "/src/a.ts", line: 3, nonce: 1 }}
        onChange={vi.fn()}
      />,
    );
    expect(caretLine(container)).toBe(3);
  });

  it("does nothing when there is no request", () => {
    const { container } = view(null);
    expect(caretLine(container)).toBe(1);
  });
});
