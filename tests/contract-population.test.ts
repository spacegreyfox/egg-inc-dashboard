import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { makeBackup, makeCoop } from '../server/demo.ts';
import { normalize, contractIdentity } from '../server/normalize.ts';

const now = 1_800_000_000_000;
function snapshot(at: number, options: { failed?: boolean; relativeTime?: boolean; population?: number; run?: number } = {}) {
  const backup = makeBackup(at), raw = makeCoop(at);
  if (options.run) backup.contracts.contracts[0].timeAccepted = options.run;
  if (options.relativeTime) for (const member of raw.contributors) member.farmInfo.timestamp = -332.5;
  if (options.population != null) raw.contributors[0].productionParams.farmPopulation = options.population;
  const { segment } = contractIdentity(backup.contracts.contracts[0]);
  return normalize(backup, new Map([[segment, { raw, checkedAt: at }]]), new Map(options.failed ? [[segment, 'Unavailable']] : []), {}, 'EI0000000000000000', at);
}

test('co-op populations without usable farm timestamps are recorded at check time', () => {
  const store = new Store(':memory:');
  try {
    const initial = snapshot(now, { relativeTime: true });
    store.save(initial, 60);
    const contract = initial.contracts[0]!, member = contract.members[0]!;
    const result = store.history(`member:${contract.id}:${member.id}`, 'population', 0, now);
    assert.equal(member.metrics.population?.at, null);
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0]?.time, now);
    assert.equal(result.points[0]?.timeBasis, 'checked');
    assert.equal(result.points[0]?.value, 11340000000);
    // Re-fetching an identical response must not fabricate changed samples.
    store.save({ ...initial, at: now + 60000, contracts: [{ ...contract, checkedAt: now + 60000 }] }, 60);
    assert.equal(store.history(`member:${contract.id}:${member.id}`, 'population', 0, now + 60000).points.length, 1);
    store.save(snapshot(now + 120000, { relativeTime: true, population: 11400000000 }), 60);
    const changed = store.history(`member:${contract.id}:${member.id}`, 'population', 0, now + 120000).points;
    assert.equal(changed.length, 2);
    assert.equal(changed[1]?.time, now + 120000);
    assert.equal(changed[1]?.gap, false);
  } finally { store.close(); }
});

test('member history retains source timestamps and excludes failed co-op reads', () => {
  const store = new Store(':memory:');
  try {
    const initial = snapshot(now), contract = initial.contracts[0]!, member = contract.members[0]!;
    store.save(initial, 60);
    store.save(snapshot(now + 60000, { failed: true }), 60);
    const points = store.history(`member:${contract.id}:${member.id}`, 'population', 0, now + 60000).points;
    assert.equal(points.length, 1);
    assert.equal(points[0]?.time, now - 120000);
    assert.equal(points[0]?.timeBasis, 'source');
    store.save(snapshot(now + 120000, { relativeTime: true, run: 1800000000 }), 60);
    const runs = store.history(`member:${contract.id}:${member.id}`, 'population', 0, now + 120000).points;
    assert.notEqual(runs[0]?.segment, runs[1]?.segment);
    assert.equal(runs[1]?.gap, true);
  } finally { store.close(); }
});

import { populationTracks, populationLines } from '../src/contract-population.ts';
import type { HistoryPoint } from '../shared/types.ts';

const reading = (time: number, value: number, segment: string): HistoryPoint => ({ time, collectedAt: time, value, segment, source: 'reported', gap: false });

test('comparison keeps blue for you and red for the selected partner regardless of member order', () => {
  const initial = snapshot(now), contract = initial.contracts[0]!;
  contract.members.reverse();
  const partner = contract.members.find(m => m.name === 'Clover')!;
  const tracks = populationTracks(contract, undefined, partner.id);
  assert.equal(tracks.length, 2);
  assert.match(tracks[0]!.label, /you/);
  assert.equal(tracks[0]!.color, '#79b7ff');
  assert.equal(tracks[0]!.pointStyle, 'circle');
  assert.equal(tracks[1]!.label, 'Clover');
  assert.equal(tracks[1]!.color, '#f38d93');
  assert.equal(tracks[1]!.pointStyle, 'triangle');
});

test('comparison preserves independent clocks, filters runs and reuses only matching own-backup history', () => {
  const initial = snapshot(now, { relativeTime: true }), contract = initial.contracts[0]!, farm = initial.farms.find(f => f.id !== 'home')!;
  const tracks = populationTracks(contract, farm, contract.members[1]!.id);
  const histories = {
    [tracks[0]!.entity]: [reading(now - 1000, 200, contract.segment), reading(now - 10000, 9999, 'older-contract-run')],
    [tracks[1]!.entity]: [reading(now - 5000, 400, contract.segment)],
    [farm.id]: [reading(now - 2000, 100, farm.segment), reading(now - 15000, 9999, 'previous-farm-run')],
  };
  const lines = populationLines(tracks, histories, now - 20000, now);
  assert.deepEqual(lines[0]!.points.map(p => [p.time, p.value, p.origin]), [[now - 2000, 100, 'backup'], [now - 1000, 200, 'coop']]);
  assert.deepEqual(lines[1]!.points.map(p => [p.time, p.value]), [[now - 5000, 400]]);
  assert.ok(lines[0]!.points.every(p => p.segment === contract.segment));
});

test('initial comparison uses one actual cached observation and never invents missing partner history', () => {
  const initial = snapshot(now, { relativeTime: true }), contract = initial.contracts[0]!;
  const tracks = populationTracks(contract, undefined, contract.members[1]!.id);
  const lines = populationLines(tracks, {}, now - 3600000, now);
  assert.equal(lines[0]!.points.length, 1);
  assert.equal(lines[1]!.points.length, 1);
  assert.equal(lines[1]!.points[0]?.time, now);
  assert.equal(lines[1]!.points[0]?.timeBasis, 'checked');
  tracks[1]!.metric = { ...tracks[1]!.metric!, value: null };
  assert.equal(populationLines(tracks, {}, 0, now)[1]!.points.length, 0);
  assert.ok(populationLines(tracks, {}, now + 1, now + 1000).every(line => line.points.length === 0));
});

test('a solo contract can show the saved farm without a co-op or partner', () => {
  const initial = snapshot(now), contract = { ...initial.contracts[0]!, members: [], coop: null }, farm = initial.farms.find(f => f.id !== 'home')!;
  const tracks = populationTracks(contract, farm, '');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]!.entity, farm.id);
  assert.equal(populationLines(tracks, {}, 0, now)[0]!.points[0]?.origin, 'backup');
  assert.deepEqual(populationTracks(contract, undefined, ''), []);
});

test('population comparison stays at two population series while capacity remains available separately', () => {
  const initial = snapshot(now), contract = initial.contracts[0]!, farm = initial.farms.find(f => f.id !== 'home')!;
  farm.metrics.capacity!.value = 15000000000;
  const tracks = populationTracks(contract, farm, contract.members[1]!.id);
  assert.equal(tracks[0]?.capacity?.value, 12000000000);
  assert.equal(tracks[1]?.capacity?.value, 12000000000);
  const lines = populationLines(tracks, {}, 0, now);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(line => line.points[0]?.value), [11340000000, 11200000000]);
  assert.ok(lines.every(line => !line.label.includes('capacity')));
});
