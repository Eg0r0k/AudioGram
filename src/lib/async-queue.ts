export interface AsyncQueueOptions {
  useIdleCallback?: boolean;
  idleTimeout?: number;
}

export class AsyncQueue<T> {
  private queue: T[] = [];
  private running = false;
  private processor: (item: T) => Promise<void>;
  private options: Required<AsyncQueueOptions>;

  constructor(
    processor: (item: T) => Promise<void>,
    options: AsyncQueueOptions = {},
  ) {
    this.processor = processor;
    this.options = {
      useIdleCallback: false,
      idleTimeout: 5000,
      ...options,
    };
  }

  get size(): number { return this.queue.length; }
  get isRunning(): boolean { return this.running; }

  prepend(items: T[]): void {
    this.queue.unshift(...items);
    this.resume();
  }

  append(items: T[]): void {
    this.queue.push(...items);
    this.resume();
  }

  resume(): void {
    if (!this.running) this.drain();
  }

  stop(): void {
    this.running = false;
  }

  clear(): void {
    this.queue = [];
  }

  private async drain(): Promise<void> {
    this.running = true;

    while (this.queue.length > 0 && this.running) {
      const item = this.queue.shift()!;

      if (this.options.useIdleCallback) {
        await new Promise<void>(resolve =>
          requestIdleCallback(
            () => this.processor(item).then(resolve).catch(resolve),
            { timeout: this.options.idleTimeout },
          ),
        );
      }
      else {
        await this.processor(item).catch(() => {});
      }
    }

    this.running = false;
  }
}
