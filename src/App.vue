<script setup lang="ts">
import { computed,onMounted,onBeforeUnmount,ref,watch } from 'vue';
import type { Contract,Dashboard,Farm,HistoryResult,Metric } from '../shared/types.ts';
import MetricCard from './MetricCard.vue';
import HistoryChart from './HistoryChart.vue';
import HabitatChart from './HabitatChart.vue';
import ContractPopulation from './ContractPopulation.vue';
import ContractGoals from './ContractGoals.vue';
import { habitatStatus } from './chart-data.ts';
import { short,full,age,duration,percentage as pct,percentText } from './format.ts';

const page=ref('overview');const pages=[['overview','◈','Overview'],['home','⌂','Home farm'],['contracts','▦','Contracts'],['stats','≋','Account stats'],['history','↗','History']];
const state=ref<Dashboard|null>(null),error=ref(''),connected=ref(true),busy=ref(false),loading=ref(true),eid=ref('');
const now=ref(Date.now()),interval=ref(60),replace=ref(false),deleteConfirmed=ref(false);
const snap=computed(()=>state.value?.snapshot),status=computed(()=>state.value?.status),home=computed(()=>snap.value?.home),contracts=computed(()=>snap.value?.contracts??[]);
const selectedContract=ref(''),sortKey=ref('contribution'),sortDirection=ref(-1);
const contract=computed(()=>contracts.value.find(c=>c.id===selectedContract.value)??contracts.value[0]);
const members=computed(()=>[...(contract.value?.members??[])].sort((a,b)=>sortDirection.value*((Number(a.metrics[sortKey.value]?.value) || 0)-(Number(b.metrics[sortKey.value]?.value)||0))));
const history=ref<HistoryResult>({series:[],points:[]}),entity=ref('home'),metricKey=ref('population'),range=ref('24'),from=ref(''),to=ref(''),historyError=ref(''),historyBusy=ref(false);
const series=computed(()=>history.value.series.filter(s=>s.entity===entity.value));
const entities=computed(()=>[...new Set(history.value.series.map(s=>s.entity))]);
const chosen=computed(()=>series.value.find(s=>s.key===metricKey.value));
const delta=computed(()=>{
 const p=history.value.points.filter(p=>p.value!=null);if(p.length<2)return null;
 if(p[0]!.segment!==p.at(-1)!.segment || p.slice(1).some(v=>v.gap))return null;
 const a=p[0]!.value,b=p.at(-1)!.value;
 if(typeof a==='string'&&typeof b==='string'&&/^\d+$/.test(a)&&/^\d+$/.test(b))return (BigInt(b)-BigInt(a)).toString();
 return Number(b)-Number(a);
});
const title=computed(()=>page.value==='settings'?'Dashboard settings':pages.find(p=>p[0]===page.value)?.[2]??'Overview');
const subtitle=computed(()=>({overview:'A clear view of your farm, from hatchery to harvest.',home:'Your actual farm. Every upgrade accounted for.',contracts:'Your contracts, your teammates, your next milestone.',stats:'The long view of everything you have built.',history:'Follow the numbers over time.',settings:'Collection and history stay on this Mac.'}[page.value]));
const recentPoints=computed(()=>history.value.points.slice(-12).reverse());
const estimatedPopulation=computed(()=>{
 const f=home.value?.forecast;if(!f||now.value>f.until||status.value?.paused||!connected.value)return null;
 return Math.min(f.capacity,f.population+Math.max(0,(now.value-f.at)/1000)*f.rate);
});
async function api(path:string,options:RequestInit={}) {
 const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const result=await r.json();if(!r.ok)throw new Error(result.error??'Request failed.');return result;
}
async function act(path:string,options:RequestInit={}) {
 busy.value=true;error.value='';try{state.value=await api(path,options);connected.value=true;interval.value=state.value!.status.interval;}
 catch(e){error.value=e instanceof Error?e.message:'The local server is unavailable.';}finally{busy.value=false;}
}
async function saveAccount(){
 await act('account',{method:'POST',body:JSON.stringify({eid:eid.value,interval:interval.value,replace:replace.value})});
 if(!error.value){eid.value='';replace.value=false;page.value='overview';}
}
async function saveInterval(){await act('account',{method:'POST',body:JSON.stringify({interval:Number(interval.value)})});}
async function togglePause(){await act('account',{method:'POST',body:JSON.stringify({paused:!status.value?.paused})});}
async function deleteData(){if(!deleteConfirmed.value)return;await act('account',{method:'DELETE'});deleteConfirmed.value=false;page.value='overview';history.value={series:[],points:[]};}
function sort(key:string){if(sortKey.value===key)sortDirection.value*=-1;else{sortKey.value=key;sortDirection.value=-1;}}
function bounds(){
 if(range.value==='custom')return {start:new Date(from.value).getTime(),end:new Date(to.value).getTime()};
 return {start:now.value-Number(range.value)*3600_000,end:now.value};
}
const exportUrl=computed(()=>{const b=bounds();return '/api/history.csv?'+new URLSearchParams({entity:entity.value,key:metricKey.value,from:String(b.start),to:String(b.end)});});
let historyRequest=0;
async function loadHistory(){
 const n=++historyRequest;const b=bounds();
 if(!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.start>b.end){historyError.value='Choose a valid start and end date.';return;}
 historyBusy.value=true;historyError.value='';
 try{const data=await api('history?'+new URLSearchParams({entity:entity.value,key:metricKey.value,from:String(b.start),to:String(b.end)}));if(n===historyRequest)history.value=data;}
 catch(e){if(n===historyRequest)historyError.value=e instanceof Error?e.message:'History is unavailable.';}
 finally{if(n===historyRequest)historyBusy.value=false;}
}
function entityName(id:string){return id==='home'?'Home farm':id==='account'?'Account totals':id.startsWith('member:')?'Member · '+(snap.value?.contracts.flatMap(c=>c.members).find(m=>id.endsWith(':'+m.id))?.name??id.split(':').at(-1)):id.startsWith('contract:')?'Contract · '+(contracts.value.find(c=>id===`contract:${c.id}`)?.name??id.slice(9)):snap.value?.farms.find(f=>f.id===id)?.name??id;}
function remaining(c:Contract){return c.endsAt?duration((c.endsAt-now.value)/1000):'Not reported';}
function eta(c:Contract){const v=c.metrics.eta?.value;return v==null?'Awaiting reported rate':duration(Number(v))+' at current rate';}
function date(at:number|null|undefined){return at?new Date(at).toLocaleString():'Not reported';}
function farmMetrics(f:Farm|undefined){return f?['population','capacity','eggValue','laying','shipping','ihr','ihrAway','cash','earningsBonus','eggsLaid','eggsShipped','silos'].map(k=>f.metrics[k]):[];}
function statusText(){return !connected.value?'Disconnected':!status.value?.configured?'Awaiting EID':status.value?.paused?'Paused':status.value?.collecting?'Checking game':status.value?.error?'Retrying':'Collecting';}
watch([entity,metricKey,range],()=>void loadHistory());
watch(series,()=>{if(series.value.length && !chosen.value)metricKey.value=series.value[0]!.key;});
watch(page,()=>{if(['overview','home','history'].includes(page.value))void loadHistory();});
let events:EventSource|undefined,tick:ReturnType<typeof setInterval>|undefined;
onMounted(async()=>{
 const localDate=(ms:number)=>{const d=new Date(ms);return new Date(ms-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};from.value=localDate(Date.now()-86400_000);to.value=localDate(Date.now());
 try{state.value=await api('dashboard');interval.value=state.value!.status.interval;await loadHistory();}catch{connected.value=false;error.value='The local server is unavailable. Keep the dashboard launcher running.';}finally{loading.value=false;}
 events=new EventSource('/api/events');events.addEventListener('update',event=>{const previous=snap.value?.at;state.value=JSON.parse((event as MessageEvent).data);connected.value=true;if(previous!==snap.value?.at)void loadHistory();});events.onerror=()=>connected.value=false;events.onopen=()=>connected.value=true;
 tick=setInterval(()=>now.value=Date.now(),1000);
});
onBeforeUnmount(()=>{events?.close();clearInterval(tick);});
</script>

<template>
 <div class="shell">
  <aside class="sidebar">
   <a class="brand" href="#" @click.prevent="page='overview'" aria-label="Farm Observatory overview"><span class="brand-mark">◉</span><span>FARM<span class="brand-sub">OBSERVATORY</span></span></a>
   <div class="sidebar-section">YOUR WORKSPACE</div>
   <nav aria-label="Main navigation"><button v-for="p in pages" :key="p[0]" :class="{active:page===p[0]}" @click="page=p[0]!" :aria-current="page===p[0]?'page':undefined"><span class="nav-icon" aria-hidden="true">{{p[1]}}</span>{{p[2]}}<span v-if="p[0]==='contracts' && contracts.length" class="nav-count">{{contracts.length}}</span></button></nav>
   <div class="sidebar-bottom"><button :class="{active:page==='settings'}" @click="page='settings'">⚙ <span>Settings</span></button><div class="local-badge"><span class="status-dot"></span> LOCAL TO THIS MAC</div></div>
  </aside>
  <main>
   <header class="topbar"><div class="breadcrumb">Egg, Inc. <span>/</span> {{title}}</div><div class="topbar-right"><span class="live-pill" :class="{warning:status?.paused||!connected||status?.error}"><span class="status-dot" :class="{pulse:status?.collecting}"></span>{{statusText()}}</span><button class="avatar" @click="page='settings'" aria-label="Account settings">{{snap?.name?.slice(0,1).toUpperCase()??'F'}}</button></div></header>
   <div class="content">
    <div v-if="status?.demo" class="banner demo-banner">SAMPLE DATA · Demo workspace. This is not your farm, and is stored separately.</div>
    <div class="page-heading"><div><div class="eyebrow">{{page==='overview'?'YOUR FARM, IN FOCUS':'FARM OBSERVATORY'}}</div><h1>{{title}}</h1><p>{{subtitle}}</p></div><div v-if="status?.configured" class="heading-actions"><span class="quiet refresh-countdown">{{status.paused?'Collection paused':status.nextPoll?'Next check in '+duration((status.nextPoll-now)/1000):status.collecting?'Reading game data…':''}}</span><button class="button" @click="act('refresh',{method:'POST'})" :disabled="busy||status.collecting||status.paused||!!status.nextPoll&&now<status.nextPoll"><span aria-hidden="true">↻</span> Refresh</button></div></div>
    <div v-if="error" class="banner error-banner" role="alert">{{error}}<button @click="error=''" aria-label="Dismiss error">×</button></div>
    <div v-if="!connected" class="banner error-banner" role="status">Connection to the local server was lost. Saved data remains visible; reconnecting automatically.</div>
    <div v-if="status?.error" class="banner error-banner" role="status">{{status.error}}</div>
    <template v-if="loading"><div class="empty-state">Opening your observatory…</div></template>
    <section v-else-if="!status?.configured" class="setup-grid">
     <div class="setup-card"><span class="setup-orbit">◉</span><div class="eyebrow">WELCOME TO YOUR OBSERVATORY</div><h2>Your whole farm.<br>One clear view.</h2><p>Connect your Egg, Inc. player ID to follow your farm, contracts, and lifetime stats. History stays right here on your Mac.</p><form @submit.prevent="saveAccount"><label for="first-eid">Player EID</label><input id="first-eid" v-model="eid" placeholder="EI followed by 16 digits" autocomplete="off" spellcheck="false" pattern="EI[0-9]{16}" required><div class="field-help">Copy your EID from Egg, Inc.’s Privacy &amp; Data screen.</div><button class="button primary" :disabled="busy||!/^EI\d{16}$/.test(eid.trim())">Connect my farm <span>↗</span></button></form></div>
     <div class="setup-explainer"><div class="eyebrow">WHAT YOU’LL SEE</div><article><span>01</span><div><h3>The farm you actually have</h3><p>Population, capacity, production, and rates calculated from your purchased upgrades.</p></div></article><article><span>02</span><div><h3>Every contract in view</h3><p>Reported progress, teammate contributions, and clearly labeled completion estimates.</p></div></article><article><span>03</span><div><h3>A history that grows with you</h3><p>Local charts and CSV exports, collected while this server runs.</p></div></article><div class="sync-explainer"><span class="status-dot"></span><p>Updates check every minute. Stats change when the game uploads a new save; this dashboard cannot force a game sync.</p></div></div>
    </section>
    <template v-else>
     <div v-if="snap" class="sync-strip"><span><span class="status-dot"></span> {{snap.name}}</span><span :title="date(status.lastSuccess)">Last checked <strong>{{age(status.lastSuccess,now)}}</strong></span><span :title="date(snap.backupAt)">Game backup <strong>{{age(snap.backupAt,now)}}</strong></span><span v-if="snap.backupAt && now-snap.backupAt>300000" class="stale-label">Waiting for a newer game sync</span></div>
     <template v-if="!snap && page!=='settings'"><div class="empty-state"><h2>{{status.collecting?'Reading your farm…':'Your first observation is on its way'}}</h2><p>The server is collecting your latest backup and active contracts.</p></div></template>
     <template v-else-if="page==='overview'">
      <div class="metrics-grid hero-metrics"><MetricCard :metric="home?.metrics.population" :now="now" accent/><MetricCard :metric="home?.metrics.laying" :now="now"/><MetricCard :metric="snap?.stats.soulEggs" :now="now"/><MetricCard :metric="snap?.stats.prophecyEggs" :now="now"/></div>
      <div class="overview-grid">
       <section class="panel farm-summary"><div class="panel-heading"><div><div class="eyebrow">HOME FARM</div><h2>{{home?.egg??'No home farm reported'}}</h2></div></div><HabitatChart :population="home?.metrics.population" :capacity="home?.metrics.capacity"/><div class="summary-pairs"><div><span>Egg value</span><strong>{{short(home?.metrics.eggValue?.value)}} <small>bocks</small></strong></div><div><span>Shipping capacity</span><strong>{{short(home?.metrics.shipping?.value)}} <small>eggs/s</small></strong></div></div><div v-if="estimatedPopulation!=null" class="estimate-callout">Offline scenario: <strong>{{short(estimatedPopulation)}}</strong> chickens now <span class="source estimated">estimated</span><small>Assumes you stayed offline since the saved farm timestamp.</small></div><button class="text-link" @click="page='home'">Explore home farm <span>→</span></button></section>
       <section class="panel"><div class="panel-heading"><div><div class="eyebrow">WORKING TOGETHER</div><h2>Active contracts <span class="count">{{contracts.length}}</span></h2></div><button class="text-link" @click="page='contracts'">View all →</button></div><div v-if="!contracts.length" class="inline-empty">No active contracts in your latest backup.</div><button v-for="c in contracts.slice(0,3)" :key="c.segment" class="contract-mini" @click="selectedContract=c.id;page='contracts'"><div class="split"><strong>{{c.name}}</strong><span class="grade">{{c.grade}}</span></div><div class="quiet">{{c.coop??'Solo / awaiting co-op'}}</div><div class="progress-track"><span :style="{width:(pct(c.metrics.delivered?.value,c.metrics.goal?.value)??0)+'%'}"></span></div><div class="split"><span>{{short(c.metrics.delivered?.value)}} / {{short(c.metrics.goal?.value)}}</span><span class="quiet">{{remaining(c)}} left</span></div></button></section>
      </div>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">THE LONG VIEW</div><h2>{{chosen?.label??'Population'}} over time</h2></div><button class="text-link" @click="page='history'">Explore history →</button></div><HistoryChart v-if="history.points.length" :points="history.points" :metric-key="metricKey" :label="chosen?.label??'Population'" :unit="chosen?.unit??'chickens'"/><div v-else class="chart-empty">Your first observations will appear here.<span>History begins when collection starts. Unchanged backups do not create new observations.</span></div></section>
     </template>
     <template v-else-if="page==='home'">
      <div class="section-title"><h2>{{home?.egg??'Home farm unavailable'}}</h2><span class="source reported" :title="date(home?.at)">Farm timestamp · {{age(home?.at,now)}}</span></div>
      <div class="metrics-grid"><MetricCard v-for="(m,i) in farmMetrics(home??undefined)" :key="i" :metric="m" :now="now" :accent="i===0"/></div>
      <div class="overview-grid"><section class="panel"><div class="panel-heading"><h2>Equipped artifacts</h2><span class="quiet">Home farm</span></div><div v-if="!home?.artifacts.length" class="inline-empty">No equipped artifacts reported.</div><div v-for="(a,i) in home?.artifacts" :key="i" class="artifact-row"><img v-if="a.image" :src="a.image" alt=""><div><strong>{{a.name}}</strong><p class="quiet">{{a.stones.join(' · ')||'No stones'}}</p></div></div></section><section class="panel"><div class="panel-heading"><h2>Active boosts</h2><span class="quiet">Saved state</span></div><div v-if="!home?.boosts.length" class="inline-empty">No active boosts reported.</div><div v-for="(b,i) in home?.boosts" :key="i" class="boost-row"><span>{{b.name.replaceAll('_',' ')}}</span><strong>{{b.until?duration((b.until-now)/1000):'Time unknown'}}</strong></div><p class="panel-note">Timers count from the saved farm timestamp. Expired boosts may remain listed until the next game sync.</p></section></div>
      <div v-for="note in home?.notes" :key="note" class="banner">{{note}}</div>
     </template>
     <template v-else-if="page==='contracts'">
      <div v-if="!contracts.length" class="empty-state"><h2>No active contracts</h2><p>Join a contract and sync the game. It will appear on the next check.</p></div>
      <template v-else><div class="contract-tabs" role="group" aria-label="Select contract"><button v-for="c in contracts" :key="c.segment" :class="{selected:contract?.id===c.id}" @click="selectedContract=c.id">{{c.name}} <span class="grade">{{c.grade}}</span></button></div>
       <template v-if="contract"><section class="panel contract-head"><div class="panel-heading"><div><div class="eyebrow">{{contract.coop??'SOLO / AWAITING CO-OP'}}</div><h2>{{contract.name}}</h2></div><div class="deadline"><strong>{{remaining(contract)}}</strong><span>time remaining</span></div></div><ContractGoals :goals="contract.goals" :delivered="contract.metrics.delivered" :final-goal="contract.metrics.goal"/><div class="forecast-line"><span class="source estimated">estimated</span> {{eta(contract)}}<small>Assumes the last reported rate holds; growth, boosts, and silos can change this.</small></div></section>
        <div v-if="contract.error" class="banner error-banner">{{contract.error}} Showing the last successful co-op response.</div>
        <div class="metrics-grid contract-metrics"><MetricCard :metric="contract.metrics.delivered" :now="now"/><MetricCard :metric="contract.metrics.rate" :now="now"/><MetricCard :metric="contract.metrics.goal" :now="now"/></div>
        <ContractPopulation :contract="contract" :farm="snap?.farms.find(f=>f.id===`farm:${contract?.id}`)" @history="entity=$event;metricKey='population';page='history'"/>
        <section class="panel table-panel"><div class="panel-heading"><div><h2>Co-op members <span class="count">{{members.length}}</span></h2><p class="quiet">Response checked {{age(contract.checkedAt,now)}} · farm timestamps shown when supplied.</p></div></div><div v-if="!members.length" class="inline-empty">Member details appear when a co-op response is available.</div><div v-else class="table-scroll"><table><thead><tr><th>Farmer</th><th v-for="[key,label] in [['contribution','Delivered'],['rate','Rate / sec'],['population','Population'],['capacity','Hab capacity'],['tokens','Tokens']]" :key="key" :aria-sort="sortKey===key?(sortDirection<0?'descending':'ascending'):'none'"><button @click="sort(key!)">{{label}} {{sortKey===key?(sortDirection<0?'↓':'↑'):'↕'}}</button></th><th>Farm timestamp</th><th>Artifacts</th></tr></thead><tbody><tr v-for="m in members" :key="m.id" :class="{me:m.me}"><td><strong>{{m.name}}</strong><span v-if="m.me" class="you-badge">YOU</span><span v-if="habitatStatus(m.metrics.population?.value,m.metrics.capacity?.value)?.isFull" class="hab-full-badge table-full-badge">✓ Habs full</span></td><td v-for="key in ['contribution','rate','population','capacity','tokens']" :key="key" :title="full(m.metrics[key]?.value)">{{short(m.metrics[key]?.value)}}<span v-if="key==='capacity'" class="member-occupancy">{{habitatStatus(m.metrics.population?.value,m.metrics.capacity?.value)?.label??'Occupancy unavailable'}}<template v-if="habitatStatus(m.metrics.population?.value,m.metrics.capacity?.value)"> occupied</template></span></td><td :title="date(m.metrics.population?.at)">{{age(m.metrics.population?.at,now)}}</td><td><div class="equipment-icons"><span v-if="!m.artifacts.length" class="quiet">—</span><img v-for="(a,i) in m.artifacts" :key="i" :src="a.image||'/icons/golden-egg.png'" :alt="a.name" :title="a.name+(a.stones.length?' · '+a.stones.join(', '):'')"></div></td></tr></tbody></table></div></section>
        <section v-if="snap?.farms.find(f=>f.id===`farm:${contract?.id}`)" class="panel"><div class="panel-heading"><h2>Your contract farm</h2><span class="quiet">Saved backup</span></div><div class="metrics-grid"><MetricCard v-for="(m,i) in farmMetrics(snap.farms.find(f=>f.id===`farm:${contract?.id}`))" :key="i" :metric="m" :now="now"/></div></section>
       </template>
      </template>
     </template>
     <template v-else-if="page==='stats'"><div class="section-title"><h2>Your lifetime, in numbers</h2><span class="quiet">Saved totals · {{age(snap?.backupAt,now)}}</span></div><div class="metrics-grid"><MetricCard v-for="(m,key) in snap?.stats" :key="key" :metric="m" :now="now" :accent="key==='soulEggs'"/></div><p class="panel-note">Saved egg totals follow the backup’s index order. Missing fields stay unavailable. Lifetime counters may cover different farm types according to the game’s own bookkeeping.</p></template>
     <template v-else-if="page==='history'">
      <section class="panel"><div class="history-controls"><label>Farm or account<select v-model="entity"><option v-if="!entities.includes(entity)" :value="entity">{{entityName(entity)}}</option><option v-for="e in entities" :key="e" :value="e">{{entityName(e)}}</option></select></label><label>Metric<select v-model="metricKey"><option v-if="!series.length" value="population">Population</option><option v-for="s in series" :key="s.key" :value="s.key">{{s.label}}</option></select></label><label>Time range<select v-model="range"><option value="1">Last hour</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option><option value="custom">Custom range</option></select></label><a class="button" :href="exportUrl" download>↓ Export CSV</a></div>
       <form v-if="range==='custom'" class="custom-range" @submit.prevent="loadHistory"><label>From<input type="datetime-local" v-model="from" required></label><label>To<input type="datetime-local" v-model="to" required></label><button class="button">Apply range</button></form>
       <div v-if="historyError" class="banner error-banner" role="alert">{{historyError}}</div><div class="panel-heading history-heading"><div><div class="eyebrow">{{entityName(entity)}}</div><h2>{{chosen?.label??'Population'}}</h2></div><div v-if="delta!=null" class="delta"><strong>{{Number(delta)>=0?'+':''}}{{short(delta)}}</strong><span>change across {{history.points.length}} observations</span></div><span v-else class="quiet">{{historyBusy?'Loading…':history.points.length+' observations · gaps preserved'}}</span></div>
       <HistoryChart v-if="history.points.length" :points="history.points" :metric-key="metricKey" :label="chosen?.label??metricKey" :unit="chosen?.unit??''"/><div v-else class="chart-empty">No observations in this range.<span>Choose a different range, or leave the local server running to collect history.</span></div><p class="panel-note">Charts use uploaded timestamps when available; otherwise member readings use co-op check time. Lines connect recorded observations, with dashed lines across collection gaps. New farm runs, counter resets, and missing values stay separate. Forecasts do not change reported totals.</p>
      </section>
      <section class="panel table-panel"><div class="panel-heading"><h2>Recent observations</h2><span class="quiet">Exact saved values</span></div><div class="table-scroll"><table><thead><tr><th>Observation timestamp</th><th>Collected</th><th>Value</th><th>Source</th></tr></thead><tbody><tr v-for="(p,i) in recentPoints" :key="i"><td>{{date(p.time)}}<span v-if="p.timeBasis==='checked'" class="time-basis">Co-op check time</span></td><td>{{date(p.collectedAt)}}</td><td>{{full(p.value)}} {{chosen?.unit}}</td><td><span class="source" :class="p.source">{{p.source}}</span></td></tr><tr v-if="!recentPoints.length"><td colspan="4" class="quiet">No saved observations yet.</td></tr></tbody></table></div></section>
     </template>
     <template v-else-if="page==='settings'">
      <div class="settings-grid"><section class="panel"><div class="eyebrow">COLLECTION</div><h2>Keep an eye on your farm</h2><p class="quiet">The collector runs independently of this browser tab. Keep the launcher open; your Mac must be awake and online.</p><label class="setting-label">Refresh interval<select v-model="interval" @change="saveInterval"><option :value="60">Every minute</option><option :value="120">Every 2 minutes</option><option :value="300">Every 5 minutes</option></select></label><button class="button" @click="togglePause" :disabled="busy">{{status?.paused?'▶ Resume collection':'Ⅱ Pause collection'}}</button><dl class="settings-details"><dt>Account</dt><dd>{{status?.maskedEid}}</dd><dt>Last successful check</dt><dd>{{date(status?.lastSuccess)}}</dd><dt>Storage</dt><dd>SQLite on this Mac · kept indefinitely</dd></dl></section>
      <section class="panel"><div class="eyebrow">ACCOUNT</div><h2>Replace your player EID</h2><p class="quiet">Switching accounts removes this account’s locally saved stats and history. Export any history you want to keep first.</p><form @submit.prevent="saveAccount"><label for="replace-eid">New EID</label><input id="replace-eid" v-model="eid" placeholder="EI followed by 16 digits" autocomplete="off" spellcheck="false" pattern="EI[0-9]{16}" required><label class="checkbox"><input type="checkbox" v-model="replace">Replace the account and delete its local history</label><button class="button" :disabled="busy||!replace||!/^EI\d{16}$/.test(eid.trim())">Replace account</button></form></section></div>
      <section class="panel"><div class="eyebrow">HOW LIVE DATA WORKS</div><h2>A window into the latest game sync</h2><p class="quiet">Refreshing checks Egg, Inc.’s servers. It does not force your game to upload. Open the game and allow it to sync when values look old. “Last checked” is when this dashboard fetched data; “Game backup” is when the game recorded it.</p><div class="legend-grid"><div><span class="source reported">reported</span><p>Values read from a backup or co-op response.</p></div><div><span class="source calculated">calculated</span><p>Values derived from actual equipment and upgrades.</p></div><div><span class="source estimated">estimated</span><p>Conditional scenarios that can change with gameplay.</p></div></div></section>
      <section class="panel danger-zone"><h2>Delete local data</h2><p class="quiet">Remove the saved EID, latest responses, and all dashboard history. This does not change anything in Egg, Inc.</p><label class="checkbox"><input type="checkbox" v-model="deleteConfirmed">I want to delete all saved dashboard data</label><button class="button danger" :disabled="!deleteConfirmed||busy" @click="deleteData">Delete local data</button></section>
     </template>
     <div v-for="note in snap?.notes" :key="note" class="banner">{{note}}</div>
    </template>
    <footer class="page-footer"><span>FARM OBSERVATORY <span class="footer-dot">·</span> Local Egg, Inc. companion</span><span>All times shown in your local timezone</span></footer>
   </div>
  </main>
 </div>
</template>
