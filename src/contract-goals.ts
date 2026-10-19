import type { Value } from '../shared/types.ts';

export function goalMilestones(goals: number[], delivered: Value | undefined, finalGoal: Value | undefined) {
  const reported = delivered == null || delivered === '' ? NaN : Number(delivered);
  const total = Number.isFinite(reported) && reported >= 0 ? reported : null;
  const target = finalGoal == null || finalGoal === '' ? NaN : Number(finalGoal);
  let nextAssigned = false;
  const placed: { position: number; level: number }[] = [];
  return goals.flatMap((goal, index) => {
    if (!Number.isFinite(goal) || goal <= 0) return [];
    const position = Number.isFinite(target) && target > 0 ? Math.min(100, goal / target * 100) : null;
    const reached = total == null ? null : total >= goal;
    const next = reached === false && !nextAssigned;
    if (next) nextAssigned = true;
    let level = 0;
    // Keep flags at their true positions, stacking pennants for close goals.
    if (position != null) {
      while (placed.some(p => Math.abs(p.position - position) < 10 && p.level === level)) level++;
      placed.push({ position, level });
    }
    return [{ number: index + 1, target: goal, position, level, reached, next, remaining: total == null ? null : Math.max(0, goal - total) }];
  });
}
