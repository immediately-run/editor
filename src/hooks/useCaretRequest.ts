// R3-388 — the host's one-shot "put the caret here" message.
//
// Not a channel field. The editor-context payload is de-duped at the source by value
// equality, so a `selection` carried there would mean a SECOND click on the same
// diagnostic pushes nothing and the affordance is dead on reuse. The host therefore
// sends a discrete message, exactly as it sends `viewed-reveal` to the file explorer,
// and the `nonce` is what makes a repeat distinguishable.
//
// Read through the generic `addListener` rather than a typed SDK export, matching how
// the explorer consumes `viewed-reveal`. That is also why this needs no SDK version
// floor: the message is not part of the SDK's surface.
import { useEffect, useState } from "react";
import { addListener } from "@immediately-run/sdk/sandboxUtils";
import { reportReady } from "@immediately-run/sdk/ready";

export interface CaretRequest {
  path: string;
  line: number;
  column?: number;
  nonce: number;
}

/** Validate defensively: this arrives over a host message, and a consumer should
 *  never have to re-check what a hook handed it. Anything malformed is ignored
 *  outright rather than partially applied — a caret in the wrong place is worse than
 *  a caret that did not move. */
const parse = (m: Record<string, unknown>): CaretRequest | null => {
  if (typeof m.path !== "string" || !m.path) return null;
  if (typeof m.line !== "number" || !Number.isFinite(m.line) || m.line < 1)
    return null;
  if (typeof m.nonce !== "number" || !Number.isFinite(m.nonce)) return null;
  const column =
    typeof m.column === "number" && Number.isFinite(m.column) && m.column >= 1
      ? m.column
      : undefined;
  return {
    path: m.path,
    line: m.line,
    nonce: m.nonce,
    ...(column !== undefined ? { column } : {}),
  };
};

export function useCaretRequest(): CaretRequest | null {
  const [request, setRequest] = useState<CaretRequest | null>(null);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    try {
      dispose = addListener(
        "editor-selection",
        (m: Record<string, unknown>) => {
          const parsed = parse(m);
          if (parsed) setRequest(parsed);
        },
      );
      // The host holds a caret request issued while this frame was still booting and
      // releases it on the app's readiness report — `ir.interactive` fires at the SDK
      // root's first commit, well before this listener exists, and a one-shot sent
      // then is simply lost (TOOLS_ACTIVITY_SPEC §8.2). Report only once the
      // listener is live, so "ready" means "listening".
      reportReady();
    } catch {
      // No host transport — a standalone `vite dev` render. The editor still works;
      // nothing sends caret requests.
    }
    return () => dispose?.();
  }, []);
  return request;
}
