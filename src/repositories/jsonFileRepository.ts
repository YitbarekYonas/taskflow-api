import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Repository } from "./repository.js";

export class JsonFileRepository<T extends { id: number }> implements Repository<T> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly schema: z.ZodType<T>,
    private readonly migrate: (raw: unknown) => unknown = (raw) => raw
  ) {}

  // Runs fn only after every previously queued operation has finished
  private locked<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined); // a failure must not block the queue
    return run;
  }

  private async read(): Promise<T[]> {
    let text: string;
    try {
      text = await readFile(this.file, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error(`${this.file} is corrupted: expected a JSON array`);
    }
    return z.array(this.schema).parse(data.map((item) => this.migrate(item)));
  }

  private async write(items: T[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(items, null, 2));
    await rename(tmp, this.file); // replaces the old file in one step
  }

  findAll() {
    return this.locked(() => this.read());
  }

  findById(id: number) {
    return this.locked(async () => (await this.read()).find((i) => i.id === id));
  }

  insert(data: Omit<T, "id">) {
    return this.locked(async () => {
      const items = await this.read();
      const id = items.reduce((max, i) => Math.max(max, i.id), 0) + 1;
      const item = { ...data, id } as T;
      await this.write([...items, item]);
      return item;
    });
  }

  update(id: number, changes: Partial<Omit<T, "id">>) {
    return this.locked(async () => {
      const items = await this.read();
      const index = items.findIndex((i) => i.id === id);
      if (index === -1) return undefined;
      const updated = { ...items[index], ...changes } as T;
      items[index] = updated;
      await this.write(items);
      return updated;
    });
  }

  remove(id: number) {
    return this.locked(async () => {
      const items = await this.read();
      const found = items.find((i) => i.id === id);
      if (!found) return undefined;
      await this.write(items.filter((i) => i.id !== id));
      return found;
    });
  }
}