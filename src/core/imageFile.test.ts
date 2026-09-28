// The extension→MIME map behind the image overlay (R3-804). The map itself is
// the producer here, so literal inputs are the correct fixture (standards R2).

import { describe, it, expect } from 'vitest';
import { imageMimeForPath } from './imageFile';

describe('imageMimeForPath', () => {
  it.each([
    ['/assets/logo.png', 'image/png'],
    ['/assets/photo.jpg', 'image/jpeg'],
    ['/assets/photo.jpeg', 'image/jpeg'],
    ['/assets/anim.gif', 'image/gif'],
    ['/assets/pic.webp', 'image/webp'],
    ['/assets/pic.avif', 'image/avif'],
    ['/assets/pic.bmp', 'image/bmp'],
    ['/favicon.ico', 'image/vnd.microsoft.icon'],
  ])('maps %s to %s', (path, mime) => {
    expect(imageMimeForPath(path)).toBe(mime);
  });

  it('matches case-insensitively', () => {
    expect(imageMimeForPath('/assets/LOGO.PNG')).toBe('image/png');
    expect(imageMimeForPath('/assets/Photo.JpG')).toBe('image/jpeg');
  });

  it.each([
    '/src/App.tsx',
    '/assets/icon.svg', // source a user edits — the R3-339 decision
    '/assets/archive.zip',
    '/README',
    '/.png', // a dotfile has no extension
    '/dir.png/file', // the extension belongs to a directory segment
    '/x.png.exe', // the LAST extension decides
  ])('returns null for %s', (path) => {
    expect(imageMimeForPath(path)).toBeNull();
  });
});
