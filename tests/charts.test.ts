import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HistoryPoint, Value } from '../shared/types.ts';
import { habitatStatus, habitatUsage, trendData } from '../src/chart-data.ts';

const point = (time: number, value: Value, extra: Partial<HistoryPoint> = {}): HistoryPoint => ({ time, collectedAt: time + 100, value, segment: 'farm-a', source: 'reported', gap: false, ...extra });

test('habitat slices respond to saved population and purchased capacity', () => {
  assert.deepEqual(habitatUsage('250', '1000'), { occupied: 250, available: 750, percent: 25 });
  assert.deepEqual(habitatUsage(50, 100), { occupied: 50, available: 50, percent: 50 });
  assert.deepEqual(habitatUsage(50, 200), { occupied: 50, available: 150, percent: 25 });
  assert.deepEqual(habitatUsage(0, 100), { occupied: 0, available: 100, percent: 0 });
  assert.deepEqual(habitatUsage(100, 100), { occupied: 100, available: 0, percent: 100 });
  assert.deepEqual(habitatUsage(110, 100), { occupied: 100, available: 0, percent: 100 });
});

test('unknown or invalid habitat inputs never produce a fake empty or full chart', () => {
  for (const [population, capacity] of [[undefined, 100], [20, null], ['', 100], [20, 0], [20, NaN], [-1, 100], ['bad', 100]] as const) assert.equal(habitatUsage(population, capacity), null);
});

test('full habitats require actual known population and capacity, not rounded display values', () => {
  assert.equal(habitatStatus('12000000000', '12000000000')?.isFull, true);
  assert.equal(habitatStatus(101, 100)?.isFull, true);
  assert.equal(habitatStatus(99996, 100000)?.isFull, false);
  assert.equal(habitatStatus(99996, 100000)?.label, '99.9%');
  assert.equal(habitatStatus(100000, 100000)?.label, '100.0%');
  assert.equal(habitatStatus(0, 100)?.isFull, false);
  assert.equal(habitatStatus(null, 100), null);
  assert.equal(habitatStatus(100, null), null);
  assert.equal(habitatStatus(0, 0), null);
});

test('trend lines connect same-run observations and distinguish collection gaps', () => {
  const points = [point(1000, 10, { gap: true }), point(2000, 20), point(5000, 30, { gap: true })];
  const data = trendData(points, 'population');
  assert.deepEqual(data.map(p => p.y), [10, 20, 30]);
  assert.deepEqual(data.map(p => p.gapBefore), [false, false, true]);
  assert.equal(data[2]?.original, points[2]);
  assert.deepEqual(data.map(p => p.x), [1000, 2000, 5000]);
});

test('farm changes and missing readings remain real breaks in the line', () => {
  const data = trendData([point(1000, 10), point(2000, 5, { segment: 'farm-b', gap: true }), point(3000, null, { segment: 'farm-b' }), point(4000, 7, { segment: 'farm-b', gap: true })], 'population');
  assert.deepEqual(data.map(p => p.y), [10, null, 5, null, 7]);
  assert.ok(data.every(p => !p.gapBefore));
  assert.equal(trendData([point(1000, 'bad')])[0]?.y, null);
});

test('cumulative counter resets break the line, while ordinary decreases connect', () => {
  const points = [point(1000, 20), point(2000, 5, { gap: true })];
  assert.deepEqual(trendData(points, 'eggsLaid').map(p => p.y), [20, null, 5]);
  assert.deepEqual(trendData(points, 'cash').map(p => p.y), [20, 5]);
  const exact = [point(1000, '9007199254740993'), point(2000, '9007199254740992')];
  const data = trendData(exact, 'goldEarned');
  assert.equal(data.length, 3);
  assert.equal(data[0]?.original?.value, '9007199254740993');
  assert.equal(data[2]?.original?.value, '9007199254740992');
});
