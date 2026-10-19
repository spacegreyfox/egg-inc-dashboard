import { type Raw } from './api.ts';
import { farmFromBackup, metric, num, timestamp } from './calculations.ts';
import { equipment } from './equipment.ts';
import { createHash } from 'node:crypto';
import type { Contract, Farm, Member, Metrics, Snapshot } from '../shared/types.ts';

export function contractIdentity(local: Raw) {
  const id = local.contract?.identifier ?? local.contractIdentifier;
  return { id, segment: `contract:${id}:${local.timeAccepted ?? '?'}:${local.coopIdentifier ?? 'solo'}` };
}
export function activeContracts(backup: Raw): Raw[] {
  return (backup.contracts?.contracts ?? []).filter((c: Raw) => c.accepted !== false && !c.cancelled && !c.coopContributionFinalized && (c.contract?.identifier ?? c.contractIdentifier));
}
export function normalize(backup: Raw, coops: Map<string, {raw: Raw; checkedAt: number}>, errors: Map<string,string>, metadata: Raw, eid: string, now: number): Snapshot {
  const at = timestamp(backup.approxTime);
  const stats: Metrics = {};
  const add = (key: string,label: string,value: any,unit = '') => stats[key] = metric(label,value,unit,'reported',at);
  const s = backup.stats ?? {}, g = backup.game ?? {};
  add('soulEggs','Soul eggs',g.soulEggsD ?? g.soulEggs,'eggs'); add('prophecyEggs','Eggs of Prophecy',g.eggsOfProphecy,'eggs');
  add('truthEggs','Eggs of Truth',backup.virtue?.eovEarned ? backup.virtue.eovEarned.reduce((a:number,b:number)=>a+b,0) : undefined,'eggs');
  add('lifetimeCash','Lifetime cash earned',g.lifetimeCashEarned,'bocks');
  add('goldEarned','Golden eggs earned',g.goldenEggsEarned,'golden eggs'); add('goldSpent','Golden eggs spent',g.goldenEggsSpent,'golden eggs');
  add('prestiges','Prestiges',s.numPrestiges); add('drones','Drone takedowns',s.droneTakedowns); add('eliteDrones','Elite drone takedowns',s.droneTakedownsElite);
  add('boostsUsed','Boosts used',s.boostsUsed); add('piggyBreaks','Piggy breaks',s.numPiggyBreaks);
  add('piggyBank','Piggy bank',g.piggyBank,'golden eggs');
  (s.eggTotals ?? []).forEach((total: number,i: number) => add(`eggTotal${i}`,'Saved egg total · '+(i+1),total,'eggs'));
  const farms: Farm[] = (backup.farms ?? []).filter((f: Raw) => f.farmType === 2 || f.farmType === 3).map((f: Raw) => farmFromBackup(backup,f,backup.farms.indexOf(f),metadata,now));
  const contracts: Contract[] = activeContracts(backup).map((local: Raw) => {
    const { id,segment } = contractIdentity(local), cached = coops.get(segment), raw = cached?.raw;
    const definition = local.contract ?? metadata.contracts?.contracts?.find((c: Raw) => c.identifier === id) ?? {};
    const grade = definition.gradeSpecs?.find((g: Raw) => g.grade === (raw?.grade ?? local.grade));
    const goals = (grade?.goals ?? definition.goals ?? []).filter((g:Raw)=>g.type === 1 || g.type == null).map((g: Raw) => num(g.targetAmount)).filter((n:any):n is number=>n!=null);
    const farm = farms.find((f: any) => f.id === `farm:${id}`);
    const members: Member[] = (raw?.contributors ?? []).map((c: Raw) => {
      const time = timestamp(c.farmInfo?.timestamp), p = c.productionParams ?? {};
      return { id: createHash('sha256').update(String(c.uuid ?? c.userId ?? c.userName)).digest('hex').slice(0,16), name: c.userName ?? 'Unnamed farmer', me: c.userId === eid || c.userId === local.coopUserId,
        artifacts: equipment(c.farmInfo?.equippedArtifacts ?? []).items,
        metrics: {
          contribution:metric('Delivered',c.contributionAmount,'eggs','reported',time),
          rate:metric('Reported delivery rate',c.contributionRate,'eggs/s','reported',time),
          population:metric('Population',p.farmPopulation,'chickens','reported',time),
          capacity:metric('Habitat capacity',p.farmCapacity,'chickens','reported',time),
          tokens:metric('Tokens',c.boostTokens,'tokens','reported',time),
        },
      };
    });
    // No co-op status exists yet for a solo / not-yet-joined farm.
    const observed = raw ? cached!.checkedAt : farm?.at ?? at;
    const total = raw ? num(raw.totalAmount) : num(farm?.metrics.eggsShipped?.value);
    const rates = members.map(m=>num(m.metrics.rate?.value));
    const rate = rates.length && rates.every(n=>n!=null) ? rates.reduce((a,b)=>a!+b!,0) : null;
    const remaining = raw ? num(raw.secondsRemaining) : null;
    const endsAt = remaining != null ? cached!.checkedAt + remaining*1000 : timestamp(local.coopSimulationEndTime ?? local.coopSharedEndTime);
    const target = goals.at(-1);
    const secondsToGoal = total != null && target != null && rate != null && rate > 0 ? Math.max(0,(target-total)/rate) : null;
    return {
      id,segment,name:definition.name ?? id,coop:local.coopIdentifier || null,grade:['—','C','B','A','AA','AAA'][raw?.grade ?? local.grade ?? 0] ?? '—',
      at:raw ? null : observed, checkedAt:cached?.checkedAt ?? null,endsAt,goals,members,error:errors.get(segment) ?? null,
      metrics:{
        delivered:metric('Reported delivered eggs',total,'eggs','reported',observed),
        rate:metric('Reported delivery rate',rate,'eggs/s','reported',observed),
        goal:metric('Final goal',target,'eggs','reported',at),
        eta:metric('Time to final goal',secondsToGoal,'seconds','estimated',observed,'Assumes the last reported combined delivery rate stays constant. Boost expiry, growth, and silo exhaustion can change the result.'),
      },
    };
  });
  return {at:now,backupAt:at,name:backup.userName || 'Your farm',stats,home:farms.find(f=>f.id === 'home') ?? null,farms,contracts,notes:[]};
}
