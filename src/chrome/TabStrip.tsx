// The editor tab bar — parity with the native `EditorTabs.tsx` (file icon +
// name + close affordance, active tab carries the accent). The app holds NO
// local tab state: it renders the echoed `openFiles`/`activeFile` from the
// editor-session channel and drives changes through the `setActiveFile`/
// `closeFile` intents (plan Phase 04 step 5 — single source of truth).

import { setActiveFile, closeFile } from '@immediately-run/sdk';
import { FileCode, FileJson, FileText, FileType, X } from 'lucide-react';

const baseName = (p: string) => p.split('/').filter(Boolean).pop() || p;

function GlyphFor({ name }: { name: string }) {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(name)) return <FileCode size={13} />;
  if (/\.json$/i.test(name)) return <FileJson size={13} />;
  if (/\.(md|mdx)$/i.test(name)) return <FileText size={13} />;
  return <FileType size={13} />;
}

export interface TabStripProps {
  openFiles: string[];
  activeFile: string | null;
  /** Repo-relative paths with unsaved edits — render a dirty dot. */
  dirtyPaths: string[];
}

export function TabStrip({ openFiles, activeFile, dirtyPaths }: TabStripProps) {
  const dirty = new Set(dirtyPaths);
  return (
    <div className="tabs-bar" role="tablist">
      <div className="tabs-scroll">
        {openFiles.map((path) => {
          const name = baseName(path);
          const active = path === activeFile;
          return (
            <div
              key={path}
              className="tab"
              role="tab"
              aria-selected={active}
              data-active={active ? '1' : '0'}
              title={path}
              onClick={() => void setActiveFile(path).catch(() => {})}
            >
              <span className="ic">
                <GlyphFor name={name} />
              </span>
              <span className="label">{name}</span>
              {dirty.has(path) && <span className="dirty-dot" aria-label="Unsaved changes" />}
              {openFiles.length > 1 && (
                <span
                  className="close"
                  role="button"
                  aria-label={`Close ${name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeFile(path).catch(() => {});
                  }}
                >
                  <X size={11} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TabStrip;
