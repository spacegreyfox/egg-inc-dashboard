import { resolve } from 'node:path';
import { Store } from './store.ts';
import { Collector } from './collector.ts';
import { GameClient } from './api.ts';
import { createApp } from './app.ts';
import { DemoClient } from './demo.ts';

const demo=process.env.DASHBOARD_DEMO==='1';
const port=Number(process.env.DASHBOARD_PORT??8890);
const path=process.env.DASHBOARD_DATA??resolve(import.meta.dirname,'../data',demo?'demo.sqlite':'farm.sqlite');
const store=new Store(path),collector=new Collector(store,demo?new DemoClient():new GameClient(),Date.now,demo);
if(demo && !store.config())collector.configure({eid:'EI0000000000000000',interval:60,paused:false});
const app=await createApp(collector,port);
try {await app.listen({port,host:'127.0.0.1'});collector.start();console.log(`Farm Observatory ${demo?'(DEMO) ':''}→ http://localhost:${port}\nKeep this terminal open to collect stats. Press Control-C to stop.`);}
catch {console.error(`Could not start on port ${port}. It may already be in use.`);store.close();process.exit(1);}
const shutdown=async()=>{collector.stop();await app.close();store.close();process.exit(0);};
process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
