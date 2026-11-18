import { deleteDetachedPage, detachPage, restoreDetachedPage, type DocRecord } from "./db";

/** The undo timer starts only after detaching the page commits successfully. */
export class PendingDeletes {
  private pending = new Map<string, { docId: string; index: number }>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private finalizing = new Map<string, Promise<boolean>>();
  private disposed = false;

  constructor(
    private timeoutMs = 6000,
    private onError: (error: unknown) => void = () => {},
  ) {}
  get size() {
    return this.pending.size;
  }
  isPending(id: string) {
    return this.pending.has(id);
  }

  async remove(docId: string, id: string): Promise<DocRecord | null> {
    if (this.disposed || this.pending.has(id)) return null;
    const result = await detachPage(docId, id);
    if (!result) return null;
    this.pending.set(id, { docId, index: result.index });
    if (this.disposed) await this.finalize(id);
    else this.schedule(id);
    return result.doc;
  }

  async restore(id: string): Promise<DocRecord | null> {
    const item = this.pending.get(id);
    if (!item || this.disposed) return null;
    this.clearTimer(id);
    try {
      const doc = await restoreDetachedPage(item.docId, id, item.index);
      this.pending.delete(id);
      return doc;
    } catch (error) {
      if (!this.disposed) this.schedule(id);
      throw error;
    }
  }

  finalize(id: string): Promise<boolean> {
    this.clearTimer(id);
    const existing = this.finalizing.get(id);
    if (existing) return existing;
    if (!this.pending.has(id)) return Promise.resolve(false);
    const task = deleteDetachedPage(id)
      .then((deleted) => {
        this.pending.delete(id);
        return deleted;
      })
      .finally(() => this.finalizing.delete(id));
    this.finalizing.set(id, task);
    return task;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.timers.keys()) this.clearTimer(id);
    await Promise.all([...this.pending.keys()].map((id) => this.finalize(id)));
  }
  private schedule(id: string) {
    this.clearTimer(id);
    this.timers.set(
      id,
      setTimeout(() => {
        void this.finalize(id).catch(this.onError);
      }, this.timeoutMs),
    );
  }
  private clearTimer(id: string) {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
  }
}
