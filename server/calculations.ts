import research from '../vendor/researches.json';
import customEggs from '../vendor/custom-eggs.json';
import { proto, type Raw } from './api.ts';
import { equipment, equipped } from './equipment.ts';
import type { Farm, Metric, Source, Value } from '../shared/types.ts';

export const num = (v: any): number | null => v == null || !Number.isFinite(Number(v)) ? null : Number(v);
export const timestamp = (s: any) => num(s) != null && Number(s) > 0 ? Number(s) * 1000 : null;
export const metric = (label: string, value: Value | undefined, unit: string, source: Source, at: number | null, note?: string): Metric => ({ label, value: value === undefined || typeof value === 'number' && !Number.isFinite(value) ? null : value, unit, source, at, note });
const habs = [250,500,1000,2000,5000,10000,20000,50000,100000,200000,500000,1e6,2e6,5e6,1e7,2.5e7,5e7,1e8,6e8];
const vehicles = [5000,15000,50000,100000,250000,500000,1e6,5e6,15e6,30e6,50e6,50e6].map(v => v / 60);
const values = [0,.25,1.25,6.25,30,150,700,3000,12500,50000,175000,525000,1500000,1e7,1e9,1e11,1e12,1.5e13,1e14,1e-7];
const specials: Record<number, number> = {100:5,101:.05,102:.1,103:4.99,104:.99};
export function eggName(id: number, custom?: string) { return custom || (proto.lookupEnum('ei.Egg').valuesById[id] ?? 'Unknown').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, s => s.toUpperCase()); }
const levels = (items: Raw[] = []) => new Map(items.map(r => [r.id, Number(r.level ?? 0)]));
// Older saves retain these identifiers, but the current reference formulas do
// not consume them. Do not alias them to current research with different IDs.
// Reference: wasmegg-carpet/egg@6e118a7, lib/farm/farm.ts:researches.
const compatibilityEpicIds = new Set(['epic_silo_quality', 'warp_shift']);

export function farmFromBackup(backup: Raw, farm: Raw, index: number, metadata: Raw, now: number): Farm {
  const at = timestamp(farm.lastStepTime) ?? timestamp(backup.approxTime);
  const local = backup.contracts?.contracts?.find((c: Raw) => (c.contract?.identifier ?? c.contractIdentifier) === farm.contractId);
  const spec = local?.contract;
  const grade = spec?.gradeSpecs?.find((g: Raw) => g.grade === local.grade);
  const custom = [...(metadata.contracts?.customEggs ?? []), ...customEggs].find((e: Raw) => e.identifier === (spec?.customEggId ?? local?.customEggId));
  const cr = levels(farm.commonResearch), er = levels(backup.game?.epicResearch);
  const { items: artifacts, effects: afx, valid: knownArtifacts } = equipment(equipped(backup, index));
  const notes: string[] = [];
  const knownResearch = new Set(research.map(r => r.id));
  const unknownCommon = [...cr].filter(([id,level]) => level > 0 && !knownResearch.has(id)).map(([id])=>id);
  const unknownEpic = [...er].filter(([id,level]) => level > 0 && !knownResearch.has(id) && !compatibilityEpicIds.has(id)).map(([id])=>id);
  const artifactIssue = knownArtifacts ? undefined : 'An equipped artifact or stone is not recognized; its effect cannot be calculated.';
  const enlightenmentIssue = farm.eggType === 19 ? 'Enlightenment artifact/clarity calculations are not yet verified.' : undefined;
  const epicIssue = unknownEpic.length ? `Unsupported epic research: ${unknownEpic.join(', ')}.` : undefined;
  const commonIssue = unknownCommon.length ? `Unsupported common research: ${unknownCommon.join(', ')}.` : undefined;
  const equipmentIssue = artifactIssue ?? enlightenmentIssue ?? (!backup.game ? 'The save is missing player upgrade data.' : undefined);
  const researchIssue = commonIssue ?? epicIssue;
  const farmIssue = equipmentIssue ?? researchIssue;
  const earningsIssue = equipmentIssue ?? epicIssue;
  for (const issue of [equipmentIssue,commonIssue,epicIssue]) if (issue) notes.push(issue);
  // Absent repeated protobuf lists mean no purchases. They are not a missing
  // scalar value. Common research cannot invalidate the independent EB formula.
  const valid = !farmIssue;
  const level = (id: string, epic = false) => (epic ? er : cr).get(id) ?? 0;
  const multiplier = (category: string, filter: (r: any) => boolean = () => true) => research.filter(r => r.categories.split(',').includes(category) && r.effect_type === 'multiplicative' && filter(r)).reduce((v, r) => {
    const n = level(r.id, r.type === 'epic');
    return v * (r.levels_compound === 'multiplicative' ? Math.pow(r.per_level, n) : 1 + r.per_level * n);
  }, 1);
  const buffs: Record<number, number> = {};
  for (const egg of [...(metadata.contracts?.customEggs ?? []), ...customEggs].filter((e: Raw, i: number, all: Raw[]) => all.findIndex(a => a.identifier === e.identifier) === i)) {
    let max = Math.max(0, ...(backup.contracts?.colleggtibleMaxFarmSizeReached ?? []).filter((m: Raw) => m.eggId === egg.identifier).map((m: Raw) => Number(m.maxFarmSizeReached)));
    for (const c of [...(backup.contracts?.contracts ?? []), ...(backup.contracts?.archive ?? [])]) if (c.contract?.customEggId === egg.identifier) max = Math.max(max, Number(c.maxFarmSizeReached ?? 0));
    const tier = [1e7,1e8,1e9,1e10].findLastIndex(n => max >= n);
    if (tier >= 0 && egg.buffs?.[tier]) { const b = egg.buffs[tier]; buffs[b.dimension] = (buffs[b.dimension] ?? 1) * b.value; }
  }
  for (const b of grade?.modifiers ?? []) buffs[b.dimension] = (buffs[b.dimension] ?? 1) * b.value;
  const buff = (dim: number) => buffs[dim] ?? 1;
  const truth = (backup.virtue?.eovEarned ?? []).reduce((sum: number, n: number) => sum + n, 0);
  const population = num(farm.numChickens);
  const habMult = multiplier('hab_capacity', r => r.id !== 'wormhole_dampening') * afx.hab_capacity_mult * buff(6);
  const capacity = farm.habs && valid && farm.habs.every((id: number) => id === 19 || habs[id] != null) ? farm.habs.reduce((sum: number, id: number) => sum + (id === 19 ? 0 : Math.ceil(habs[id]! * habMult * (id >= 17 ? 1 + .02 * level('wormhole_dampening') : 1))), 0) : null;
  const transport = farm.vehicles && farm.trainLength?.length === farm.vehicles.length && valid && farm.vehicles.every((id: number) => vehicles[id] != null) ? farm.vehicles.reduce((sum: number, id: number, i: number) => sum + vehicles[id]! * Number(farm.trainLength[i]) * (id >= 9 ? 1 + .05 * level('hover_upgrades') : 1) * (id === 11 ? 1 + .05 * level('hyper_portalling') : 1), 0) * multiplier('shipping_capacity', r => !['hover_upgrades','hyper_portalling'].includes(r.id)) * afx.shipping_mult * buff(5) : null;
  let ihr = research.filter(r => r.categories === 'internal_hatchery_rate' && r.effect_type === 'additive').reduce((v, r) => v + r.per_level * level(r.id), 0) / 60 * (1 + .05 * level('epic_internal_incubators',true)) * afx.ihr_mult * buff(3) * Math.pow(1.01, truth);
  const activeBoosts = (farm.activeBoosts ?? []).filter((b: Raw) => {
    const id=String(b.boostId??'').trim(),remaining=num(b.timeRemaining);
    return id ? remaining == null || remaining > 0 : remaining != null && remaining > 0;
  });
  const boosts = activeBoosts.map((b: Raw) => ({ name: String(b.boostId||'Unidentified boost'), until: at && num(b.timeRemaining) != null ? at + Number(b.timeRemaining) * 1000 : null }));
  let tachyon = 0, beacon = 0;
  const unknownBoosts: string[]=[];
  for (const b of activeBoosts) {
    const id = String(b.boostId??'');
    if(num(b.timeRemaining)==null) {unknownBoosts.push(`${id||'Unidentified boost'} (duration missing)`);continue;}
    const tach = id.match(/^tachyon_(10|100|1000)x/), bb = id.match(/^boost_(2|5|10|50)x/);
    const realTachyon:Record<string,number>={tachyon_prism_blue:10,tachyon_prism_blue_big:10,tachyon_prism_purple:100,tachyon_prism_purple_big:100,tachyon_prism_orange:1000,tachyon_prism_orange_big:1000};
    const realBeacon:Record<string,number>={boost_beacon_blue:2,boost_beacon_blue_big:5,boost_beacon_purple:10,boost_beacon_orange:50};
    if (realTachyon[id]) tachyon+=realTachyon[id]; else if(realBeacon[id])beacon+=realBeacon[id];
    else if (tach) tachyon += Number(tach[1]); else if (bb) beacon += Number(bb[1]);
    else if (!/^(jimbos_|earning_|soul_|mirror_|bulb_|subsidy_|blank_check|money_printer)/.test(id)) unknownBoosts.push(id||'Unidentified boost');
  }
  const boostIssue=unknownBoosts.length ? `Unsupported active boost: ${unknownBoosts.join(', ')}. Hatchery rates and growth estimates are unavailable.` : undefined;
  const knownBoosts = !boostIssue;
  if(boostIssue)notes.push(boostIssue);
  ihr *= (tachyon || 1) * (tachyon ? (beacon || 1) * afx.boost_mult : 1);
  const ihrAway = ihr * (1 + .1 * level('int_hatch_calm',true));
  let lay = population == null || !valid ? null : population * (2 / 60) * multiplier('egg_laying_rate') * afx.laying_rate * buff(4);
  // Co-op buffs are only known when the status endpoint reports the account's production.
  if (farm.farmType === 3) { lay = null; notes.push('Co-op effective production is reported in Contracts; local rates exclude unknown teammate buffs.'); }
  const eggValue = values[farm.eggType] ?? specials[farm.eggType] ?? (farm.eggType === 200 ? custom?.value : null);
  const ev = valid && eggValue != null ? eggValue * multiplier('egg_value') * afx.egg_value_mult : null;
  const soul = num(backup.game?.soulEggsD ?? backup.game?.soulEggs), prophecy = num(backup.game?.eggsOfProphecy);
  const eb = !earningsIssue && soul != null && prophecy != null ? soul * (.1 + .01 * level('soul_eggs',true) + afx.soul_egg_bonus) * Math.pow(1.05 + .01 * level('prophecy_bonus',true) + afx.prophecy_egg_bonus, prophecy) * Math.pow(1.01,truth) * 100 : null;
  const m = (label: string, value: Value | undefined, unit: string, source: Source = 'calculated', note?: string) => metric(label,value,unit,source,at,note);
  const metrics = {
    population: m('Population',farm.numChickens,'chickens','reported',population==null?'Population was not included in this save.':undefined),
    capacity: m('Habitat capacity',capacity,'chickens','calculated',capacity==null?farmIssue??'Habitat purchases are missing or unrecognized.':undefined),
    laying: m('Egg laying rate',lay,'eggs/s','calculated',lay==null?farmIssue??(farm.farmType===3?'Use the contract’s reported delivery rate; teammate laying buffs are not available in this backup.':'Population was not included in this save.'):undefined),
    shipping: m('Shipping capacity',transport,'eggs/s','calculated',transport==null?farmIssue??'Vehicle purchases or train lengths are incomplete or unrecognized.':undefined),
    ihr: m('Internal hatchery · online',valid && knownBoosts ? ihr : null,'chickens/s/hab','calculated',farmIssue??boostIssue),
    ihrAway: m('Internal hatchery · offline',valid && knownBoosts ? ihrAway : null,'chickens/s/hab','calculated',farmIssue??boostIssue),
    eggValue: m('Egg value',ev,'bocks/egg','calculated',ev==null?farmIssue??'The base value for this egg is not available.':undefined),
    cash: m('Cash on hand',num(farm.cashEarned) != null && num(farm.cashSpent) != null ? Number(farm.cashEarned)-Number(farm.cashSpent) : null,'bocks','calculated','Saved cash earned less cash spent; unclaimed cash is separate.'),
    unclaimed: m('Unclaimed cash',farm.unclaimedCash,'bocks','reported'),
    earningsBonus: m('Equipped earnings bonus',eb,'%','calculated',eb==null?earningsIssue??'Soul egg or prophecy egg counts were not included in this save.':undefined),
    eggsLaid: m('Eggs laid',farm.eggsLaid,'eggs','reported'), eggsShipped: m('Eggs shipped',farm.eggsShipped,'eggs','reported'),
    silos: m('Silos owned',farm.silosOwned,'silos','reported'),
  };
  // Do not animate growth from an unknown online/offline state or through a full hab.
  // A deliberately short offline scenario forecast never changes authoritative totals.
  const purchased = (farm.habs ?? []).filter((id: number) => id !== 19).length;
  const allHabsHaveSpace = capacity != null && purchased > 0 && farm.habPopulation?.length === farm.habs?.length && (farm.habs as number[]).every((id, i) => id === 19 || Number(farm.habPopulation[i]) < Math.ceil(habs[id]! * habMult * (id >= 17 ? 1+.02*level('wormhole_dampening') : 1)));
  const siloSeconds = num(farm.silosOwned) == null ? 0 : Number(farm.silosOwned) * (3600 + 360 * level('silo_capacity',true));
  const horizon = at == null ? 0 : Math.min(at + siloSeconds*1000, at + 5*60_000, ...boosts.map((b: {until:number|null}) => b.until ?? at));
  const forecast = valid && knownBoosts && population != null && capacity != null && allHabsHaveSpace && at != null && horizon > now ? { population,capacity,rate:ihrAway*purchased,at,until:horizon } : null;
  const id = farm.farmType === 2 ? 'home' : `farm:${farm.contractId ?? index}`;
  const segment = id === 'home' ? `home:${backup.stats?.numPrestiges ?? '?'}:${farm.eggType}` : `${id}:${local?.timeAccepted ?? '?'}`;
  return { id,segment,name: id === 'home' ? 'Home farm' : spec?.name ?? 'Contract farm',egg:eggName(farm.eggType,custom?.name ?? spec?.customEggId),at,metrics,artifacts,boosts,forecast,notes };
}
