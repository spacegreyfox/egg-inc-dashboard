import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contract } from '../shared/types.ts';
import { metric } from '../server/calculations.ts';
import { milestoneEstimate, orderedContracts, selectedContractRun, type EstimateContext } from '../src/contract-progress.ts';
import { completionTime, estimateCountdown } from '../src/format.ts';

const now = 1_800_000_000_000;
const context: EstimateContext = { now, interval: 60, paused: false, connected: true };
function contract(overrides: Partial<Contract> = {}): Contract {
  return { id: 'sample', segment: 'sample:run-1', name: 'Sample contract', coop: 'sample-coop', grade: 'AAA', at: null, checkedAt: now, endsAt: now + 86400000, goals: [1000, 10000, 20000], members: [], error: null,
    metrics: { delivered: metric('Delivered', 100, 'eggs', 'reported', now), rate: metric('Rate', 1, 'eggs/s', 'reported', now), goal: metric('Final goal', 20000, 'eggs', 'reported', now) }, ...overrides };
}

test('ETA is anchored to the reading, while countdowns advance and reported milestones stay locked', () => {
  const c = contract(), first = milestoneEstimate(c, context), later = milestoneEstimate(c, { ...context, now: now + 60000 });
  assert.equal(first.goalNumber, 1); assert.equal(first.remaining, 900); assert.equal(first.estimatedAt, now + 900000);
  assert.equal(later.estimatedAt, first.estimatedAt); assert.equal(later.state, 'estimate');
  assert.equal(estimateCountdown(first.estimatedAt!,now),'15m'); assert.equal(estimateCountdown(later.estimatedAt!,now+60000),'14m');
  const past = milestoneEstimate(c, { ...context, now: now + 901000 });
  assert.equal(past.state, 'awaiting'); assert.equal(past.goalNumber, 1); assert.equal(c.metrics.delivered!.value, 100);
  c.metrics.delivered!.value = 1000;
  assert.equal(milestoneEstimate(c, context).goalNumber, 2);
  c.metrics.delivered!.value = 20000;
  assert.equal(milestoneEstimate(c, context).message, 'All goals reached');
  assert.equal(milestoneEstimate(c, context, 'final').message, 'Final goal reached');
});

test('new reports recalculate estimates and final estimates remain separately identified', () => {
  const c = contract();
  assert.equal(milestoneEstimate(c, context, 'final').estimatedAt, now + 19900000);
  c.metrics.delivered!.value = 500; c.metrics.delivered!.at = now + 60000; c.metrics.rate!.at = now + 60000;
  assert.equal(milestoneEstimate(c, { ...context, now: now + 60000 }).estimatedAt, now + 560000);
  assert.equal(milestoneEstimate(c, context).goalNumber, 1);
});

test('missing totals, goals, rates and timestamps never become zero or fabricated forecasts', () => {
  const c = contract();
  c.metrics.delivered!.value = null; assert.match(milestoneEstimate(c, context).message, /delivered eggs/);
  c.metrics.delivered!.value = 100; c.metrics.rate!.value = null; assert.match(milestoneEstimate(c, context).message, /delivery rate/);
  c.metrics.rate!.value = -1; assert.equal(milestoneEstimate(c, context).estimatedAt, null);
  c.metrics.rate!.value = 0; assert.equal(milestoneEstimate(c, context).state, 'no-rate');
  c.metrics.rate!.value = 1; c.metrics.delivered!.at = null; assert.match(milestoneEstimate(c, context).message, /timestamp/);
  c.metrics.delivered!.at = now; c.metrics.rate!.at = null; assert.equal(milestoneEstimate(c, context).estimatedAt, null);
  c.goals = []; assert.match(milestoneEstimate(c, context).message, /goals unavailable/);
});

test('stale, paused, disconnected and failed requests retain the absolute estimate without a live countdown', () => {
  const c = contract();
  for (const changes of [{ now: now + 300001 }, { paused: true }, { connected: false }, { collectionError: true }]) {
    const result = milestoneEstimate(c, { ...context, ...changes });
    assert.equal(result.estimatedAt, now + 900000); assert.equal(result.live, false); assert.ok(result.staleReason);
  }
  assert.equal(milestoneEstimate(c, { ...context, now: now + 300000 }).live, true);
  assert.equal(milestoneEstimate(c, { ...context, interval: 300, now: now + 500000 }).live, true);
  assert.equal(milestoneEstimate(c, { ...context, interval: 300, now: now + 600001 }).live, false);
  c.error = 'Co-op unavailable';
  assert.equal(milestoneEstimate(c, context).staleReason, 'Co-op request failed');
  assert.equal(milestoneEstimate(contract(), context).live, true);
});

test('deadline warnings and expired contracts never claim a reachable live completion', () => {
  const c = contract({ endsAt: now + 100000 });
  const result = milestoneEstimate(c, context);
  assert.equal(result.afterDeadline, true); assert.equal(result.message, 'After deadline at current rate');
  const expired = milestoneEstimate(c, { ...context, now: now + 100001 });
  assert.equal(expired.state, 'expired'); assert.equal(expired.live, false);
  const noRate = contract({endsAt:now-1}); noRate.metrics.rate!.value=null;
  assert.equal(milestoneEstimate(noRate,context).state,'expired');
  c.metrics.delivered!.value = 20000;
  assert.equal(milestoneEstimate(c, { ...context, now: now + 100001 }).state, 'complete');
});

test('all contracts are sorted without mutation and selection follows run identity', () => {
  const a = contract({ id: 'a', segment: 'a:1', endsAt: now + 2000 });
  const b = contract({ id: 'b', segment: 'b:1', endsAt: now + 1000 });
  const c = contract({ id: 'c', segment: 'c:1', endsAt: null });
  const d = contract({ id: 'd', segment: 'd:1', endsAt: now + 3000 });
  const all = [c, a, d, b];
  assert.deepEqual(orderedContracts(all).map(c => c.id), ['b', 'a', 'd', 'c']);
  assert.deepEqual(all.map(c => c.id), ['c', 'a', 'd', 'b']);
  assert.equal(selectedContractRun(all, ''), 'b:1');
  assert.equal(selectedContractRun(all, 'a:1'), 'a:1');
  assert.equal(selectedContractRun(all.filter(c => c.id !== 'a'), 'a:1'), 'b:1');
  assert.equal(selectedContractRun([{ ...a, segment: 'a:2' }, b], 'a:1'), 'b:1');
  assert.equal(selectedContractRun([], 'a:1'), '');
});

test('local completion labels distinguish today, tomorrow and other dates', () => {
  const today = new Date(2026, 9, 19, 20).getTime();
  assert.match(completionTime(new Date(2026, 9, 19, 23).getTime(), today), /^Today at /);
  assert.match(completionTime(new Date(2026, 9, 20, 1).getTime(), today), /^Tomorrow at /);
  assert.doesNotMatch(completionTime(new Date(2026, 9, 21, 1).getTime(), today), /^(Today|Tomorrow)/);
});

import { makeBackup, makeCoop } from '../server/demo.ts';
import { Collector } from '../server/collector.ts';
import { Store } from '../server/store.ts';
import { contractIdentity } from '../server/normalize.ts';
import { populationTracks, populationLines } from '../src/contract-population.ts';

test('multiple co-ops and a solo farm collect and retain independent members, runs and failures', async () => {
  const store = new Store(':memory:'); let clock = now, failSecond = false, backup = makeBackup(clock);
  const first = backup.contracts.contracts[0];
  const second = structuredClone(first); second.contract.identifier = 'sample-second'; second.contract.name = 'Second sample'; second.coopIdentifier = 'second-coop'; second.timeAccepted += 100;
  const solo = structuredClone(first); solo.contract.identifier = 'sample-solo'; solo.coopIdentifier = ''; solo.timeAccepted += 200;
  backup.contracts.contracts.push(second, solo);
  for (const local of [second, solo]) backup.farms.push({ ...structuredClone(backup.farms[1]), contractId: local.contract.identifier });
  const calls: string[] = [];
  const collector = new Collector(store, {
    backup: async () => backup,
    metadata: async () => ({}),
    coop: async (_eid, id, coop) => {
      calls.push(id); if (id === 'sample-second' && failSecond) throw new Error('Second co-op unavailable');
      const raw = makeCoop(clock); raw.contractIdentifier = id; raw.coopIdentifier = coop;
      raw.totalAmount = id === 'sample-second' ? 1200 : 500;
      raw.contributors[1].userName = id === 'sample-second' ? 'Second partner' : 'First partner';
      return raw;
    },
  }, () => clock);
  try {
    collector.configure({ eid: 'EI0000000000000000', interval: 60, paused: false });
    await collector.refresh();
    assert.equal(collector.view().snapshot?.contracts.length, 3);
    assert.equal(calls.length, 2);
    const initial = collector.view().snapshot!.contracts;
    assert.equal(initial.find(c => c.id === 'sample-second')?.members[1]?.name, 'Second partner');
    assert.equal(initial.find(c => c.id === 'sample-solo')?.members.length, 0);
    failSecond = true; clock += 61000; await collector.refresh();
    const contracts = collector.view().snapshot!.contracts;
    const broken = contracts.find(c => c.id === 'sample-second')!, healthy = contracts.find(c => c.id !== 'sample-second' && c.coop)!;
    assert.ok(broken.error); assert.equal(healthy.error, null);
    const liveContext = { ...context, now: clock };
    assert.equal(milestoneEstimate(broken, liveContext).live, false);
    assert.equal(milestoneEstimate(healthy, liveContext).live, true);
    const tracks = populationTracks(broken, undefined, broken.members[1]!.id);
    const other = populationTracks(healthy, undefined, healthy.members[1]!.id);
    assert.notEqual(tracks[0]?.entity, other[0]?.entity);
    assert.match(tracks[1]!.label, /Second/); assert.match(other[1]!.label, /First/);
    const points = store.history(tracks[0]!.entity, 'population', 0, clock).points;
    assert.ok(points.every(point => point.segment === contractIdentity(second).segment));
    const replay = { ...broken, segment: broken.segment + ':replay' };
    assert.ok(populationLines(populationTracks(replay, undefined, replay.members[1]!.id), { [tracks[0]!.entity]: points }, 0, clock)[0]!.points.every(point => point.segment === replay.segment));
    assert.equal(milestoneEstimate(contracts.find(c => !c.coop)!, liveContext).estimatedAt, null);
  } finally { collector.stop(); store.close(); }
});
