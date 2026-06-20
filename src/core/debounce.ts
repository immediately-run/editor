// A trailing debounce with explicit flush/cancel — the editor's SOLE timing knob.
//
// We debounce the WRITE to the rw working-tree port (keystroke coalescing), NOT
// compilation: the host recompiles immediately whenever its ZenFS watch observes
// a write to the port (host `recompileMode:'immediate'`). So this is decoupled
// from `recompileDelay` — there is no compile debounce to match (editor-as-app
// plan Phase 04 §3, as amended). Local CodeMirror view-state stays at 0 hops; only
// the persisted write is coalesced.
//
// `flush()` exists for teardown (spec §12.5): a pending write at a branch-switch
// remount / grant revocation must be flushed-before-unmount, never silently
// dropped, leaving the buffer and the working tree diverged.

export interface Debounced<A extends unknown[]> {
  /** Schedule a call with the latest args, resetting the timer. */
  (...args: A): void;
  /** Run any pending call now (e.g. before teardown). No-op if nothing pending. */
  flush(): void;
  /** Drop any pending call without running it. */
  cancel(): void;
  /** Is a call currently scheduled? */
  pending(): boolean;
}

/** Keystroke-coalescing default. Independent of the host's `recompileDelay`. */
export const DEFAULT_WRITE_DEBOUNCE_MS = 150;

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number = DEFAULT_WRITE_DEBOUNCE_MS,
  // Injectable timers so tests don't depend on wall-clock.
  timers: {
    set: (cb: () => void, ms: number) => number;
    clear: (id: number) => void;
  } = { set: setTimeout as never, clear: clearTimeout as never },
): Debounced<A> {
  let timer: number | null = null;
  let lastArgs: A | null = null;

  const run = () => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    if (lastArgs) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== null) timers.clear(timer);
    timer = timers.set(run, waitMs);
  }) as Debounced<A>;

  debounced.flush = run;
  debounced.cancel = () => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    lastArgs = null;
  };
  debounced.pending = () => timer !== null;

  return debounced;
}
