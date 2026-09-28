// R3-804 — the image surface that covers (never replaces) the mounted
// CodeMirror view while the active file is a recognised image. Rendered inside
// `.ed-body`, absolutely positioned over `.cm-host`; file selection in the
// explorer is the only dismiss (R-IX-1: it opens where the user is looking —
// the pane they just clicked into — and never takes focus). The covered editor
// is `inert`/`aria-hidden` upstream (App.tsx), so keyboard and screen-reader
// users cannot land in a hidden document (WCAG 2.1.1 / 2.4.3).
//
// States: a named busy state while the bytes load (R-IX-2 / WCAG 4.1.3), the
// image with a caption once ready, and honest error / vanished (§12.4) states
// — a failed read names the path (R3), and the settle is announced through a
// live region, not only painted (R-IX-7).

import { useState } from 'react';
import { FileX2, Loader2 } from 'lucide-react';
import type { ImagePreview } from '../hooks/useImagePreview';
import { Placeholder } from './Placeholder';

const fileName = (path: string): string => path.split('/').pop() ?? path;

export function ImageOverlay({ preview }: { preview: ImagePreview }) {
  if (preview.state === 'loading') {
    return (
      <div className="ed-image-overlay placeholder" role="status">
        <Loader2 size={28} className="spin" />
        <div className="placeholder-title">Loading {fileName(preview.path)}…</div>
      </div>
    );
  }
  if (preview.state === 'error') {
    return (
      <div className="ed-image-overlay">
        <Placeholder
          kind="error"
          detail={`${preview.path} — ${preview.message}`}
        />
      </div>
    );
  }
  if (preview.state === 'vanished') {
    return (
      <div className="ed-image-overlay placeholder" data-kind="vanished">
        <FileX2 size={28} />
        <div className="placeholder-title">This file was removed</div>
        <div className="placeholder-hint">
          The image was deleted or renamed elsewhere.
        </div>
        <div className="placeholder-detail">{preview.path}</div>
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
  const name = fileName(path);
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
