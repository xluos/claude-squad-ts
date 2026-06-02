import { expect, test } from 'bun:test';
import { SerialQueue } from '../src/app/serial-queue.js';

test('SerialQueue runs entries one at a time in enqueue order', async () => {
  const q = new SerialQueue();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = q.enqueue(async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
  });
  const second = q.enqueue(async () => {
    events.push('second:start');
    events.push('second:end');
  });

  expect(first.position).toBe(0);
  expect(second.position).toBe(1);
  await tick();
  expect(events).toEqual(['first:start']);
  releaseFirst();
  await Promise.all([first.done, second.done]);
  expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  expect(q.size()).toBe(0);
});

test('SerialQueue continues after an entry fails', async () => {
  const q = new SerialQueue();
  const events: string[] = [];

  const first = q.enqueue(async () => {
    events.push('first');
    throw new Error('boom');
  });
  const second = q.enqueue(async () => {
    events.push('second');
  });

  await expect(first.done).rejects.toThrow('boom');
  await second.done;
  expect(events).toEqual(['first', 'second']);
  expect(q.isActive()).toBe(false);
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
