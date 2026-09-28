// Non-editing render states: the §12.7 init race (awaiting the working-tree port
// / no active file), the §12.4 active-file-vanished case, and load/read errors.

import { FileQuestion, FilePlus2, FileX2, Loader2 } from 'lucide-react';

export type PlaceholderKind = 'awaiting-port' | 'no-active-file' | 'vanished' | 'error';

export interface PlaceholderProps {
  kind: PlaceholderKind;
  detail?: string;
  /** Override the kind's copy when the same ANATOMY serves a neighbouring state
   *  (R3-804's image loading/vanished states) — never fork the markup. An empty
   *  hint suppresses the hint line. */
  title?: string;
  hint?: string;
}

const COPY: Record<PlaceholderKind, { title: string; hint: string; icon: typeof FileQuestion }> = {
  'awaiting-port': {
    title: 'Connecting to the working tree…',
    hint: 'The editor is waiting for the file system to attach.',
    icon: Loader2,
  },
  'no-active-file': {
    title: 'No file open',
    hint: 'Open a file from the explorer to start editing.',
    icon: FilePlus2,
  },
  vanished: {
    title: 'This file was removed',
    hint: 'The file you were editing was deleted or renamed elsewhere. Your unsaved text is kept below — copy anything you need.',
    icon: FileX2,
  },
  error: {
    title: 'Could not open this file',
    hint: 'The working tree returned an error while reading it.',
    icon: FileQuestion,
  },
};

export function Placeholder({ kind, detail, title, hint }: PlaceholderProps) {
  const copy = COPY[kind];
  const Icon = copy.icon;
  const hintText = hint ?? copy.hint;
  return (
    <div className="placeholder" data-kind={kind}>
      <Icon size={28} className={kind === 'awaiting-port' ? 'spin' : undefined} />
      <div className="placeholder-title">{title ?? copy.title}</div>
      {hintText && <div className="placeholder-hint">{hintText}</div>}
      {detail && <div className="placeholder-detail">{detail}</div>}
    </div>
  );
}

export default Placeholder;
