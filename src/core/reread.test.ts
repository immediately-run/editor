import { describe, expect, it } from "vitest";
import { judgeReread } from "./reread";

const base = {
  disk: "on-disk bytes",
  baseline: "opened bytes",
  lastWrite: { path: "/src/App.tsx", text: "written bytes" },
  activePath: "/src/App.tsx",
  openWrites: 0,
  seqAtStart: 3,
  seqNow: 3,
};

describe("judgeReread (R3-1163 — the re-read validity rule)", () => {
  it("a write open at resolution is void, even when disk equals the baseline", () => {
    expect(judgeReread({ ...base, openWrites: 1, disk: base.baseline })).toBe("void");
  });

  it("a write issued while the read was out (moved sequence) is void, even when disk equals our last write", () => {
    expect(judgeReread({ ...base, seqAtStart: 2, seqNow: 3 })).toBe("void");
    expect(judgeReread({ ...base, seqAtStart: 2, seqNow: 3, disk: base.lastWrite.text })).toBe("void");
  });

  it("disk equal to the baseline is unchanged (nothing to fold)", () => {
    expect(judgeReread({ ...base, disk: base.baseline })).toBe("unchanged");
  });

  it("disk equal to our last write's bytes is own-echo", () => {
    expect(judgeReread({ ...base, disk: base.lastWrite.text })).toBe("own-echo");
  });

  it("own-echo matches the path tolerant of a leading-slash mismatch", () => {
    expect(judgeReread({ ...base, disk: base.lastWrite.text, lastWrite: { path: "src/App.tsx", text: base.lastWrite.text } })).toBe("own-echo");
  });

  it("a last write to a DIFFERENT path is not our echo — external", () => {
    expect(
      judgeReread({ ...base, lastWrite: { path: "/src/Other.tsx", text: base.lastWrite.text } }),
    ).toBe("external");
  });

  it("anything else is external", () => {
    expect(judgeReread({ ...base })).toBe("external");
    expect(judgeReread({ ...base, lastWrite: null })).toBe("external");
  });

  it("the verdict order: void precedes unchanged and own-echo", () => {
    // disk equals BOTH the baseline and the last write; the moved sequence wins.
    expect(
      judgeReread({ ...base, disk: base.baseline, seqAtStart: 1, seqNow: 2 }),
    ).toBe("void");
  });
});
