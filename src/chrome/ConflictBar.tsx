// The §6 blocking conflict surface. When an external write lands on a file the
// user has uncommitted edits in, the buffer is NOT modified and save is blocked;
// this bar offers the only ways out — keep mine / take theirs / show diff. The
// user's keystrokes are never touched (the editor anchors "Save to GitHub", so a
// silent byte-substitution into the about-to-be-saved buffer is a code-integrity
// vector — spec §6 / threat M6).

import { useState } from 'react';
import { AlertTriangle, Check, Download, GitCompare } from 'lucide-react';

export interface ConflictBarProps {
  path: string;
  /** The user's current (unsaved) buffer. */
  mine: string;
  /** The external bytes now on disk. */
  theirs: string;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}

const baseName = (p: string) => p.split('/').filter(Boolean).pop() || p;

export function ConflictBar({ path, mine, theirs, onKeepMine, onTakeTheirs }: ConflictBarProps) {
  const [showDiff, setShowDiff] = useState(false);
  return (
    <div className="conflict" role="alertdialog" aria-label="File changed on disk">
      <div className="conflict-row">
        <span className="conflict-msg">
          <AlertTriangle size={14} />
          <strong>{baseName(path)}</strong> changed on disk while you were editing. Saving is
          blocked until you choose.
        </span>
        <div className="conflict-actions">
          <button type="button" className="btn" onClick={onKeepMine}>
            <Check size={13} /> Keep mine
          </button>
          <button type="button" className="btn" onClick={onTakeTheirs}>
            <Download size={13} /> Take theirs
          </button>
          <button type="button" className="btn ghost" onClick={() => setShowDiff((v) => !v)}>
            <GitCompare size={13} /> {showDiff ? 'Hide diff' : 'Show diff'}
          </button>
        </div>
      </div>
      {showDiff && (
        <div className="conflict-diff">
          <div className="diff-col">
            <div className="diff-head">Mine (unsaved)</div>
            <pre>{mine}</pre>
          </div>
          <div className="diff-col">
            <div className="diff-head">Theirs (on disk)</div>
            <pre>{theirs}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConflictBar;
