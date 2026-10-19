import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Snapshot, Metrics, HistoryResult, HistorySeries } from '../shared/types.ts';
export interface Config { eid: string; interval: number; paused: boolean }
interface Continuity { lastCheckedAt: number; pendingGap: boolean }
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA user_version=1;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS samples (id INTEGER PRIMARY KEY, entity TEXT NOT NULL, segment TEXT NOT NULL, collected INTEGER NOT NULL, observed INTEGER NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, gap INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS samples_lookup ON samples(entity, observed);
      CREATE TABLE IF NOT EXISTS raw (key TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
  }
  get<T>(key:string):T|null { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(String(row.value)) : null; }
  set(key:string,value:any) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key,JSON.stringify(value)); }
  config() { return this.get<Config>('account'); }
  raw(key:string,value:any) { this.db.prepare('INSERT OR REPLACE INTO raw VALUES (?,?)').run(key,JSON.stringify(value)); }
  rawValue(key:string):any { const r=this.db.prepare('SELECT payload FROM raw WHERE key=?').get(key);return r?JSON.parse(String(r.payload)):null; }
  clear() { this.db.exec('BEGIN; DELETE FROM settings; DELETE FROM samples; DELETE FROM raw; COMMIT; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'); }
  save(snapshot: Snapshot, interval: number) {
    const previous = this.get<Snapshot>('latest');
    const continuity = this.get<Record<string,Continuity>>('sample-continuity') ?? {};
    this.db.exec('BEGIN');
    try {
      const insert = (entity:string, segment:string, metrics:Metrics, available=true, checkedAt?:number|null) => {
        const cursor=continuity[entity];
        const lastCheck=cursor?.lastCheckedAt??previous?.at;
        const collectionGap=lastCheck==null || snapshot.at-lastCheck>interval*2500;
        const pendingGap=(cursor?.pendingGap??false)||collectionGap||!available;
        continuity[entity]={lastCheckedAt:available?snapshot.at:lastCheck??snapshot.at,pendingGap};
        // Some co-op replies include populations but no usable farm timestamp.
        // Keep that timestamp unavailable on the metric; record when we read it.
        const observed = Math.max(0,...Object.values(metrics).map(m=>m.at ?? 0)) || checkedAt || 0;
        if (!observed || !available) return;
        const payload = JSON.stringify(metrics), fingerprint = createHash('sha256').update(payload).digest('hex');
        const last = this.db.prepare('SELECT * FROM samples WHERE entity=? ORDER BY id DESC LIMIT 1').get(entity);
        if (last && last.fingerprint === fingerprint && last.segment === segment) return;
        // Ignore upstream samples that travel backwards in time within one run.
        if (last && last.segment === segment && Number(last.observed)>observed) return;
        // A delayed game upload is not a collector outage. Keep pending gaps
        // through unchanged backups until the next distinct observation.
        const gap = pendingGap || !last || last.segment!==segment;
        this.db.prepare('INSERT INTO samples(entity,segment,collected,observed,fingerprint,payload,gap) VALUES (?,?,?,?,?,?,?)').run(entity,segment,snapshot.at,observed,fingerprint,payload,Number(gap));
        continuity[entity]!.pendingGap=false;
      };
      insert('account','account',snapshot.stats);
      for (const f of snapshot.farms) insert(f.id,f.segment,f.metrics);
      for (const c of snapshot.contracts) {
        insert(`contract:${c.id}`,c.segment,c.metrics,!c.error);
        for (const m of c.members) insert(`member:${c.id}:${m.id}`,c.segment,m.metrics,!c.error,c.checkedAt);
      }
      this.set('sample-continuity',continuity);
      this.set('latest',snapshot); this.db.exec('COMMIT');
    } catch(err) { this.db.exec('ROLLBACK');throw err; }
  }
  history(entity:string,key:string,from:number,to:number):HistoryResult {
    const available = this.db.prepare('SELECT entity,payload FROM samples GROUP BY entity HAVING id=MAX(id)').all();
    const series:HistorySeries[]=[];
    for(const row of available) for(const [key,m] of Object.entries(JSON.parse(String(row.payload)) as Metrics)) series.push({entity:String(row.entity),key,label:m.label,unit:m.unit});
    const rows = this.db.prepare('SELECT * FROM samples WHERE entity=? AND observed>=? AND observed<=? ORDER BY observed,id').all(entity,from,to);
    let previous:number|null=null, segment:string|null=null;
    const points = rows.map(row=> {
      const m = (JSON.parse(String(row.payload)) as Metrics)[key];
      const value=m?.value??null, n=value==null?null:Number(value);
      const gap=!!row.gap || segment!==null && segment!==row.segment || previous!=null && n!=null && key !== 'cash' && /prestiges|drones|eliteDrones|boostsUsed|piggyBreaks|goldEarned|goldSpent|lifetimeCash|contribution|delivered|eggsLaid|eggsShipped|eggTotal/.test(key) && n<previous;
      previous=n;segment=String(row.segment);
      return {time:Number(row.observed),collectedAt:Number(row.collected),value,segment:String(row.segment),source:m?.source??'reported' as const,gap,timeBasis:m?.at==null?'checked' as const:'source' as const};
    });
    return {series,points};
  }
  close(){this.db.close();}
}
export function csv(result:HistoryResult, entity:string,key:string) {
  const esc=(v:any)=>'"'+String(v??'').replaceAll('"','""')+'"';
  return ['observed_at,collected_at,entity,metric,value,source,segment,gap,time_basis',...result.points.map(p=>[new Date(p.time).toISOString(),new Date(p.collectedAt).toISOString(),entity,key,p.value,p.source,p.segment,p.gap,p.timeBasis??'source'].map(esc).join(','))].join('\r\n');
}
