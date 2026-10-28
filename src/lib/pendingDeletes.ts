// Soft-delete lifecycle for document pages: a page leaves the order immediately,
// its record is erased only when the undo window ends, and undo re-inserts it at
// its original index in the *current* order. All operations are idempotent so
// duplicate timers, repeated cleanup, or undo-after-finalize are safe no-ops.
import { deletePage } from "./db";
import { reinsertAt, removeId } from "./docOps";

export class PendingDeletes {
  /** pageId -> original index in the order at deletion time. */
  private pending = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private finalized = new Set<string>();
  private disposed = false;

  constructor(private timeoutMs = 6000) {}

  get size() {
    return this.pending.size;
  }

  isPending(id: string) {
    return this.pending.has(id);
  }

  /**
   * Start a soft delete. Returns the new order without the page, or the same
   * array when the id is unknown or already pending (no duplicate timers).
   */
  softDelete(ids: string[], id: string): string[] {
    if (this.disposed || this.pending.has(id)) return ids;
    const index = ids.indexOf(id);
    if (index < 0) return ids;
    this.pending.set(id, index);
    this.timers.set(
      id,
      setTimeout(() => void this.finalize(id), this.timeoutMs),
    );
    return removeId(ids, id);
  }

  /**
   * Undo a pending delete. Returns the order with the page re-inserted at its
   * original index (clamped to the current length), or null when there is
   * nothing to undo (unknown id, already finalized, or already undone).
   */
  undo(ids: string[], id: string): string[] | null {
    const index = this.pending.get(id);
    if (index === undefined) return null;
    this.pending.delete(id);
    this.clearTimer(id);
    return reinsertAt(ids, index, id);
  }

  /**
   * Permanently erase the page record. Runs at most once per id and never
   * after an undo or a dispose. Returns true when it actually deleted.
   */
  async finalize(id: string): Promise<boolean> {
    this.clearTimer(id);
    if (!this.pending.delete(id)) return false;
    if (this.disposed || this.finalized.has(id)) return false;
    this.finalized.add(id);
    await deletePage(id);
    return true;
  }

  /**
   * Unmount cleanup: finalize every pending delete straight to the database
   * (the undo toast is gone, so keeping the records would orphan them) and
   * cancel all timers. Never touches React state. Safe to call repeatedly.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.timers.keys()) this.clearTimer(id);
    for (const id of [...this.pending.keys()]) {
      this.pending.delete(id);
      if (!this.finalized.has(id)) {
        this.finalized.add(id);
        void deletePage(id);
      }
    }
  }

  private clearTimer(id: string) {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
  }
}
