/** The re-read validity rule (R3-1163): a re-read of the active file counts only
 *  if no write of ours was open or issued between its start and its resolution —
 *  a read that overlaps our own write is either history (the echo of an earlier
 *  save) or torn (the bytes another write of ours is mid-way through replacing),
 *  and no comparison of its bytes can say which. This is the single decision the
 *  `useFileBuffer` hook maps onto the §6 buffer machine; it lives here, pure and
 *  unit-tested, per the pure-core rule.
 *
 *  Verdicts, checked in this order:
 *  - `void` — a write of ours was open at resolution, or one was issued while the
 *    read was out. The read says nothing; it must be re-run, never dropped (the
 *    announcement that started it may still be a real foreign write).
 *  - `unchanged` — disk equals the buffer's baseline: nothing to fold.
 *  - `own-echo` — disk is exactly the bytes of our last write: our echo, never a
 *    foreign change, even if the user has typed since.
 *  - `external` — anything else: a foreign writer, judged against the buffer's
 *    dirty state by the caller. */

import { samePath } from './samePath';

export type RereadVerdict = 'void' | 'unchanged' | 'own-echo' | 'external';

export interface RereadInput {
  /** The bytes the re-read brought back from disk. */
  disk: string;
  /** The buffer's baseline (the bytes a save would currently be based on). */
  baseline: string;
  /** The bytes and path of our most recent write, or null if we never wrote. */
  lastWrite: { path: string; text: string } | null;
  /** The repo-relative path this re-read is for. */
  activePath: string;
  /** How many of our writes to this path are open (issued, unresolved) now. */
  openWrites: number;
  /** The write sequence number captured when the read started. */
  seqAtStart: number;
  /** The write sequence number now (at resolution). */
  seqNow: number;
}

export function judgeReread(opts: RereadInput): RereadVerdict {
  if (opts.openWrites > 0 || opts.seqAtStart !== opts.seqNow) return 'void';
  if (opts.disk === opts.baseline) return 'unchanged';
  const lw = opts.lastWrite;
  if (lw && samePath(lw.path, opts.activePath) && opts.disk === lw.text) return 'own-echo';
  return 'external';
}
