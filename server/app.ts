import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { Collector } from './collector.ts';
import { csv } from './store.ts';

export async function createApp(collector:Collector,port=8890) {
  const app=Fastify({logger:false,bodyLimit:8192,forceCloseConnections:true});
  app.addHook('onRequest',async(req,reply)=>{
    const host=req.headers.host?.split(':')[0];
    const allowed=new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`]);
    if(process.env.DASHBOARD_DEV==='1')allowed.add('http://127.0.0.1:5173');
    if(!['localhost','127.0.0.1'].includes(host??'') || req.headers.origin && !allowed.has(req.headers.origin)) return reply.code(403).send({error:'This dashboard accepts local requests only.'});
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
    if(!req.url.startsWith('/api/'))reply.header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  });
  app.setErrorHandler((err,_req,reply)=>{const code=(err as {statusCode?:number}).statusCode??500;reply.code(code).send({error:code<500 ? 'Invalid request. Check your entries.' : 'The local server could not finish this request.'});});
  app.get('/api/dashboard',async()=>collector.view());
  app.post<{Body:{eid?:string;interval?:number;paused?:boolean;replace?:boolean}}>('/api/account',async(req,reply)=>{
    const old=collector.store.config(), b=req.body??{};
    if(b.paused!=null && typeof b.paused!=='boolean')return reply.code(400).send({error:'Paused must be true or false.'});
    if(b.eid!=null && typeof b.eid!=='string')return reply.code(400).send({error:'Enter an EID.'});
    try{collector.configure({eid:b.eid?.trim()??old?.eid??'',interval:b.interval??old?.interval??60,paused:b.paused??old?.paused??false},b.replace===true);return collector.view();}
    catch(err){return reply.code(400).send({error:err instanceof Error?err.message:'Invalid account.'});}
  });
  app.post('/api/refresh',async(_req,reply)=>{const ok=await collector.refresh();return reply.code(ok?200:202).send(collector.view());});
  app.delete('/api/account',async()=>{collector.clear();return collector.view();});
  function history(query:Record<string,string>) {
    const from=Number(query.from??Date.now()-86400_000),to=Number(query.to??Date.now());
    if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)throw Object.assign(new Error('Invalid range'),{statusCode:400});
    const entity=query.entity??'home',key=query.key??'population';
    return {entity,key,result:collector.store.history(entity,key,from,to)};
  }
  app.get<{Querystring:Record<string,string>}>('/api/history',async(req)=>history(req.query).result);
  app.get<{Querystring:Record<string,string>}>('/api/history.csv',async(req,reply)=>{
    const {entity,key,result}=history(req.query);return reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="farm-history.csv"').send(csv(result,entity,key));
  });
  app.get('/api/events',(req,reply)=>{
    reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
    const send=(data:unknown)=>{if(!reply.raw.destroyed)reply.raw.write(`event: update\ndata: ${JSON.stringify(data)}\n\n`);};
    send(collector.view());collector.on('update',send);
    const timer=setInterval(()=>{if(!reply.raw.destroyed)reply.raw.write(': heartbeat\n\n');},20000);timer.unref();
    req.raw.on('close',()=>{clearInterval(timer);collector.off('update',send);});
  });
  const root=fileURLToPath(new URL('../dist/',import.meta.url));
  if(existsSync(root))await app.register(fastifyStatic,{root,index:'index.html'});
  app.setNotFoundHandler((_req,reply)=>reply.code(404).send({error:'Page not found.'}));
  app.addHook('onClose',async()=>collector.stop());
  return app;
}
