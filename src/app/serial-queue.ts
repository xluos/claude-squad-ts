export interface QueueEntry {
  id: number;
  /** 0 means this entry can start immediately; 1 means one active entry is ahead. */
  position: number;
  done: Promise<void>;
}

export class SerialQueue {
  private active = false;
  private pending: Array<{
    id: number;
    run: () => Promise<void>;
    resolve: () => void;
    reject: (err: unknown) => void;
  }> = [];
  private nextId = 1;

  isActive(): boolean {
    return this.active;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  size(): number {
    return (this.active ? 1 : 0) + this.pending.length;
  }

  enqueue(run: () => Promise<void>): QueueEntry {
    const id = this.nextId++;
    const position = this.size();
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const done = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.pending.push({ id, run, resolve, reject });
    void this.drain();
    return { id, position, done };
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      while (this.pending.length > 0) {
        const entry = this.pending.shift()!;
        try {
          await entry.run();
          entry.resolve();
        } catch (err) {
          entry.reject(err);
        }
      }
    } finally {
      this.active = false;
    }
  }
}
