import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farmFromBackup } from '../server/calculations.ts';
import { makeBackup } from '../server/demo.ts';
import { normalize } from '../server/normalize.ts';
import { Store } from '../server/store.ts';
import { percentage } from '../src/format.ts';
import { Collector } from '../server/collector.ts';
import { DemoClient } from '../server/demo.ts';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const now=1_800_000_000_000;
const farm=(b=makeBackup(now))=>farmFromBackup(b,b.farms[0],0,{},now);
const snapshot=(b:ReturnType<typeof makeBackup>,at:number)=>normalize(b,new Map(),new Map(),{},'',at);

test('saved compatibility research IDs do not blank supported farm statistics',()=>{
  const backup=makeBackup(now),baseline=farm(backup);
  // Save shape only: no account identifier or personal snapshot is retained.
  backup.game.epicResearch.push({id:'epic_silo_quality',level:13},{id:'warp_shift',level:3});
  const actual=farm(backup);
  for(const key of ['capacity','eggValue','laying','shipping','ihr','ihrAway','earningsBonus'])assert.equal(actual.metrics[key]?.value,baseline.metrics[key]?.value,key);
});

test('unused protobuf boost slots neither render rows nor suppress IHR and forecasts',()=>{
  const backup=makeBackup(now),baseline=farm(backup);
  backup.farms[0].activeBoosts=Array.from({length:10},(_,i)=>({boostId:'',timeRemaining:i%2?0:-.24,referenceValue:0}));
  const actual=farm(backup);
  assert.equal(actual.boosts.length,0);
  assert.equal(actual.metrics.ihr?.value,baseline.metrics.ihr?.value);
  assert.deepEqual(actual.forecast,baseline.forecast);
});

test('expired boost records do not inflate the saved hatchery rate',()=>{
  const backup=makeBackup(now),baseline=farm(backup);
  backup.farms[0].activeBoosts=[{boostId:'tachyon_prism_orange',timeRemaining:0},{boostId:'boost_beacon_orange',timeRemaining:-1}];
  const actual=farm(backup);
  assert.equal(actual.boosts.length,0);assert.equal(actual.metrics.ihr?.value,baseline.metrics.ihr?.value);
});

test('unknown active boosts explain unavailable IHR without hiding unrelated rates',()=>{
  const backup=makeBackup(now),baseline=farm(backup);
  backup.farms[0].activeBoosts=[{boostId:'future_boost',timeRemaining:100}];
  const actual=farm(backup);
  assert.equal(actual.metrics.ihr?.value,null);assert.match(actual.metrics.ihr?.note??'',/future_boost/);
  assert.equal(actual.metrics.capacity?.value,baseline.metrics.capacity?.value);
  assert.equal(actual.metrics.laying?.value,baseline.metrics.laying?.value);
});

test('a new common research cannot suppress an unrelated equipped earnings bonus',()=>{
  const backup=makeBackup(now),baseline=farm(backup);
  backup.farms[0].commonResearch.push({id:'future_common_research',level:1});
  const actual=farm(backup);
  assert.equal(actual.metrics.laying?.value,null);
  assert.match(actual.metrics.laying?.note??'',/future_common_research/);
  assert.equal(actual.metrics.earningsBonus?.value,baseline.metrics.earningsBonus?.value);
});

test('omitted protobuf research lists represent no purchases',()=>{
  const backup=makeBackup(now);
  backup.artifactsDb.activeArtifactSets=[];backup.virtue.eovEarned=[];
  delete backup.farms[0].commonResearch;delete backup.game.epicResearch;
  backup.farms[0].habs=[0,19,19,19];backup.farms[0].numChickens='100';
  assert.equal(farm(backup).metrics.capacity?.value,250);
  assert.equal(farm(backup).metrics.laying?.value,100/30);
  assert.equal(farm(backup).metrics.ihr?.value,0);
});

test('unknown occupancy is distinct from a genuinely empty habitat',()=>{
  for(const [population,capacity] of [[null,100],[100,null],[undefined,100],[100,undefined],[100,0],[100,NaN],['',100]])assert.equal(percentage(population,capacity),null);
  assert.equal(percentage(0,100),0);assert.equal(percentage('25','100'),25);assert.equal(percentage(200,100),100);
});

test('normal upload delays do not create chart gaps when collection is continuous',()=>{
  const store=new Store(':memory:');
  try{
    const backup=makeBackup(now);
    for(const elapsed of [0,60000,120000])store.save(snapshot(backup,now+elapsed),60);
    store.save(snapshot(makeBackup(now+180000),now+180000),60);
    const history=store.history('home','population',0,now+240000);
    assert.equal(history.points.length,2);assert.equal(history.points[1]?.gap,false);
  }finally{store.close();}
});

test('an outage remains marked if the first successful read has an unchanged backup',()=>{
  const store=new Store(':memory:');
  try{
    const backup=makeBackup(now);
    store.save(snapshot(backup,now),60);
    store.save(snapshot(backup,now+600000),60);
    store.save(snapshot(makeBackup(now+660000),now+660000),60);
    const history=store.history('home','population',0,now+720000);
    assert.equal(history.points.length,2);assert.equal(history.points[1]?.gap,true);
  }finally{store.close();}
});

test('collection continuity survives a database restart without erasing older gap flags',()=>{
  const dir=mkdtempSync(join(tmpdir(),'egg-continuity-')),path=join(dir,'history.sqlite');let store=new Store(path);
  try {
    const backup=makeBackup(now);store.save(snapshot(backup,now),60);store.save(snapshot(backup,now+600000),60);store.close();
    store=new Store(path);store.save(snapshot(makeBackup(now+660000),now+660000),60);
    assert.equal(store.history('home','population',0,now+720000).points[1]?.gap,true);
    assert.equal(store.history('home','population',0,now+720000).points[0]?.gap,true);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('restart recalculates cached stats without fetching, changing sync time, or rewriting history',()=>{
  const store=new Store(':memory:');let collector:Collector|undefined;
  try {
    const backup=makeBackup(now);backup.game.epicResearch.push({id:'warp_shift',level:3});
    store.set('account',{eid:'EI0000000000000000',interval:60,paused:false});
    const old=snapshot(backup,now);old.home!.metrics.capacity!.value=null;store.save(old,60);
    store.raw('backup',backup);store.raw('metadata',{});store.set('lastSuccess',now);
    const rows=store.db.prepare('SELECT count(*) AS n FROM samples').get()!.n;
    collector=new Collector(store,new DemoClient(),()=>now+120000);
    assert.ok(collector.view().snapshot?.home?.metrics.capacity?.value!=null);
    assert.equal(collector.view().snapshot?.at,now);assert.equal(collector.view().status.lastSuccess,now);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM samples').get()!.n,rows);
  }finally{collector?.stop();store.close();}
});
