import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../src/queue.js';
import { QueueFullError } from '../src/errors.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setImmediate(r));

test('runs jobs FIFO within the concurrency limit', async () => {
  const q = createQueue({ concurrency: 1, maxDepth: 10 });
  const order = [];
  const gates = [deferred(), deferred(), deferred()];
  const tickets = gates.map((g, i) =>
    q.enqueue(async () => {
      order.push(`start${i}`);
      await g.promise;
      order.push(`end${i}`);
      return i;
    }),
  );
  await tick();
  assert.deepEqual(order, ['start0']);
  assert.equal(q.running(), 1);
  assert.equal(q.size(), 2);
  assert.equal(tickets[1].position(), 0);
  assert.equal(tickets[2].position(), 1);
  assert.equal(tickets[0].position(), -1);

  gates[0].resolve();
  await tick();
  assert.deepEqual(order, ['start0', 'end0', 'start1']);
  gates[1].resolve();
  gates[2].resolve();
  assert.deepEqual(await Promise.all(tickets.map((t) => t.promise)), [0, 1, 2]);
  assert.deepEqual(order, ['start0', 'end0', 'start1', 'end1', 'start2', 'end2']);
  assert.equal(q.running(), 0);
});

test('concurrency > 1 runs that many jobs at once', async () => {
  const q = createQueue({ concurrency: 2, maxDepth: 10 });
  const gate = deferred();
  let active = 0;
  let peak = 0;
  const job = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await gate.promise;
    active -= 1;
  };
  const tickets = [q.enqueue(job), q.enqueue(job), q.enqueue(job)];
  await tick();
  assert.equal(peak, 2);
  assert.equal(q.size(), 1);
  gate.resolve();
  await Promise.all(tickets.map((t) => t.promise));
  assert.equal(peak, 2);
});

test('rejects fast with QueueFullError beyond maxDepth', async () => {
  const q = createQueue({ concurrency: 1, maxDepth: 1 });
  const gate = deferred();
  const t1 = q.enqueue(() => gate.promise);
  const t2 = q.enqueue(() => 'second');
  assert.throws(() => q.enqueue(() => 'third', { estimatedWaitMs: 1234 }), (err) => {
    assert.ok(err instanceof QueueFullError);
    assert.equal(err.code, 'QUEUE_FULL');
    assert.equal(err.queueDepth, 1);
    assert.equal(err.maxDepth, 1);
    assert.equal(err.estimatedWaitMs, 1234);
    assert.equal(err.retryable, true);
    return true;
  });
  gate.resolve('first');
  assert.equal(await t1.promise, 'first');
  assert.equal(await t2.promise, 'second');
  // Depth is free again.
  assert.equal(await q.enqueue(() => 'fourth').promise, 'fourth');
});

test('aborting a waiting job removes it; an already-aborted signal throws synchronously', async () => {
  const q = createQueue({ concurrency: 1, maxDepth: 5 });
  const gate = deferred();
  q.enqueue(() => gate.promise);
  const ctl = new AbortController();
  const reason = new Error('caller gave up');
  const t = q.enqueue(() => 'never', { signal: ctl.signal });
  assert.equal(q.size(), 1);
  ctl.abort(reason);
  await assert.rejects(t.promise, reason);
  assert.equal(q.size(), 0);
  assert.equal(t.state, 'done');

  const pre = new AbortController();
  pre.abort(reason);
  assert.throws(() => q.enqueue(() => 'never', { signal: pre.signal }), reason);
  gate.resolve();
});

test('a job that throws rejects its ticket and frees the slot', async () => {
  const q = createQueue({ concurrency: 1, maxDepth: 5 });
  const boom = new Error('boom');
  const t1 = q.enqueue(() => {
    throw boom;
  });
  const t2 = q.enqueue(() => 'ok');
  await assert.rejects(t1.promise, boom);
  assert.equal(await t2.promise, 'ok');
  assert.equal(q.running(), 0);
});
