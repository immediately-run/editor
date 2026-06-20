// Non-editing render states: the §12.7 init race (awaiting the working-tree port
// / no active file), the §12.4 active-file-vanished case, and load/read errors.

import { FileQuestion, FilePlus2, FileX2, Loader2 } from 'lucide-react';

export type PlaceholderKind = 'awaiting-port' | 'no-active-file' | 'vanished' | 'error';

export interface PlaceholderProps {
  kind: PlaceholderKind;
  detail?: string;
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

export function Placeholder({ kind, detail }: PlaceholderProps) {
  const { title, hint, icon: Icon } = COPY[kind];
  return (
    <div className="placeholder" data-kind={kind}>
      <Icon size={28} className={kind === 'awaiting-port' ? 'spin' : undefined} />
      <div className="placeholder-title">{title}</div>
      <div className="placeholder-hint">{hint}</div>
      {detail && <div className="placeholder-detail">{detail}</div>}
    </div>
  );
}

export default Placeholder;
