import { describe, it, expect } from 'vitest';
import {
  openBuffer,
  isDirty,
  canSave,
  applyEdit,
  applyExternalChange,
  applyExternalDelete,
  resolveKeepMine,
  resolveTakeTheirs,
  markSaved,
} from './buffer';

describe('buffer state machine', () => {
  it('opens clean and not dirty', () => {
    const b = openBuffer('/src/a.ts', 'hello');
    expect(isDirty(b)).toBe(false);
    expect(canSave(b)).toBe(false);
    expect(b.conflict).toBeNull();
    expect(b.vanished).toBe(false);
  });

  it('becomes dirty and savable on edit', () => {
    const b = applyEdit(openBuffer('/a', 'x'), 'xy');
    expect(isDirty(b)).toBe(true);
    expect(canSave(b)).toBe(true);
  });

  it('editing back to baseline is clean again', () => {
    let b = openBuffer('/a', 'x');
    b = applyEdit(b, 'xy');
    b = applyEdit(b, 'x');
    expect(isDirty(b)).toBe(false);
  });

  describe('external change (§6 conflict)', () => {
    it('clean buffer adopts an external change silently', () => {
      const b = applyExternalChange(openBuffer('/a', 'x'), 'y');
      expect(b.buffer).toBe('y');
      expect(b.baseline).toBe('y');
      expect(b.conflict).toBeNull();
      expect(isDirty(b)).toBe(false);
    });

    it('dirty buffer does NOT change and raises a blocking conflict', () => {
      let b = applyEdit(openBuffer('/a', 'base'), 'mine');
      b = applyExternalChange(b, 'theirs');
      // user keystrokes untouched:
      expect(b.buffer).toBe('mine');
      // blocking conflict raised, save refused:
      expect(b.conflict).toEqual({ theirs: 'theirs' });
      expect(canSave(b)).toBe(false);
    });

    it('dirty buffer where external bytes equal mine just re-baselines (no conflict)', () => {
      let b = applyEdit(openBuffer('/a', 'base'), 'same');
      b = applyExternalChange(b, 'same');
      expect(b.conflict).toBeNull();
      expect(isDirty(b)).toBe(false);
    });

    it('a second external change while already conflicting keeps the buffer untouched', () => {
      let b = applyEdit(openBuffer('/a', 'base'), 'mine');
      b = applyExternalChange(b, 'theirs1');
      b = applyExternalChange(b, 'theirs2');
      expect(b.buffer).toBe('mine');
      expect(b.conflict).toEqual({ theirs: 'theirs2' });
    });
  });

  describe('conflict resolution', () => {
    it('keep-mine lifts the block and a save overwrites theirs', () => {
      let b = applyEdit(openBuffer('/a', 'base'), 'mine');
      b = applyExternalChange(b, 'theirs');
      b = resolveKeepMine(b);
      expect(b.conflict).toBeNull();
      expect(b.buffer).toBe('mine');
      expect(b.baseline).toBe('theirs'); // baseline = disk, so still dirty
      expect(isDirty(b)).toBe(true);
      expect(canSave(b)).toBe(true);
    });

    it('take-theirs replaces the buffer and goes clean', () => {
      let b = applyEdit(openBuffer('/a', 'base'), 'mine');
      b = applyExternalChange(b, 'theirs');
      b = resolveTakeTheirs(b);
      expect(b.conflict).toBeNull();
      expect(b.buffer).toBe('theirs');
      expect(isDirty(b)).toBe(false);
      expect(canSave(b)).toBe(false);
    });

    it('resolving with no conflict is a no-op', () => {
      const b = applyEdit(openBuffer('/a', 'x'), 'xy');
      expect(resolveKeepMine(b)).toEqual(b);
      expect(resolveTakeTheirs(b)).toEqual(b);
    });
  });

  describe('vanished (§12.4)', () => {
    it('an external delete marks vanished and blocks save (no resurrection)', () => {
      let b = applyEdit(openBuffer('/a', 'base'), 'mine');
      b = applyExternalDelete(b);
      expect(b.vanished).toBe(true);
      expect(canSave(b)).toBe(false);
      // buffer preserved so the user can copy it out:
      expect(b.buffer).toBe('mine');
    });

    it('re-creating a vanished file adopts the new content', () => {
      let b = applyExternalDelete(openBuffer('/a', 'base'));
      b = applyExternalChange(b, 'recreated');
      expect(b.vanished).toBe(false);
      expect(b.buffer).toBe('recreated');
    });
  });

  it('markSaved re-baselines to the buffer (clean)', () => {
    let b = applyEdit(openBuffer('/a', 'base'), 'mine');
    b = markSaved(b);
    expect(b.baseline).toBe('mine');
    expect(isDirty(b)).toBe(false);
  });
});
