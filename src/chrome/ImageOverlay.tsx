// R3-804 — the image surface that covers (never replaces) the mounted
// CodeMirror view while the active file is a recognised image. Rendered inside
// `.ed-body`, absolutely positioned over `.cm-host`; file selection in the
// explorer is the only dismiss (R-IX-1: it opens where the user is looking —
// the pane they just clicked into — and never takes focus). The covered editor
// is `inert`/`aria-hidden` upstream (App.tsx), so keyboard and screen-reader
// users cannot land in a hidden document (WCAG 2.1.1 / 2.4.3).
//
// Every state rides `Placeholder`'s anatomy (one spelling, R6) inside a live
// region: loading and ready announce through `role="status"`, a failed read
// through `role="alert"` (matching App's save-error surface) — the settle is
// announced, not only painted (R-IX-7 / WCAG 4.1.3) — and a failure always
// names the path (R3).

import { useState } from 'react';
import type { ImagePreview } from '../hooks/useImagePreview';
import { baseName } from '../core/baseName';
import { Placeholder } from './Placeholder';

export function ImageOverlay({ preview }: { preview: ImagePreview }) {
  if (preview.state === 'loading') {
    return (
      <div className="ed-image-overlay" role="status">
        <Placeholder kind="awaiting-port" title={`Loading ${baseName(preview.path)}…`} hint="" />
      </div>
    );
  }
  if (preview.state === 'error') {
    return (
      <div className="ed-image-overlay" role="alert">
        <Placeholder
          kind="error"
          detail={`${preview.path} — ${preview.message}`}
        />
      </div>
    );
  }
  if (preview.state === 'vanished') {
    return (
      <div className="ed-image-overlay" role="status">
        <Placeholder
          kind="vanished"
          hint="The image was deleted or renamed elsewhere."
          detail={preview.path}
        />
      </div>
    );
  }
  if (preview.state !== 'ready') return null;
  // Keyed by url: a re-read (an external write to the shown image) swaps the
  // object URL and ReadyImage remounts, so its dimensions never describe a
  // stale image.
  return <ReadyImage key={preview.url} path={preview.path} url={preview.url} />;
}

function ReadyImage({ path, url }: { path: string; url: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const name = baseName(path);
  return (
    <div className="ed-image-overlay">
      <img
        className="ed-image"
        src={url}
        alt={name}
        onLoad={(e) => {
          const img = e.currentTarget;
          setDims({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      <div className="ed-image-caption">
        {name}
        {dims ? ` · ${dims.w} × ${dims.h}` : ''} · read-only
      </div>
      {/* R-IX-7 — the settle is announced, not only rendered (WCAG 4.1.3). */}
      <div className="ed-visually-hidden" role="status">
        Showing image {name}
      </div>
    </div>
  );
}

export default ImageOverlay;
