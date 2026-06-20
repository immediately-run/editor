import { describe, it, expect, vi, afterEach } from 'vitest';
import { debounce } from './debounce';

// A deterministic fake timer so the tests don't wait on wall-clock.
function fakeTimers() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    set: (cb: () => void) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    clear: (id: number) => {
      pending.delete(id);
    },
    fireAll: () => {
      for (const cb of [...pending.values()]) cb();
      pending.clear();
    },
    count: () => pending.size,
  };
}

describe('debounce', () => {
  it('coalesces rapid calls into one trailing call with the latest args', () => {
    const t = fakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 150, t);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    t.fireAll();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('flush() runs the pending call immediately (teardown §12.5)', () => {
    const t = fakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 150, t);
    d('x');
    expect(d.pending()).toBe(true);
    d.flush();
    expect(fn).toHaveBeenCalledWith('x');
    expect(d.pending()).toBe(false);
  });

  it('flush() with nothing pending is a no-op', () => {
    const t = fakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 150, t);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel() drops the pending call', () => {
    const t = fakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 150, t);
    d('x');
    d.cancel();
    expect(d.pending()).toBe(false);
    t.fireAll();
    expect(fn).not.toHaveBeenCalled();
  });

  // Regression: the DEFAULT timers (no injected `timers`) must schedule and fire.
  // The first cut stored bare `setTimeout`/`clearTimeout` and called them as
  // `timers.set(...)`, so in a browser `this` was the timers object → "Illegal
  // invocation" and the write was never scheduled (caught only in a real browser,
  // not jsdom). The wrappers fix the receiver; this guards the default path runs.
  describe('default timers (no injection)', () => {
    afterEach(() => vi.useRealTimers());
    it('schedules and fires using the global timers', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const d = debounce(fn, 150);
      d('hello');
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      expect(fn).toHaveBeenCalledExactlyOnceWith('hello');
    });
    it('flush() works on the default path', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const d = debounce(fn, 150);
      d('x');
      d.flush();
      expect(fn).toHaveBeenCalledWith('x');
    });
  });
});
