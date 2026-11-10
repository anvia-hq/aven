export class ByteQueue {
  #chunks: Uint8Array[] = [];
  #length = 0;
  #waiter: (() => void) | undefined;
  #ended: Error | undefined;

  push(chunk: Uint8Array) {
    this.#chunks.push(chunk);
    this.#length += chunk.length;
    this.#wake();
  }

  end(error = new Error("The connection closed")) {
    this.#ended ??= error;
    this.#wake();
  }

  get length() {
    return this.#length;
  }

  #wake() {
    const waiter = this.#waiter;
    this.#waiter = undefined;
    waiter?.();
  }

  async take(count: number): Promise<Buffer> {
    while (this.#length < count) {
      if (this.#ended) throw this.#ended;
      await new Promise<void>((resolve) => {
        this.#waiter = resolve;
      });
    }
    return this.#shift(count);
  }

  #shift(count: number) {
    const out = Buffer.alloc(count);
    let filled = 0;
    while (filled < count) {
      const head = this.#chunks[0]!;
      const need = count - filled;
      if (head.length <= need) {
        out.set(head, filled);
        filled += head.length;
        this.#chunks.shift();
      } else {
        out.set(head.subarray(0, need), filled);
        this.#chunks[0] = head.subarray(need);
        filled += need;
      }
    }
    this.#length -= count;
    return out;
  }

  async takeSome(): Promise<Buffer> {
    while (this.#length === 0) {
      if (this.#ended) throw this.#ended;
      await new Promise<void>((resolve) => {
        this.#waiter = resolve;
      });
    }
    return this.#shift(this.#length);
  }

  rest() {
    return this.#length === 0 ? Buffer.alloc(0) : this.#shift(this.#length);
  }
}
