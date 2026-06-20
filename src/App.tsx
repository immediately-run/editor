// The editor app — raw CodeMirror over SDK channels, no same-origin assumptions
// (EDITOR_AS_APP_SPEC, plan Phase 04). It reads the editor session (active file +
// open tabs) and host theme/form-factor from channels, edits the file through the
// rw working-tree port, and drives tabs through the session intents. Behind the
// kernel kill-switch it is not yet bound to `panel.editor` (Phase 05); this is
// parity-in-isolation.

import { useMemo } from 'react';
import { useEditorContext, useHostTheme, useFormFactor } from '@immediately-run/sdk';
import { useFileBuffer } from './hooks/useFileBuffer';
import { useBuildErrors } from './hooks/useBuildErrors';
import { resolvePhase } from './core/readiness';
import { isDirty } from './core/buffer';
import { CodeMirrorView } from './editor/CodeMirrorView';
import { TabStrip } from './chrome/TabStrip';
import { ConflictBar } from './chrome/ConflictBar';
import { Placeholder } from './chrome/Placeholder';
import { isRewrittenPath } from './core/rewrittenPaths';
import './index.css';
import './App.css';

export default function App() {
  const { activeFile, openFiles, dirtyPaths } = useEditorContext();
  const theme = useHostTheme();
  const formFactor = useFormFactor();
  const buildErrors = useBuildErrors();

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

  // A file Sandpack rewrites on every mount (e.g. package.json) is read-only — a
  // user edit would be accepted then silently discarded (native CP-3 parity). So
  // is a non-writable mount (an `ro` view / anonymous viewer).
  const readOnly = !writable || (activeFile != null && isRewrittenPath(activeFile));

  // Tab dirty dots: the host's dirty set plus our live local-buffer state for the
  // active file (the host learns of our write only after it lands).
  const dirtySet = useMemo(() => {
    const s = new Set(dirtyPaths);
    if (buffer && isDirty(buffer)) s.add(buffer.path);
    return [...s];
  }, [dirtyPaths, buffer]);

  const conflict = buffer?.conflict ?? null;
  const errors = activeFile ? buildErrors : [];

  return (
    <div
      className="editor-app"
      data-theme={theme}
      data-form-factor={formFactor.class}
      data-orientation={formFactor.orientation}
    >
      <TabStrip openFiles={openFiles} activeFile={activeFile} dirtyPaths={dirtySet} />

      {conflict && buffer && (
        <ConflictBar
          path={buffer.path}
          mine={buffer.buffer}
          theirs={conflict.theirs}
          onKeepMine={resolveKeepMine}
          onTakeTheirs={resolveTakeTheirs}
        />
      )}

      {readOnly && phase === 'ready' && !buffer?.vanished && (
        <div className="ed-readonly-note" role="note">
          {writable ? 'Read-only — this file is regenerated on each run.' : 'Read-only.'}
        </div>
      )}
      {saveError && (
        <div className="ed-save-error" role="alert">
          Save failed: {saveError}
        </div>
      )}

      <div className="ed-body">
        {phase === 'awaiting-port' && <Placeholder kind="awaiting-port" />}
        {phase === 'no-active-file' && <Placeholder kind="no-active-file" />}
        {phase === 'ready' && buffer?.vanished && (
          <Placeholder kind="vanished" detail={buffer.path} />
        )}
        {phase === 'ready' && !buffer && loadError && (
          <Placeholder kind="error" detail={loadError} />
        )}
        {phase === 'ready' && buffer && !buffer.vanished && (
          <CodeMirrorView
            path={buffer.path}
            doc={buffer.buffer}
            readOnly={readOnly}
            theme={theme}
            errors={errors}
            onChange={setText}
          />
        )}
      </div>
    </div>
  );
}
