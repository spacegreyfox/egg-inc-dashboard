import { proto, type EggClient, type Raw } from './api.ts';
import research from '../vendor/researches.json';

const name=(s:string)=>proto.lookupEnum('ei.ArtifactSpec.Name').values[s];
export function makeBackup(now=Date.now()):Raw {
  const time=Math.floor((now-90_000)/1000);
  const items=[{spec:{name:name('ORNATE_GUSSET'),level:3,rarity:2},stones:[]},{spec:{name:name('QUANTUM_METRONOME'),level:3,rarity:2},stones:[{name:name('TACHYON_STONE'),level:2,rarity:0}]}];
  const common=research.filter(r=>r.type==='common').map(r=>({id:r.id,level:r.levels}));
  const epic=research.filter(r=>r.type==='epic').map(r=>({id:r.id,level:r.levels}));
  const farm={farmType:2,eggType:18,lastStepTime:time,numChickens:'8432000000',habs:[18,18,18,18],habPopulation:['2108000000','2108000000','2108000000','2108000000'],vehicles:[11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11],trainLength:Array(17).fill(10),commonResearch:common,activeBoosts:[],silosOwned:10,cashEarned:2.934e65,cashSpent:1e63,unclaimedCash:0,eggsLaid:8.27e16,eggsShipped:8.25e16};
  const contract={identifier:'observatory-demo',name:'A Good Harvest',egg:3,gradeSpecs:[{grade:5,lengthSeconds:604800,goals:[{type:1,targetAmount:1e16},{type:1,targetAmount:2e17},{type:1,targetAmount:1e18}],modifiers:[]}]};
  return {approxTime:time,userName:'Sample farmer',stats:{numPrestiges:'2847',droneTakedowns:'148269',droneTakedownsElite:'9628',boostsUsed:'1852',numPiggyBreaks:'12',eggTotals:[8.27e16,4.21e19]},game:{soulEggsD:2.84e18,eggsOfProphecy:'182',goldenEggsEarned:'9007199254740993',goldenEggsSpent:'18264000',lifetimeCashEarned:8.912e86,permitLevel:1,piggyBank:'18429000',epicResearch:epic},virtue:{eovEarned:[12,10,8,14,6]},farms:[farm,{...farm,farmType:3,eggType:3,contractId:contract.identifier,numChickens:'11340000000',eggsLaid:1.23e17,eggsShipped:1.23e17}],contracts:{contracts:[{contract,coopIdentifier:'green-pastures',coopUserId:'EI0000000000000000',grade:5,accepted:true,timeAccepted:1700000000,coopSimulationEndTime:time+259200}],archive:[],colleggtibleMaxFarmSizeReached:[]},artifactsDb:{inventoryItems:items.map((artifact,i)=>({itemId:String(i+1),artifact})),activeArtifactSets:[{slots:[{occupied:true,itemId:'1'},{occupied:true,itemId:'2'}]},{slots:[]}]}};
}
export function makeCoop(now=Date.now()):Raw {
  return {contractIdentifier:'observatory-demo',coopIdentifier:'green-pastures',grade:5,totalAmount:4.82e17,secondsRemaining:259200,contributors:[['EI0000000000000000','Sample farmer',1.92e17,3.82e12,11340000000,12],['EI1111111111111111','Clover',1.65e17,3.19e12,11200000000,8],['EI2222222222222222','Orbit',1.25e17,2.74e12,10400000000,4]].map((r,i)=>({userId:r[0],userName:r[1],contributionAmount:r[2],contributionRate:r[3],boostTokens:r[5],productionParams:{farmPopulation:r[4],farmCapacity:12000000000},farmInfo:{timestamp:Math.floor(now/1000)-120-i*600,equippedArtifacts:[]}}))};
}
// Additional synthetic contracts make the multi-contract experience easy to preview.
const demoContracts = [
  { id: 'observatory-demo', name: 'A Good Harvest', coop: 'green-pastures', duration: 259200, goals: [1e16, 2e17, 1e18] },
  { id: 'sunrise-shift-demo', name: 'Sunrise Shift', coop: 'daybreak', duration: 43200, goals: [1e15, 1e16, 5e16] },
  { id: 'solo-sprouts-demo', name: 'Solo Sprouts', coop: '', duration: null, goals: [1e16, 2e17, 1e18] },
  { id: 'quiet-harbor-demo', name: 'Quiet Harbor', coop: 'harbor', duration: 345600, goals: [1e16, 2e17, 1e18] },
];
export function makeDemoBackup(now = Date.now()): Raw {
  const backup = makeBackup(now), local = backup.contracts.contracts[0], farm = backup.farms[1];
  backup.contracts.contracts = demoContracts.map((definition, index) => ({
    ...structuredClone(local),
    contract: { ...structuredClone(local.contract), identifier: definition.id, name: definition.name,
      gradeSpecs: [{ ...structuredClone(local.contract.gradeSpecs[0]), goals: definition.goals.map(targetAmount => ({ type: 1, targetAmount })) }] },
    coopIdentifier: definition.coop, timeAccepted: 1700000000 + index * 100,
    coopSimulationEndTime: definition.duration == null ? undefined : now / 1000 + definition.duration,
  }));
  backup.farms = [backup.farms[0], ...demoContracts.map((definition, index) => ({ ...structuredClone(farm), contractId: definition.id, numChickens: String(6000000000 + index * 1000000000), eggsShipped: index === 2 ? 5e15 : farm.eggsShipped }))];
  return backup;
}
export function makeDemoCoop(id: string, now = Date.now()): Raw {
  const definition = demoContracts.find(contract => contract.id === id) ?? demoContracts[0]!;
  const raw = makeCoop(now); raw.contractIdentifier = definition.id; raw.coopIdentifier = definition.coop;
  raw.secondsRemaining = definition.duration;
  if (id === 'sunrise-shift-demo') {
    raw.totalAmount = 6e14;
    raw.contributors.forEach((member: Raw, index: number) => { member.contributionRate = 5e10 / 3; member.contributionAmount = 2e14; member.productionParams.farmPopulation = 6000000000; if (index) member.userName = ['','Dawn','Sunny'][index]; });
  } else if (id === 'quiet-harbor-demo') {
    raw.totalAmount = 1e15; raw.contributors.forEach((member: Raw, index: number) => { member.contributionRate = 0; member.contributionAmount = 1e15 / 3; if (index) member.userName = ['','Sailor','Pebble'][index]; });
  }
  return raw;
}
export class DemoClient implements EggClient {
  async backup(){return makeDemoBackup();}
  async coop(_eid: string, id: string){return makeDemoCoop(id);}
  async metadata(){return {contracts:{customEggs:[],contracts:[]},events:{events:[]}};}
}
