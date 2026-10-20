import type { Contract, Farm, HistoryPoint, Metric } from '../shared/types.ts';
import type { HistoryLine } from './chart-data.ts';

export interface PopulationTrack {
  entity: string; segment: string; label: string; color: string;
  pointStyle: 'circle' | 'triangle'; metric?: Metric; capacity?: Metric; checkedAt: number | null;
  backup?: { entity: string; segment: string };
}

export function populationTracks(contract: Contract, farm: Farm | undefined, partnerId: string): PopulationTrack[] {
  const me = contract.members.find(m => m.me);
  const partner = contract.members.find(m => !m.me && m.id === partnerId);
  const tracks: PopulationTrack[] = [];
  if (me || farm) tracks.push({
    entity: me ? `member:${contract.id}:${me.id}` : farm!.id,
    segment: me ? contract.segment : farm!.segment,
    label: me ? `${me.name} (you)` : 'Your contract farm', color: '#79b7ff', pointStyle: 'circle',
    metric: me?.metrics.population ?? farm?.metrics.population, checkedAt: me ? contract.checkedAt : null,
    capacity: me ? me.metrics.capacity : farm?.metrics.capacity,
    backup: me && farm ? { entity: farm.id, segment: farm.segment } : undefined,
  });
  if (partner) tracks.push({
    entity: `member:${contract.id}:${partner.id}`, segment: contract.segment,
    label: partner.name, color: '#f38d93', pointStyle: 'triangle',
    metric: partner.metrics.population, capacity: partner.metrics.capacity, checkedAt: contract.checkedAt,
  });
  return tracks;
}

export function populationLines(tracks: PopulationTrack[], histories: Record<string, HistoryPoint[]>, from: number, to: number): HistoryLine[] {
  return tracks.map(track => {
    const origin = track.entity.startsWith('member:') ? 'coop' as const : 'backup' as const;
    const points = (histories[track.entity] ?? []).filter(p => p.segment === track.segment && p.time >= from && p.time <= to).map(p => ({ ...p, origin }));
    // A cached current reading is a real observation even before the first
    // historical sample is recorded. Never invent earlier values or timestamps.
    const at = track.metric?.at ?? track.checkedAt;
    if (!points.length && track.metric?.value != null && at != null && at >= from && at <= to) points.push({
      time: at, collectedAt: track.checkedAt ?? at, value: track.metric.value,
      segment: track.segment, source: track.metric.source, gap: true,
      timeBasis: track.metric.at == null ? 'checked' : 'source',
      origin,
    });
    // The player's own backup history may predate member tracking. Merge only
    // the matching run, keeping each reading's original clock and provenance.
    const backupPoints = track.backup ? (histories[track.backup.entity] ?? [])
      .filter(p => p.segment === track.backup!.segment && p.time >= from && p.time <= to)
      .map(p => ({ ...p, segment: track.segment, origin: 'backup' as const })) : [];
    const combined = [...new Map([...backupPoints, ...points].map(p => [p.time, p])).values()].sort((a, b) => a.time - b.time);
    return { id: track.entity, label: track.label, color: track.color, pointStyle: track.pointStyle, points: combined };
  });
}
