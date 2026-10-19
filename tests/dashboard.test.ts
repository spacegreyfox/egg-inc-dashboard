import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { proto, decodeResponse, GameClient, UpstreamError, type Raw, type EggClient } from '../server/api.ts';
import { makeBackup, makeCoop } from '../server/demo.ts';
import { normalize, activeContracts, contractIdentity } from '../server/normalize.ts';
import { farmFromBackup } from '../server/calculations.ts';
import { Store, csv } from '../server/store.ts';
import { Collector } from '../server/collector.ts';
import { createApp } from '../server/app.ts';

const eid='EI0000000000000000',now=1_800_000_000_000;
const snap=(b=makeBackup(now),time=now)=>normalize(b,new Map(),new Map(),{},eid,time);
const calculated=(b=makeBackup(now))=>farmFromBackup(b,b.farms[0],0,{},now);
function fresh(){const b=makeBackup(now);b.artifactsDb.activeArtifactSets=[];b.virtue.eovEarned=[];b.farms[0].commonResearch=[];b.game.epicResearch=[];return b;}
function client(overrides:Partial<EggClient>={}):EggClient{return {backup:async()=>makeBackup(now),coop:async()=>makeCoop(now),metadata:async()=>({}),...overrides};}

test('protobuf decoding preserves uint64 counters exactly',()=>{
 const t=proto.lookupType('ei.EggIncFirstContactResponse');
 const encoded=Buffer.from(t.encode(t.fromObject({backup:{stats:{droneTakedowns:'9007199254740993'}}})).finish()).toString('base64');
 assert.equal(decodeResponse(encoded,'ei.EggIncFirstContactResponse',false).backup.stats.droneTakedowns,'9007199254740993');
});
for(const compression of [deflateSync,gzipSync])test('co-op envelopes decode compressed responses '+compression.name,()=>{
 const t=proto.lookupType('ei.ContractCoopStatusResponse'),e=proto.lookupType('ei.AuthenticatedMessage');
 const encoded=t.encode(t.fromObject(makeCoop(now))).finish();
 const text=Buffer.from(e.encode(e.fromObject({message:compression(encoded),compressed:true})).finish()).toString('base64');
 assert.equal(decodeResponse(text,'ei.ContractCoopStatusResponse',true).coopIdentifier,'green-pastures');
});
test('request timeout, HTTP failure and Retry-After are sanitized',async()=>{
 const timeoutClient=new GameClient(async()=>{throw new DOMException(eid,'TimeoutError');});
 await assert.rejects(timeoutClient.backup(eid),/timed out/);
 const limited=new GameClient(async()=>new Response('',{status:429,headers:{'retry-after':'120'}}));
 await assert.rejects(limited.backup(eid),e=>e instanceof UpstreamError&&e.retryAfter===120000&&!e.message.includes(eid));
});
test('partial farm uses purchased research, not maximized research',()=>{
 const b=fresh();b.farms[0].numChickens='100';b.farms[0].habs=[0,19,19,19];b.farms[0].vehicles=[0];b.farms[0].trainLength=[1];
 b.farms[0].commonResearch=[{id:'comfy_nests',level:2},{id:'internal_hatchery1',level:3}];
 const f=calculated(b);assert.equal(f.metrics.capacity?.value,250);assert.equal(f.metrics.laying?.value,4);assert.equal(f.metrics.ihr?.value,.1);assert.equal(f.metrics.shipping?.value,5000/60);
});
test('max research, habitat and vehicle restrictions are calculated',()=>{
 const b=makeBackup(now);b.artifactsDb.activeArtifactSets=[];const f=calculated(b);
 assert.equal(f.metrics.capacity?.value,11340000000);assert.ok(Number(f.metrics.shipping?.value)>1e12);
 b.farms[0].habs=[0,19,19,19];const small=calculated(b);assert.equal(small.metrics.capacity?.value,788); // Wormhole only applies to portal habitats.
});
test('equipped gusset and tachyon stone affect only their relevant metrics',()=>{
 const b=makeBackup(now),f=calculated(b);b.artifactsDb.activeArtifactSets=[];const bare=calculated(b);
 assert.ok(Number(f.metrics.capacity?.value)>Number(bare.metrics.capacity?.value));assert.ok(Number(f.metrics.laying?.value)>Number(bare.metrics.laying?.value));assert.equal(f.metrics.shipping?.value,bare.metrics.shipping?.value);
});
test('real boost IDs, beacon stacking, and expiration-bound forecast',()=>{
 const b=makeBackup(now),base=calculated(b);b.farms[0].activeBoosts=[{boostId:'tachyon_prism_orange',timeRemaining:100},{boostId:'boost_beacon_orange',timeRemaining:100}];
 const boosted=calculated(b);assert.equal(Number(boosted.metrics.ihr?.value),Number(base.metrics.ihr?.value)*50000);assert.equal(boosted.forecast?.until,(b.farms[0].lastStepTime+100)*1000);
 b.farms[0].activeBoosts=[{boostId:'future_boost',timeRemaining:100}];assert.equal(calculated(b).metrics.ihr?.value,null);assert.equal(calculated(b).forecast,null);
});
test('contract modifiers apply without assuming colleggtibles are maxed',()=>{
 const b=fresh();b.contracts.contracts[0].contract.gradeSpecs[0].modifiers=[{dimension:6,value:2}];
 b.farms[1].commonResearch=[];b.farms[1].habs=[0,19,19,19];const f=farmFromBackup(b,b.farms[1],1,{},now);assert.equal(f.metrics.capacity?.value,500);
});
test('missing fields, unknown equipment and unknown research are unavailable',()=>{
 const b=makeBackup(now);delete b.farms[0].numChickens;assert.equal(calculated(b).metrics.population?.value,null);
 b.farms[0].commonResearch.push({id:'future',level:1});assert.equal(calculated(b).metrics.laying?.value,null);
 const c=makeBackup(now);c.artifactsDb.inventoryItems[0].artifact.spec.name=10000;assert.equal(calculated(c).metrics.capacity?.value,null);
});
test('no forecast through a full habitat, missing silo, old timestamp or Enlightenment',()=>{
 const b=makeBackup(now);b.farms[0].habPopulation[0]='999999999999';assert.equal(calculated(b).forecast,null);
 b.farms[0].habPopulation[0]='1';delete b.farms[0].silosOwned;assert.equal(calculated(b).forecast,null);
 b.farms[0].eggType=19;assert.equal(calculated(b).metrics.eggValue?.value,null);
});
test('co-op membership, goals, current player, and missing responses',()=>{
 const b=makeBackup(now),identity=contractIdentity(b.contracts.contracts[0]);
 const s=normalize(b,new Map([[identity.segment,{raw:makeCoop(now),checkedAt:now}]]),new Map(),{},eid,now);
 assert.equal(s.contracts[0]?.members.filter(m=>m.me).length,1);assert.equal(s.contracts[0]?.goals.length,3);assert.ok(Number(s.contracts[0]?.metrics.eta?.value)>0);
 b.contracts.contracts[0].coopIdentifier='';assert.equal(snap(b).contracts[0]?.coop,null);
 b.contracts.contracts[0].cancelled=true;assert.equal(activeContracts(b).length,0);
});
test('history persists across restarts and deduplicates unchanged backups',()=>{
 const dir=mkdtempSync(join(tmpdir(),'egg-history-'));const path=join(dir,'test.sqlite');let db=new Store(path);
 try{
  const a=snap();db.save(a,60);db.save({...a,at:now+60000},60);
  assert.equal(db.history('home','population',0,now+60000).points.length,1);db.close();db=new Store(path);assert.equal(db.get<any>('latest')?.name,'Sample farmer');assert.equal(db.history('account','goldEarned',0,now+60000).points[0]?.value,'9007199254740993');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('history breaks across farm upgrades, prestiges, repeated contracts and sleep',()=>{
 const db=new Store(':memory:');try{
  db.save(snap(),60);const b=makeBackup(now+60000);b.stats.numPrestiges='2848';db.save(snap(b,now+60000),60);
  const c=makeBackup(now+3600000);db.save(snap(c,now+3600000),60);const points=db.history('home','population',0,now+7200000).points;
  assert.equal(points.length,3);assert.ok(points[1]?.gap);assert.ok(points[2]?.gap);assert.notEqual(snap().home?.segment,snap(b).home?.segment);
  b.contracts.contracts[0].timeAccepted+=100;assert.notEqual(snap().contracts[0]?.segment,snap(b).contracts[0]?.segment);
 }finally{db.close();}
});
test('counter resets break history and CSV preserves exact numbers and escapes',()=>{
 const db=new Store(':memory:');try{db.save(snap(),60);const b=makeBackup(now+60000);b.stats.droneTakedowns='2';db.save(snap(b,now+60000),60);assert.ok(db.history('account','drones',0,now+120000).points[1]?.gap);
 const data=csv(db.history('account','goldEarned',0,now+120000),'account','goldEarned');assert.match(data,/9007199254740993/);assert.match(data,/observed_at,collected_at/);
 }finally{db.close();}
});
test('collector shares requests, respects cooldown and continues without subscribers',async()=>{
 const db=new Store(':memory:');let clock=now,calls=0;const c=new Collector(db,client({backup:async()=>{calls++;return makeBackup(clock);}}),()=>clock);
 try{c.configure({eid,interval:60,paused:false});await Promise.all([c.refresh(),c.refresh(),c.refresh()]);assert.equal(calls,1);assert.ok(c.view().snapshot);assert.equal(await c.refresh(),false);clock+=61000;assert.equal(await c.refresh(),true);assert.equal(calls,2);assert.equal(c.listenerCount('update'),0);
 }finally{c.stop();db.close();}
});
test('failed co-op keeps last good data without blanking the farm',async()=>{
 const db=new Store(':memory:');let clock=now,fail=false;const c=new Collector(db,client({coop:async()=>{if(fail)throw new Error('Co-op unavailable.');return makeCoop(clock);},backup:async()=>makeBackup(clock)}),()=>clock);
 try{c.configure({eid,interval:60,paused:false});await c.refresh();const total=c.view().snapshot?.contracts[0]?.metrics.delivered?.value;clock+=61000;fail=true;await c.refresh();assert.equal(c.view().snapshot?.contracts[0]?.metrics.delivered?.value,total);assert.match(c.view().snapshot?.contracts[0]?.error??'',/unavailable/);assert.ok(c.view().snapshot?.home);
 }finally{c.stop();db.close();}
});
test('backup failure backs off, retains prior stats, honors Retry-After',async()=>{
 const db=new Store(':memory:');let clock=now,fail=false;const c=new Collector(db,client({backup:async()=>{if(fail)throw new UpstreamError('Temporarily unavailable.',180000);return makeBackup(clock);}}),()=>clock);
 try{c.configure({eid,interval:60,paused:false});await c.refresh();clock+=61000;fail=true;await c.refresh();assert.ok(c.view().snapshot);assert.equal(c.view().status.nextPoll,clock+180000);clock+=61000;assert.equal(await c.refresh(),false);
 }finally{c.stop();db.close();}
});
test('pause and account replacement isolate data, including an in-flight request',async()=>{
 const db=new Store(':memory:');let release!:(v:Raw)=>void;const c=new Collector(db,client({backup:()=>new Promise(resolve=>release=resolve)}),()=>now);
 try{c.configure({eid,interval:60,paused:false});const pending=c.refresh();c.configure({eid:'EI1111111111111111',interval:60,paused:true},true);release(makeBackup(now));await pending;assert.equal(c.view().snapshot,null);assert.equal(c.view().status.paused,true);assert.equal(await c.refresh(),false);c.clear();assert.equal(c.view().status.configured,false);assert.equal(db.history('home','population',0,now).points.length,0);
 }finally{c.stop();db.close();}
});
test('HTTP validates input, protects origin/host, exports and masks EID',async()=>{
 const db=new Store(':memory:'),c=new Collector(db,client(),()=>now),app=await createApp(c);
 try{
  assert.equal((await app.inject({url:'/api/dashboard',headers:{host:'evil.example'}})).statusCode,403);
  assert.equal((await app.inject({url:'/api/dashboard',headers:{host:'localhost:8890',origin:'https://evil.example'}})).statusCode,403);
  const req=(url:string,method:any='GET',payload?:any)=>app.inject({url,method,payload,headers:{host:'localhost:8890'}});
  assert.equal((await req('/api/account','POST',{eid:'bad'})).statusCode,400);
  const saved=await req('/api/account','POST',{eid});assert.equal(saved.statusCode,200);assert.ok(!saved.body.includes(eid));
  assert.ok(!(await req('/api/refresh','POST')).body.includes(eid));assert.equal((await req('/api/history.csv')).statusCode,200);assert.equal((await req('/api/history?from=nope')).statusCode,400);
  assert.equal((await req('/api/account','DELETE')).statusCode,200);assert.equal(c.view().status.configured,false);
 }finally{await app.close();db.close();}
});
