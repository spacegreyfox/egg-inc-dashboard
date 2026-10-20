import type { HistoryPoint, Value } from '../shared/types.ts';

export interface HistoryLine {
  id: string;
  label: string;
  color: string;
  pointStyle?: 'circle' | 'triangle';
  points: HistoryPoint[];
}

function numeric(value: Value | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function habitatUsage(population: Value | undefined, capacity: Value | undefined) {
  const used = numeric(population), total = numeric(capacity);
  if (used == null || total == null || used < 0 || total <= 0) return null;
  const occupied = Math.min(used, total);
  return { occupied, available: Math.max(0, total - used), percent: occupied / total * 100 };
}

export function habitatStatus(population: Value | undefined, capacity: Value | undefined) {
  const usage = habitatUsage(population, capacity);
  if (!usage) return null;
  const isFull = Number(population) >= Number(capacity);
  // Rounded compact counts or percentages must never imply a farm is full.
  return { ...usage, isFull, label: (isFull ? 100 : Math.min(99.9, usage.percent)).toFixed(1) + '%' };
}

export interface TrendDatum {
  x: number;
  y: number | null;
  original?: HistoryPoint;
  gapBefore: boolean;
}

// These counters can reset within an otherwise unchanged farm/run identifier.
const cumulative = /^(prestiges|drones|eliteDrones|boostsUsed|piggyBreaks|goldEarned|goldSpent|lifetimeCash|contribution|delivered|eggsLaid|eggsShipped|eggTotal)/;

function decreased(value: Value, before: Value): boolean {
  if (typeof value === 'string' && typeof before === 'string' && /^\d+$/.test(value) && /^\d+$/.test(before)) return BigInt(value) < BigInt(before);
  return Number(value) < Number(before);
}

export function trendData(points: HistoryPoint[], metricKey = ''): TrendDatum[] {
  const data: TrendDatum[] = [];
  let previous: HistoryPoint | undefined;
  for (const point of points) {
    const value = numeric(point.value), before = numeric(previous?.value);
    const reset = cumulative.test(metricKey) && value != null && before != null && decreased(point.value, previous!.value);
    const newRun = previous != null && previous.segment !== point.segment;
    if (newRun || reset) data.push({ x: point.time, y: null, gapBefore: false });
    data.push({ x: point.time, y: value, original: point, gapBefore: !!previous && point.gap && !newRun && !reset && before != null && value != null });
    previous = point;
  }
  return data;
}
