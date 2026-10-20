import type { GoalReward } from '../shared/types.ts';
import { full, short } from './format.ts';
import research from '../vendor/researches.json';
const categories:Record<number,string>={1:'Cash',2:'Golden eggs',3:'Soul eggs',4:'Eggs of Prophecy',5:'Epic research',6:'Piggy fill',7:'Piggy multiplier',8:'Piggy level',9:'Boost',10:'Boost tokens',11:'Artifact',12:'Artifact case',13:'Chickens',14:'Shell tickets',15:'Virtue gems'};
// Variant multipliers/durations: wasmegg-carpet/egg, lib/farm/boosts.ts.
const subtypes:Record<string,string>={tachyon_prism_orange:'Tachyon Prism ×1,000 · 10 min',tachyon_prism_purple_big:'Tachyon Prism ×100 · 2 hours',boost_beacon_blue:'Boost Beacon ×2',boost_beacon_blue_big:'Boost Beacon ×5',boost_beacon_purple:'Boost Beacon ×10',boost_beacon_orange:'Boost Beacon ×50'};
export function rewardText(reward:GoalReward|undefined,exact=false):string {
  if(!reward || reward.type==null && reward.amount==null && !reward.subtype)return 'Reward unavailable';
  const category=reward.type==null?null:categories[reward.type];
  if(!category)return reward.amount==null?'Unknown reward':`${(exact?full:short)(reward.amount)} · Unknown reward`;
  const amount=reward.amount==null?'Amount unavailable':(exact?full:short)(reward.amount);
  const subtype=reward.subtype ? reward.type===9 ? subtypes[reward.subtype] : reward.type===5 ? research.find(r=>r.type==='epic' && r.id===reward.subtype)?.name : null : null;
  return `${amount} · ${category}${subtype?' · '+subtype:reward.subtype?' · subtype unavailable':''}`;
}
