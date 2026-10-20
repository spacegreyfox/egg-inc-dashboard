import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractPace, type EstimateContext } from '../src/contract-progress.ts';
import { productionLimit, sortedProduction } from '../src/production.ts';
import { rewardText } from '../src/rewards.ts';
import { normalize, contractIdentity } from '../server/normalize.ts';
import { makeBackup, makeCoop } from '../server/demo.ts';
import { Store } from '../server/store.ts';
import type { Contract, Member } from '../shared/types.ts';
import { metric } from '../server/calculations.ts';
const now=1_800_000_000_000;
const context:EstimateContext={now,interval:60,paused:false,connected:true};
function contract():Contract {return {id:'sample',segment:'sample:1',name:'Sample',coop:'demo',grade:'AAA',at:null,checkedAt:now,endsAt:now+1000000,goals:[100,900],members:[],error:null,metrics:{delivered:metric('Delivered',0,'eggs','reported',now),goal:metric('Final',900,'eggs','reported',now),rate:metric('Rate',1,'eggs/s','reported',now)}};}
test('pace uses unrounded 90% and 100% boundaries, always for the final goal',()=>{
  const c=contract();
  c.metrics.goal!.value=899.999; assert.equal(contractPace(c,context).state,'on-track');
  c.metrics.goal!.value=900; assert.equal(contractPace(c,context).state,'little-margin');
  c.metrics.goal!.value=1000; assert.equal(contractPace(c,context).state,'little-margin');
  c.metrics.goal!.value=1000.001; assert.equal(contractPace(c,context).state,'behind');
  assert.ok(contractPace(c,context).marginSeconds!<0);
});
test('pace required rate and margin stay anchored while browser clock advances',()=>{
  const c=contract(),first=contractPace(c,context),later=contractPace(c,{...context,now:now+60000});
  assert.equal(first.requiredRate,.9);assert.equal(first.marginSeconds,100);assert.equal(first.timeUseRatio,.9);
  assert.deepEqual(later,first);assert.equal(c.metrics.delivered!.value,0);
  c.metrics.delivered!.value=100;c.metrics.delivered!.at=now+60000;c.metrics.rate!.at=now+60000;
  assert.notEqual(contractPace(c,{...context,now:now+60000}).requiredRate,first.requiredRate);
});
test('zero, missing and invalid rates, totals, deadlines and timestamps remain distinct',()=>{
  const c=contract();c.metrics.rate!.value=0;
  assert.equal(contractPace(c,context).state,'behind');assert.equal(contractPace(c,context).marginSeconds,null);
  for(const rate of [null,-1,Infinity]){c.metrics.rate!.value=rate;assert.equal(contractPace(c,context).state,'unknown');}
  c.metrics.rate!.value=1;c.endsAt=null;assert.match(contractPace(c,context).reason!,/deadline/);
  c.endsAt=now+1000000;c.metrics.delivered!.value=null;assert.match(contractPace(c,context).reason!,/delivered/);
  c.metrics.delivered!.value=0;c.metrics.delivered!.at=null;assert.equal(contractPace(c,context).requiredRate,null);
  c.metrics.delivered!.at=now;c.metrics.rate!.at=null;assert.equal(contractPace(c,context).state,'unknown');
});
test('stale, paused, offline and independent request failures retain last pace assessment',()=>{
  const c=contract();
  for(const changes of [{now:now+300001},{paused:true},{connected:false},{collectionError:true}]){
    const p=contractPace(c,{...context,...changes});assert.equal(p.state,'unknown');assert.equal(p.lastAssessment,'Little margin');assert.equal(p.marginSeconds,100);assert.ok(p.reason);
  }
  assert.equal(contractPace(c,{...context,interval:300,now:now+500000}).state,'little-margin');
  assert.equal(contractPace(c,{...context,interval:300,now:now+600001}).state,'unknown');
  c.error='Failed';assert.equal(contractPace(c,context).state,'unknown');assert.equal(contractPace(contract(),context).state,'little-margin');
});
test('passed estimates, expired deadlines and exact reported completion take precedence',()=>{
  const c=contract();
  assert.equal(contractPace(c,{...context,now:now+900001}).state,'awaiting');
  assert.equal(contractPace(c,{...context,now:now+1000000}).state,'expired');
  c.metrics.rate!.value=null;assert.equal(contractPace(c,{...context,now:now+1000001}).state,'expired');
  c.metrics.delivered!.value=900;c.endsAt=null;assert.equal(contractPace(c,{...context,paused:true}).state,'complete');
});
function normalized(){const backup=makeBackup(now),raw=makeCoop(now),segment=contractIdentity(backup.contracts.contracts[0]).segment;
  return {backup,raw,segment,read:()=>normalize(backup,new Map([[segment,{raw,checkedAt:now}]]),new Map(),{},'EI0000000000000000',now)};}
test('production normalizes per-chicken units without replacing authoritative delivery rates',()=>{
  const f=normalized();f.raw.contributors[0].productionParams={elr:2,farmPopulation:10,sr:15};
  const m=f.read().contracts[0]!.members[0]!;
  assert.equal(m.metrics.layingPerChicken!.value,2);assert.equal(m.metrics.laying!.value,20);assert.equal(m.metrics.shipping!.value,15);
  assert.equal(m.metrics.rate!.value,f.raw.contributors[0].contributionRate);assert.equal(m.metrics.laying!.source,'calculated');assert.equal(productionLimit(m),'Shipping limited');
  f.raw.contributors[0].farmInfo.timestamp=-120;assert.equal(f.read().contracts[0]!.members[0]!.metrics.laying!.at,null);
  f.raw.contributors[0].farmInfo.timestamp=(now+3600000)/1000;assert.equal(f.read().contracts[0]!.members[0]!.metrics.laying!.at,null);
});
test('production distinguishes missing, invalid, zero and balanced capacity and sorts nulls last both ways',()=>{
  const f=normalized(),p=f.raw.contributors[0].productionParams;
  const m=()=>f.read().contracts[0]!.members[0]!;
  Object.assign(p,{elr:2,farmPopulation:10,sr:25});assert.equal(productionLimit(m()),'Laying limited');
  p.sr=20;assert.equal(productionLimit(m()),'Balanced');p.elr=0;assert.equal(productionLimit(m()),'No laying reported');p.sr=0;assert.equal(productionLimit(m()),'No production reported');
  delete p.sr;assert.equal(productionLimit(m()),'Production unavailable');p.sr=-1;assert.equal(m().metrics.shipping!.value,null);
  p.elr=-1;assert.equal(m().metrics.laying!.value,null);
  const member=(name:string,v:number|null):Member=>({id:name,name,me:false,artifacts:[],metrics:{laying:metric('Laying',v,'eggs/s','calculated',null)}});
  const all=[member('Missing',null),member('Small',1),member('Large',2)];
  assert.deepEqual(sortedProduction(all,'laying',1).map(m=>m.name),['Small','Large','Missing']);assert.deepEqual(sortedProduction(all,'laying',-1).map(m=>m.name),['Large','Small','Missing']);
  assert.equal(productionLimit({...all[0]!,metrics:{}}),'Production unavailable');
});
test('grade rewards stay aligned through filtering, handle unknowns and never claim redemption',()=>{
  const f=normalized(),spec=f.backup.contracts.contracts[0].contract;
  spec.goals=[{targetAmount:1,rewardType:1,rewardAmount:999}];
  spec.gradeSpecs[0].goals=[{type:99,targetAmount:50,rewardType:2,rewardAmount:1},{type:1,targetAmount:100,rewardType:4,rewardAmount:2},{type:1,targetAmount:200,rewardType:9,rewardAmount:3,rewardSubType:'boost_beacon_orange'},{type:1,targetAmount:300,rewardType:199,rewardAmount:4}];
  const c=f.read().contracts[0]!;assert.deepEqual(c.goals,[100,200,300]);assert.equal(c.goalRewards!.length,3);
  assert.equal(rewardText(c.goalRewards![0]),'2 · Eggs of Prophecy');assert.match(rewardText(c.goalRewards![1]),/Boost Beacon ×50/);assert.equal(rewardText(c.goalRewards![2]),'4 · Unknown reward');
  assert.equal(rewardText(undefined),'Reward unavailable');assert.match(rewardText({type:11,subtype:'unrecognized',amount:1}),/subtype unavailable/);
  assert.match(rewardText({type:9,subtype:'tachyon_prism_orange',amount:2}),/×1,000 · 10 min/);
  assert.match(rewardText({type:5,subtype:'silo_capacity',amount:1}),/Silo Capacity/);
  assert.doesNotMatch(c.goalRewards!.map(r=>rewardText(r)).join(' '),/claimed|redeemed/i);
});
test('new production metrics are additive history, preserving old missing readings and run boundaries',()=>{
  const store=new Store(':memory:'),f=normalized();
  try{const old=f.read();for(const m of old.contracts[0]!.members){delete m.metrics.laying;delete m.metrics.shipping;delete m.metrics.layingPerChicken;}store.save(old,60);
    f.raw.contributors[0].productionParams.elr=2;f.raw.contributors[0].productionParams.sr=3;f.raw.contributors[0].farmInfo.timestamp=now/1000+60;
    const fresh=f.read();fresh.at=now+61000;store.save(fresh,60);
    const c=fresh.contracts[0]!,id=`member:${c.id}:${c.members[0]!.id}`;
    const points=store.history(id,'laying',0,now+120000).points;assert.equal(points[0]!.value,null);assert.ok(points.at(-1)!.value!=null);
    c.segment+=':replay';fresh.at+=61000;store.save(fresh,60);assert.ok(store.history(id,'laying',0,now+180000).points.at(-1)!.gap);
  }finally{store.close();}
});
