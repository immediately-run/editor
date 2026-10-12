// R3-1163 — the re-read validity rule, at the hook level: typing at any cadence
// never raises the §6 conflict bar when the editor is the only writer, while a
// real foreign write still does. The fs-change batches come from the real
// `onFsChange` listener the hook registered, fed the shape `SandboxListener`
// pushes (a `paths` array and an epoch) — never by calling `reread` directly.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFileBuffer } from "./useFileBuffer";

// --- the working-tree port, hand-resolved ------------------------------------
// Every read and write lands in a queue the TEST resolves, so the overlap
// windows (a write issued while a read is out) are constructed, not raced.
interface PendingRead {
  path: string;
  resolve: (text: string) => void;
}
interface PendingWrite {
  path: string;
  text: string;
  resolve: () => void;
}

const port = {
  files: new Map<string, string>(),
  pendingReads: [] as PendingRead[],
  pendingWrites: [] as PendingWrite[],
  writes: [] as Array<{ path: string; text: string }>,
  reset() {
    this.files.clear();
    this.pendingReads.length = 0;
    this.pendingWrites.length = 0;
    this.writes.length = 0;
  },
  read(path: string): Promise<string> {
    // ALWAYS hand-resolved: the overlap windows under test are constructed by
    // resolving reads in a chosen order, never by racing the map.
    return new Promise((resolve) => this.pendingReads.push({ path, resolve }));
  },
  write(path: string, text: string): Promise<void> {
    this.writes.push({ path, text });
    return new Promise((resolve) => this.pendingWrites.push({ path, text, resolve }));
  },
  resolveRead(index: number, text: string) {
    const pending = this.pendingReads.splice(index, 1)[0];
    expect(pending, `pending read #${index}`).toBeDefined();
    pending.resolve(text);
  },
  resolveWrite(index: number) {
    const w = this.pendingWrites.splice(index, 1)[0];
    expect(w, `pending write #${index}`).toBeDefined();
    this.files.set(w.path, w.text);
    w.resolve();
  },
};

const wtPath = (rel: string) => `/wt${rel.startsWith("/") ? "" : "/"}${rel}`;

vi.mock("@immediately-run/sdk", () => ({
  useMounts: () => [{ id: "wt", type: "worktree", path: "/wt", mode: "rw" }],
  getMounts: () => [{ id: "wt", type: "worktree", path: "/wt", mode: "rw" }],
  getAppMountPath: () => "/app",
  onFsChange: (listener: (c: { paths: string[]; epoch: number }) => void) => {
    fsChangeListeners.add(listener);
    return () => fsChangeListeners.delete(listener);
  },
}));

// Captured onFsChange listeners (the SDK mock above adds/removes here).
const fsChangeListeners = new Set<
  (c: { paths: string[]; epoch: number }) => void
>();
const emitFsChange = (paths: string[], epoch: number) => {
  for (const l of [...fsChangeListeners]) l({ paths, epoch });
};

vi.mock("../fs/mountFs", () => ({
  fsAvailable: () => true,
  readFileText: (path: string) => port.read(path),
  readFileBytes: () => Promise.reject(new Error("no bytes in this suite")),
  writeFileText: (path: string, t: string) => port.write(path, t),
  exists: (p: string) => Promise.resolve(port.files.has(p)),
}));

const FILE = "/src/App.tsx";
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("useFileBuffer — the re-read validity rule (R3-1163)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    port.reset();
    fsChangeListeners.clear();
    warnSpy.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Open FILE (load read hand-resolved to `initial`) — the clean baseline. */
  const openFile = async (initial: string) => {
    const h = renderHook(() => useFileBuffer(FILE));
    await settle();
    port.resolveRead(0, initial); // the load effect's read
    await settle();
    expect(h.result.current.buffer?.baseline).toBe(initial);
    expect(h.result.current.buffer?.buffer).toBe(h.result.current.buffer?.baseline);
    return h;
  };

  const flushDebounce = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
  };

  it("the reproduction: keystroke 2 lands a write inside keystroke 1's re-read — no conflict, and B still reaches the port", async () => {
    const h = await openFile("A0");

    // 1. Keystroke 1; after the 150 ms debounce, write A is issued (unresolved).
    act(() => h.result.current.setText("A1"));
    await flushDebounce();
    expect(port.writes).toEqual([{ path: wtPath(FILE), text: "A1" }]);
    const writeA = port.pendingWrites[0];

    // 2. Keystroke 2 lands before A settles: the buffer moves on, the baseline
    //    is still A0 (A's `then` will skip markSaved).
    act(() => h.result.current.setText("A2"));
    await settle();

    // 3. A settles; endWrite drains nothing yet — the echo announcement arrives.
    writeA.resolve();
    await settle();
    expect(h.result.current.buffer?.baseline).toBe("A0");

    // 4. The echo starts a re-read; keystroke 2's debounce fires while it is
    //    out: write B is issued and lastWriteRef becomes B.
    emitFsChange([FILE], 1);
    await settle();
    act(() => h.result.current.setText("A2"));
    await flushDebounce();
    expect(port.writes.map((w) => w.text)).toEqual(["A1", "A2"]);

    // 5. The read resolves with A — a write of ours was issued mid-read, so the
    //    verdict is void; B's settle drains the deferred re-read, whose bytes
    //    are B's own echo. No conflict; B reached the port.
    port.resolveRead(0, "A1");
    await settle();
    port.resolveWrite(1);
    await settle();
    await settle();

    expect(h.result.current.buffer?.conflict).toBeNull();
    expect(port.files.get(wtPath(FILE))).toBe("A2");
    expect(port.writes.map((w) => w.text)).toEqual(["A1", "A2"]);
  });

  it("the torn variant: the read resolves with B's bytes cut to A's length — still void, no conflict", async () => {
    const h = await openFile("A0");
    act(() => h.result.current.setText("AA11"));
    await flushDebounce();
    const writeA = port.pendingWrites[0];
    act(() => h.result.current.setText("AA22"));
    await settle();
    writeA.resolve();
    await settle();
    emitFsChange([FILE], 1);
    await settle();
    act(() => h.result.current.setText("AA22"));
    await flushDebounce();
    // The read resolves with B's bytes cut to A's length (a torn mid-write read).
    port.resolveRead(0, "AA22".slice(0, "AA11".length));
    await settle();
    port.resolveWrite(1);
    await settle();
    await settle();

    expect(h.result.current.buffer?.conflict).toBeNull();
    expect(port.files.get(wtPath(FILE))).toBe("AA22");
  });

  it("a foreign write to a dirty buffer with none of our writes open or issued raises the conflict, and the warn line says why without the text", async () => {
    const h = await openFile("A0");
    act(() => h.result.current.setText("mine"));
    await flushDebounce();
    port.resolveWrite(0);
    await settle();
    // The user keeps typing AFTER the save settled: the buffer is dirty with no
    // write open. A foreign writer lands different bytes on disk.
    act(() => h.result.current.setText("mine plus more"));
    await settle();
    port.files.set(wtPath(FILE), "THEIRS");
    emitFsChange([FILE], 2);
    await settle();
    port.resolveRead(0, "THEIRS");
    await settle();
    await settle();

    const conflict = h.result.current.buffer?.conflict;
    expect(conflict).toEqual({ theirs: "THEIRS" });
    const foreignWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("judged external"),
    );
    expect(foreignWarns).toHaveLength(1);
    const line = String(foreignWarns[0][0]);
    expect(line).toContain(FILE);
    expect(line).toContain("writeSeq");
    expect(line).not.toContain("mine");
    expect(line).not.toContain("THEIRS");
  });

  it("a foreign write announced while our write is open is deferred and picked up by the drained re-run", async () => {
    const h = await openFile("A0");
    act(() => h.result.current.setText("mine"));
    await flushDebounce();
    // Our write is open (unresolved). A foreign write lands on disk and the
    // announcement arrives while it is open: the pre-await defer holds it.
    emitFsChange([FILE], 3);
    await settle();
    // The user keeps typing after the save settles (buffer dirty again), then the
    // write resolves; the drain re-reads and sees the foreign bytes.
    act(() => h.result.current.setText("mine 2"));
    port.resolveWrite(0);
    await settle();
    port.resolveRead(0, "THEIRS");
    await settle();
    await settle();

    expect(h.result.current.buffer?.conflict).toEqual({ theirs: "THEIRS" });
  });

  it("a clean buffer folding its own echo stays clean (no regression on the quiet path)", async () => {
    const h = await openFile("A0");
    act(() => h.result.current.setText("A1"));
    await flushDebounce();
    port.resolveWrite(0);
    await settle();
    emitFsChange([FILE], 4);
    await settle();
    port.resolveRead(0, "A1");
    await settle();
    await settle();

    const b = h.result.current.buffer;
    expect(b?.conflict).toBeNull();
    expect(b?.buffer).toBe(b?.baseline);
    expect(b?.baseline).toBe("A1");
  });
});
