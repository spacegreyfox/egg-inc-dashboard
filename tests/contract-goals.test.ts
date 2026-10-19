import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalMilestones } from '../src/contract-goals.ts';

test('flags use actual goal positions and only reported delivery unlocks milestones', () => {
  const milestones = goalMilestones([5.9e15, 160e15, 250e15], '5900000000000000', 250e15);
  assert.equal(milestones[0]?.position, 2.36);
  assert.deepEqual(milestones.map(m => [m.position, m.reached, m.next]), [[2.36,true,false],[64,false,true],[100,false,false]]);
  assert.equal(milestones[1]?.remaining, 154.1e15);
  assert.ok(goalMilestones([10, 20], 25, 20).every(m => m.reached && !m.next && m.remaining === 0));
});

test('missing delivery and missing targets remain unavailable, while real zero is valid', () => {
  for (const missing of [null, undefined, '', 'invalid']) {
    assert.ok(goalMilestones([10, 20], missing, 20).every(m => m.reached === null && !m.next && m.remaining === null));
  }
  assert.equal(goalMilestones([10], 0, 10)[0]?.next, true);
  assert.equal(goalMilestones([10], 0, null)[0]?.position, null);
  assert.equal(goalMilestones([0, NaN, -1], 0, 20).length, 0);
});

test('closely spaced flags stack without moving their positions', () => {
  const milestones = goalMilestones([1, 2, 3, 50, 100], 0, 100);
  assert.deepEqual(milestones.map(m => [m.position, m.level]), [[1,0],[2,1],[3,2],[50,0],[100,0]]);
});
