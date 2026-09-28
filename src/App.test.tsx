// React-surface smoke tests for the editor app. The SDK channels and the
// working-tree port are mocked so the readiness states (§12.7) render without a
// live sandbox. The decision logic itself is covered by the pure core suites
// (buffer / readiness / diagnostics / debounce).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

// --- SDK mock ---------------------------------------------------------------
const editorContext = {
  activeFile: null as string | null,
  openFiles: [] as string[],
  dirtyPaths: [] as string[],
};
const mounts: unknown[] = [];

// R3-388 — the subpath the caret listener rides. The REAL `sandboxUtils` cannot load
// under vitest (tsup emits extensionless specifiers), which the file explorer's suite
// records for the same import. Mocking it also gives this suite a controllable
// host→app channel.
const rawListeners = new Map<string, Set<(m: unknown) => void>>();
vi.mock("@immediately-run/sdk/sandboxUtils", () => ({
  addListener: (type: string, handler: (m: unknown) => void) => {
    const set = rawListeners.get(type) ?? new Set<(m: unknown) => void>();
    set.add(handler);
    rawListeners.set(type, set);
    readyOrder.push(`subscribe:${type}`);
    return () => set.delete(handler);
  },
}));

// R3-392 — the app's readiness report is the host's gate for releasing a caret
// request to a frame that was still booting when the user clicked. The real module
// imports the real `sandboxUtils` (same extensionless specifier), so mock it, and
// record its order relative to the listener subscription: "ready" must mean
// "listening", or the released one-shot is lost exactly as before.
const readyOrder: string[] = [];
vi.mock("@immediately-run/sdk/ready", () => ({
  reportReady: () => {
    readyOrder.push("ready");
  },
}));

vi.mock("@immediately-run/sdk", () => ({
  useEditorContext: () => editorContext,
  useHostTheme: () => "dark",
  useFormFactor: () => ({
    class: "desktop",
    orientation: "landscape",
    width: 1280,
    height: 800,
  }),
  useDiagnostics: () => ({
    buildErrors: [],
    consoleEntries: [],
    provenance: null,
  }),
  useMounts: () => mounts,
  getMounts: () => mounts,
  getAppMountPath: () => "/app",
  setActiveFile: vi.fn(() => Promise.resolve()),
  closeFile: vi.fn(() => Promise.resolve()),
  // The fs-change subscription captures its listener; a test emits a batch by
  // calling every captured listener (see the R3-804 re-read case).
  onFsChange: vi.fn((listener: (c: { paths: string[]; epoch: number }) => void) => {
    fsChangeListeners.add(listener);
    return () => fsChangeListeners.delete(listener);
  }),
}));

// Captured onFsChange listeners (the SDK mock above adds/removes here).
const fsChangeListeners = new Set<
  (c: { paths: string[]; epoch: number }) => void
>();

// --- working-tree port mock --------------------------------------------------
const fs = {
  available: false,
  files: new Map<string, string>(),
  bytes: new Map<string, Uint8Array>(),
  textReads: [] as string[],
};
vi.mock("./fs/mountFs", () => ({
  fsAvailable: () => fs.available,
  readFileText: (p: string) => {
    fs.textReads.push(p);
    return fs.files.has(p)
      ? Promise.resolve(fs.files.get(p)!)
      : Promise.reject(new Error("ENOENT"));
  },
  readFileBytes: (p: string) =>
    fs.bytes.has(p)
      ? Promise.resolve(fs.bytes.get(p)!)
      : Promise.reject(new Error("ENOENT")),
  writeFileText: (p: string, t: string) => {
    fs.files.set(p, t);
    return Promise.resolve();
  },
  exists: (p: string) => Promise.resolve(fs.files.has(p) || fs.bytes.has(p)),
}));

import App from "./App";

beforeEach(() => {
  editorContext.activeFile = null;
  editorContext.openFiles = [];
  editorContext.dirtyPaths = [];
  fs.available = false;
  fs.files.clear();
  fs.bytes.clear();
  fs.textReads.length = 0;
  fsChangeListeners.clear();
});

describe("R3-392 — readiness report gates caret delivery", () => {
  it("reports ready to the host only AFTER the caret listener is subscribed", () => {
    readyOrder.length = 0;
    fs.available = true;
    editorContext.activeFile = "/src/App.tsx";
    render(<App />);
    expect(readyOrder).toContain("ready");
    expect(readyOrder.indexOf("subscribe:editor-selection")).toBeGreaterThanOrEqual(0);
    expect(readyOrder.indexOf("subscribe:editor-selection")).toBeLessThan(
      readyOrder.indexOf("ready"),
    );
  });
});

describe("App readiness states", () => {
  it('shows "awaiting port" when the working tree has not attached', () => {
    fs.available = false;
    editorContext.activeFile = "/src/App.tsx";
    render(<App />);
    expect(
      screen.getByText(/connecting to the working tree/i),
    ).toBeInTheDocument();
  });

  it('shows "no file open" when the port is up but nothing is focused', () => {
    fs.available = true;
    editorContext.activeFile = null;
    render(<App />);
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
  });

  it("does not render a tab strip for the open files", () => {
    fs.available = true;
    editorContext.openFiles = ["/src/App.tsx", "/src/main.tsx"];
    editorContext.activeFile = "/src/App.tsx";
    fs.files.set("/app/src/App.tsx", "export default 1;");
    render(<App />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("main.tsx")).not.toBeInTheDocument();
  });
});

describe("R3-804 — image overlay", () => {
  it("shows an image file as an image, never through the text buffer", async () => {
    fs.available = true;
    fs.bytes.set("/app/assets/logo.png", new Uint8Array([137, 80, 78, 71]));
    editorContext.activeFile = "/assets/logo.png";
    const { container } = render(<App />);
    const img = await screen.findByRole("img", { name: "logo.png" });
    expect(img).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    // The bytes never went through the UTF-8 text read, and no editor mounted.
    expect(fs.textReads).not.toContain("/app/assets/logo.png");
    expect(container.querySelector(".cm-host")).not.toBeInTheDocument();
    // R-IX-7 — the settle is announced through a live region, not only painted.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing image logo.png",
    );
    // The caption names the file and the read-only truth.
    expect(container.querySelector(".ed-image-caption")).toHaveTextContent(
      "logo.png",
    );
    expect(container.querySelector(".ed-image-caption")).toHaveTextContent(
      "read-only",
    );
  });

  it("keeps the EditorView mounted under the overlay across text→image→text", async () => {
    fs.available = true;
    fs.files.set("/app/src/App.tsx", "export default 1;");
    fs.bytes.set("/app/assets/logo.png", new Uint8Array([1, 2, 3]));
    editorContext.activeFile = "/src/App.tsx";
    const { container, rerender } = render(<App />);
    await vi.waitFor(() => {
      expect(container.querySelector(".cm-host")).toHaveTextContent(
        "export default 1",
      );
    });
    const hostBefore = container.querySelector(".cm-host");

    // Switch to the image: the overlay covers the SAME editor host, which is
    // now inert and hidden from the accessibility tree — not unmounted.
    editorContext.activeFile = "/assets/logo.png";
    rerender(<App />);
    await screen.findByRole("img", { name: "logo.png" });
    const wrap = container.querySelector(".ed-cm-wrap");
    expect(wrap).toHaveAttribute("inert");
    expect(wrap).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".cm-host")).toBe(hostBefore);

    // Switch back: the overlay lifts, the editor is usable, and it is still
    // the same host node — no teardown/buildup happened anywhere.
    editorContext.activeFile = "/src/App.tsx";
    rerender(<App />);
    await vi.waitFor(() => {
      expect(container.querySelector(".ed-cm-wrap")).not.toHaveAttribute(
        "inert",
      );
    });
    expect(container.querySelector(".cm-host")).toBe(hostBefore);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("a failed image read names the path when the file still exists", async () => {
    fs.available = true;
    // Present to exists() via the text map, unreadable as bytes.
    fs.files.set("/app/assets/logo.png", "not really an image");
    editorContext.activeFile = "/assets/logo.png";
    render(<App />);
    await screen.findByText(/could not open this file/i);
    expect(screen.getByText(/\/assets\/logo\.png/)).toBeInTheDocument();
  });

  it("a missing image gets the vanished state, not mojibake", async () => {
    fs.available = true;
    editorContext.activeFile = "/assets/gone.png";
    render(<App />);
    await screen.findByText(/this file was removed/i);
    expect(
      screen.getByText(/deleted or renamed elsewhere/i),
    ).toBeInTheDocument();
  });

  it("re-reads and re-renders the shown image on an fs-change batch (R-IX-4)", async () => {
    fs.available = true;
    fs.bytes.set("/app/assets/logo.png", new Uint8Array([1]));
    editorContext.activeFile = "/assets/logo.png";
    render(<App />);
    const img = await screen.findByRole("img", { name: "logo.png" });
    const srcBefore = img.getAttribute("src");

    // An external write to the shown image: the host's batch names its path.
    fs.bytes.set("/app/assets/logo.png", new Uint8Array([2, 2]));
    act(() => {
      fsChangeListeners.forEach((l) =>
        l({ paths: ["/assets/logo.png"], epoch: 1 }),
      );
    });

    // The re-read builds a NEW object URL (the setup stub is counter-backed),
    // so a swapped src proves the re-render; the old one was revoked.
    await vi.waitFor(() => {
      expect(
        screen.getByRole("img", { name: "logo.png" }).getAttribute("src"),
      ).not.toBe(srcBefore);
    });
  });
});
