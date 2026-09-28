// Which active file is an image the editor SHOWS rather than edits (R3-804).
//
// This map is the one home of the recognised extensions (implementation
// standards R6): the buffer hook (`useFileBuffer`) consults it to stay out of
// the image's way, and the preview hook (`useImagePreview`) takes the MIME type
// for the Blob it builds. No other file may spell these extensions.
//
// `.svg` is deliberately absent: it is source a user edits, not a raster to
// preview (the R3-339 decision, mirrored here). Unrecognised and non-image
// binary extensions return null and keep the text path's existing behaviour.

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/vnd.microsoft.icon',
};

/** The image MIME type for `path`'s extension (case-insensitive), or null when
 *  the file is not a recognised raster image. The LAST extension decides, so
 *  `x.png.exe` is not an image, and a dotfile (`.png`) has no extension. */
export function imageMimeForPath(path: string): string | null {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return IMAGE_MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}
