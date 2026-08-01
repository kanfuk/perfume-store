export async function runIncrementalBatch<T>(input: {
  items: readonly T[];
  keyOf: (item: T) => string;
  completed: ReadonlySet<string>;
  shouldContinue: () => boolean;
  process: (item: T) => Promise<void>;
  concurrency?: number;
}): Promise<{ processed: string[]; skipped: string[]; stopped: boolean }> {
  const concurrency = Math.max(1, Math.min(2, input.concurrency ?? 2));
  const queue = input.items.filter((item) => !input.completed.has(input.keyOf(item)));
  const skipped = input.items.filter((item) => input.completed.has(input.keyOf(item))).map(input.keyOf);
  const processed: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (input.shouldContinue()) {
      const index = cursor++;
      if (index >= queue.length) return;
      const item = queue[index];
      await input.process(item);
      processed.push(input.keyOf(item));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { processed, skipped, stopped: !input.shouldContinue() && cursor < queue.length };
}
