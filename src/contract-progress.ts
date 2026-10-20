import type { Contract, Value } from '../shared/types.ts';

export interface EstimateContext { now: number; interval: number; paused: boolean; connected: boolean; collectionError?: boolean; lastSuccess?: number | null }
export interface MilestoneEstimate {
  goalNumber: number | null; target: number | null; remaining: number | null;
  observedAt: number | null; estimatedAt: number | null;
  state: 'estimate' | 'complete' | 'unavailable' | 'no-rate' | 'awaiting' | 'expired';
  message: string; staleReason: string | null; live: boolean; afterDeadline: boolean;
}
function number(value: Value | undefined): number | null {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function time(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 && value <= 8.64e15 ? value : null;
}
export function orderedContracts(contracts: Contract[]): Contract[] {
  return [...contracts].sort((a, b) => (time(a.endsAt) ?? Infinity) - (time(b.endsAt) ?? Infinity) || a.name.localeCompare(b.name) || a.segment.localeCompare(b.segment));
}
export function selectedContractRun(contracts: Contract[], selected: string): string {
  return contracts.some(contract => contract.segment === selected) ? selected : orderedContracts(contracts)[0]?.segment ?? '';
}
export function lastContractCheck(contract: Contract, context?: EstimateContext): number | null {
  return time(contract.checkedAt) ?? (!contract.coop ? time(context?.lastSuccess) : null);
}
export function milestoneEstimate(contract: Contract, context: EstimateContext, mode: 'next' | 'final' = 'next'): MilestoneEstimate {
  const goals = contract.goals.map((target, index) => ({ target, number: index + 1 })).filter(goal => Number.isFinite(goal.target) && goal.target > 0);
  const delivered = number(contract.metrics.delivered?.value);
  const goal = mode === 'final' ? goals.at(-1) : delivered == null ? goals[0] : goals.find(goal => goal.target > delivered);
  const fallbackTarget = mode === 'final' ? number(contract.metrics.goal?.value) : null;
  const target = mode === 'final' && fallbackTarget != null && fallbackTarget > 0 ? fallbackTarget : goal?.target ?? null;
  const deliveredAt = time(contract.metrics.delivered?.at), rateAt = time(contract.metrics.rate?.at);
  const observedAt = deliveredAt != null && rateAt != null ? Math.min(deliveredAt, rateAt) : deliveredAt;
  const threshold = Math.max(300000, (Number.isFinite(context.interval) && context.interval > 0 ? context.interval : 60) * 2000);
  const staleReason = !context.connected ? 'Disconnected' : context.paused ? 'Collection paused' : contract.error ? 'Co-op request failed' : context.collectionError ? 'Collection request failed' : observedAt != null && context.now - observedAt > threshold ? 'Reading is stale' : null;
  const result: MilestoneEstimate = {
    goalNumber: goal?.number ?? null, target, remaining: delivered != null && target != null ? Math.max(0, target - delivered) : null,
    observedAt, estimatedAt: null, state: 'unavailable', message: 'Milestone goals unavailable', staleReason, live: false, afterDeadline: false,
  };
  if ((mode === 'next' && goals.length && delivered != null && !goal) || (mode === 'final' && target != null && delivered != null && delivered >= target)) {
    return { ...result, remaining: 0, state: 'complete', staleReason: null, message: mode === 'final' ? 'Final goal reached' : 'All goals reached' };
  }
  const deadline = time(contract.endsAt);
  const unavailable = (message: string, state: 'unavailable' | 'no-rate' = 'unavailable'): MilestoneEstimate => ({ ...result, state: deadline != null && deadline <= context.now ? 'expired' : state, message: deadline != null && deadline <= context.now ? 'Contract deadline passed' : message });
  if (target == null) return unavailable(result.message);
  if (delivered == null) return unavailable('Awaiting reported delivered eggs');
  const rate = number(contract.metrics.rate?.value);
  if (rate == null) return unavailable('Awaiting reported delivery rate');
  if (rate === 0) return unavailable('No progress at the reported rate', 'no-rate');
  if (deliveredAt == null || rateAt == null) return unavailable('Observation timestamp unavailable');
  result.observedAt = Math.min(deliveredAt, rateAt);
  // Absolute time is anchored to the delivered reading, never to the render clock.
  result.estimatedAt = deliveredAt + result.remaining! / rate * 1000;
  if (time(result.estimatedAt) == null) return { ...result, estimatedAt: null, message: 'Completion time unavailable' };
  result.afterDeadline = deadline != null && result.estimatedAt > deadline;
  if (deadline != null && deadline <= context.now) return { ...result, state: 'expired', message: 'Contract deadline passed' };
  if (result.estimatedAt <= context.now) return { ...result, state: 'awaiting', message: 'Awaiting updated progress' };
  return { ...result, state: 'estimate', message: result.afterDeadline ? 'After deadline at current rate' : 'At the last reported rate', live: result.staleReason == null };
}
