// The editor app — raw CodeMirror over SDK channels, no same-origin assumptions
// (EDITOR_AS_APP_SPEC, plan Phase 04). It reads the editor session (active file)
// and host theme/form-factor from channels and edits the file through the rw
// working-tree port. No tab strip is rendered — the host owns file switching.
// Behind the kernel kill-switch it is not yet bound to `panel.editor` (Phase 05);
// this is parity-in-isolation.

import {
  useEditorContext,
  useHostTheme,
  useFormFactor,
} from "@immediately-run/sdk";
import { useFileBuffer } from "./hooks/useFileBuffer";
import { useImagePreview } from "./hooks/useImagePreview";
import { useBuildErrors } from "./hooks/useBuildErrors";
import { useCaretRequest } from "./hooks/useCaretRequest";
import { resolvePhase } from "./core/readiness";
import { CodeMirrorView } from "./editor/CodeMirrorView";
import { ConflictBar } from "./chrome/ConflictBar";
import { ImageOverlay } from "./chrome/ImageOverlay";
import { Placeholder } from "./chrome/Placeholder";
import { isRewrittenPath } from "./core/rewrittenPaths";
import "./index.css";
import "./App.css";

export default function App() {
  const { activeFile } = useEditorContext();
  const theme = useHostTheme();
  const formFactor = useFormFactor();
  const buildErrors = useBuildErrors();
  // R3-388 — a host request to land the caret on a line (a problems-list click).
  const caret = useCaretRequest();

  const {
    buffer,
    loadError,
    saveError,
    writable,
    portReady,
    setText,
    resolveKeepMine,
    resolveTakeTheirs,
  } = useFileBuffer(activeFile);

  const phase = resolvePhase({ portReady, activeFile });

  // R3-804 — a recognised image takes the pane as an overlay over the LIVE
  // CodeMirror view: useFileBuffer keeps the previous text buffer (its bytes
  // never enter the text path), CodeMirrorView stays mounted underneath, and
  // the text→image→text round trip costs no editor teardown.
  const image = useImagePreview(activeFile, portReady);
  const imageActive = phase === "ready" && image.state !== "idle";

  // A file Sandpack rewrites on every mount (e.g. package.json) is read-only — a
  // user edit would be accepted then silently discarded (native CP-3 parity). So
  // is a non-writable mount (an `ro` view / anonymous viewer).
  const readOnly =
    !writable || (activeFile != null && isRewrittenPath(activeFile));

  const conflict = buffer?.conflict ?? null;
  const errors = activeFile ? buildErrors : [];

  return (
    <div
      className="editor-app"
      data-theme={theme}
      data-form-factor={formFactor.class}
      data-orientation={formFactor.orientation}
    >
      {!imageActive && conflict && buffer && (
        <ConflictBar
          path={buffer.path}
          mine={buffer.buffer}
          theirs={conflict.theirs}
          onKeepMine={resolveKeepMine}
          onTakeTheirs={resolveTakeTheirs}
        />
      )}

      {!imageActive && readOnly && phase === "ready" && !buffer?.vanished && (
        <div className="ed-readonly-note" role="note">
          {writable
            ? "Read-only — this file is regenerated on each run."
            : "Read-only."}
        </div>
      )}
      {!imageActive && saveError && (
        <div className="ed-save-error" role="alert">
          Save failed: {saveError}
        </div>
      )}

      <div className="ed-body">
        {phase === "awaiting-port" && <Placeholder kind="awaiting-port" />}
        {phase === "no-active-file" && <Placeholder kind="no-active-file" />}
        {!imageActive && phase === "ready" && buffer?.vanished && (
          <Placeholder kind="vanished" detail={buffer.path} />
        )}
        {!imageActive && phase === "ready" && !buffer && loadError && (
          <Placeholder kind="error" detail={loadError} />
        )}
        {phase === "ready" && buffer && !buffer.vanished && (
          // While an image covers the pane the editor underneath is hidden
          // from pointer, keyboard and the accessibility tree (WCAG 2.1.1 /
          // 2.4.3) — and stays MOUNTED, so switching back is a reconfigure,
          // not a rebuild.
          <div className="ed-cm-wrap" inert={imageActive} aria-hidden={imageActive}>
            <CodeMirrorView
              path={buffer.path}
              doc={buffer.buffer}
              readOnly={readOnly}
              theme={theme}
              errors={errors}
              selection={caret}
              onChange={setText}
            />
          </div>
        )}
        {imageActive && <ImageOverlay preview={image} />}
      </div>
    </div>
  );
}
