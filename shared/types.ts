export type Source = 'reported' | 'calculated' | 'estimated';
export type Value = number | string | null;
export interface Metric { label: string; value: Value; unit: string; source: Source; at: number | null; note?: string }
export type Metrics = Record<string, Metric>;
export interface Equipment { name: string; image: string; stones: string[] }
export interface Farm {
  id: string; segment: string; name: string; egg: string; at: number | null;
  metrics: Metrics; artifacts: Equipment[]; boosts: { name: string; until: number | null }[];
  forecast: { population: number; capacity: number; rate: number; until: number; at: number } | null;
  notes: string[];
}
export interface Member { id: string; name: string; me: boolean; metrics: Metrics; artifacts: Equipment[] }
export interface GoalReward { type: number | null; subtype: string | null; amount: Value }
export interface Contract {
  id: string; segment: string; name: string; coop: string | null; grade: string;
  at: number | null; checkedAt: number | null; endsAt: number | null;
  metrics: Metrics; goals: number[]; goalRewards?: GoalReward[]; members: Member[]; error: string | null;
}
export interface Snapshot { at: number; backupAt: number | null; name: string; stats: Metrics; home: Farm | null; farms: Farm[]; contracts: Contract[]; notes: string[] }
export interface Status { configured: boolean; maskedEid: string | null; interval: number; paused: boolean; collecting: boolean; lastAttempt: number | null; lastSuccess: number | null; nextPoll: number | null; error: string | null; demo: boolean }
export interface Dashboard { status: Status; snapshot: Snapshot | null }
export interface HistoryPoint { time: number; collectedAt: number; value: Value; segment: string; source: Source; gap: boolean; timeBasis?: 'source' | 'checked'; origin?: 'backup' | 'coop' }
export interface HistorySeries { entity: string; key: string; label: string; unit: string }
export interface HistoryResult { series: HistorySeries[]; points: HistoryPoint[] }
