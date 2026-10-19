import { EventEmitter } from 'node:events';
import { Store, type Config } from './store.ts';
import { UpstreamError, type EggClient, type Raw } from './api.ts';
import { activeContracts, contractIdentity, normalize } from './normalize.ts';
import type { Dashboard, Snapshot } from '../shared/types.ts';

export class Collector extends EventEmitter {
  private running = false; private timer?: ReturnType<typeof setTimeout>; private epoch = 0;
  private lastAttempt: number|null; private lastSuccess: number|null; private nextPoll: number|null=null;
  private error: string|null=null; private backoff = new Map<string,{failures:number;until:number}>();
  private metadata:Raw={}; private metadataAt=0;
  constructor(readonly store:Store, private client:EggClient, private clock=Date.now, readonly demo=false) {
    super(); this.lastAttempt=store.get<number>('lastAttempt');this.lastSuccess=store.get<number>('lastSuccess');
    // Re-apply calculation fixes to the latest cached save immediately. This
    // is not a new game sync or history observation, and preserves timestamps.
    const account=store.config(),previous=store.get<Snapshot>('latest'),backup=store.rawValue('backup');
    if(account && previous && backup?.game)try {
      const coops=new Map<string,{raw:Raw;checkedAt:number}>(),errors=new Map<string,string>();
      for(const local of activeContracts(backup)) {
        const {id,segment}=contractIdentity(local),cached=store.rawValue('coop:'+segment);
        if(cached)coops.set(segment,cached);
        const error=previous.contracts.find(c=>c.id===id)?.error;if(error)errors.set(segment,error);
      }
      const updated=normalize(backup,coops,errors,store.rawValue('metadata')??{},account.eid,previous.at);
      updated.notes.push(...previous.notes);store.set('latest',updated);
    }catch {this.error='The cached save could not be recalculated. Waiting for the next successful game check.';}
  }
  view():Dashboard {
    const c=this.store.config();
    return { status:{configured:!!c,maskedEid:c?'EI••••••••••••'+c.eid.slice(-4):null,interval:c?.interval??60,paused:c?.paused??false,collecting:this.running,lastAttempt:this.lastAttempt,lastSuccess:this.lastSuccess,nextPoll:this.nextPoll,error:this.error,demo:this.demo},snapshot:this.store.get<Snapshot>('latest') };
  }
  private publish(){this.emit('update',this.view());}
  private schedule() {
    clearTimeout(this.timer);this.nextPoll=null;
    const c=this.store.config();if(!c || c.paused)return;
    const now=this.clock();this.nextPoll=Math.max(now,(this.lastAttempt??0)+c.interval*1000,this.backoff.get('backup')?.until??0);
    this.timer=setTimeout(()=>void this.refresh(),Math.max(100,this.nextPoll-now));this.timer.unref();
  }
  start(){this.schedule();}
  stop(){clearTimeout(this.timer);this.epoch++;this.removeAllListeners();}
  configure(config:Config,replace=false) {
    if(!/^EI\d{16}$/.test(config.eid))throw new Error('Use EI followed by 16 digits.');
    if(![60,120,300].includes(config.interval))throw new Error('Choose a supported refresh interval.');
    const previous=this.store.config();
    if(previous && previous.eid!==config.eid && !replace)throw new Error('Confirm replacing the account and deleting its saved history.');
    if(previous?.eid!==config.eid) {
      this.epoch++;this.store.clear();this.lastAttempt=null;this.lastSuccess=null;this.metadata={};this.metadataAt=0;this.backoff.clear();this.error=null;
    }
    this.store.set('account',config);this.schedule();this.publish();
  }
  clear(){this.epoch++;clearTimeout(this.timer);this.store.clear();this.lastAttempt=null;this.lastSuccess=null;this.nextPoll=null;this.error=null;this.metadata={};this.metadataAt=0;this.backoff.clear();this.publish();}
  private fail(key:string,err:unknown) {
    const failures=(this.backoff.get(key)?.failures??0)+1;
    const delay=Math.max(Math.min(60_000*2**Math.min(failures-1,5),30*60_000),err instanceof UpstreamError?err.retryAfter:0);
    this.backoff.set(key,{failures,until:this.clock()+delay});
  }
  async refresh():Promise<boolean> {
    const c=this.store.config(),now=this.clock();
    if(!c || c.paused || this.running || now < Math.max((this.lastAttempt??0)+c.interval*1000,this.backoff.get('backup')?.until??0))return false;
    clearTimeout(this.timer);this.running=true;this.nextPoll=null;this.lastAttempt=now;this.store.set('lastAttempt',now);this.publish();
    const epoch=this.epoch;
    try {
      const backup=await this.client.backup(c.eid);if(epoch!==this.epoch)return false;
      const metadataError:string[]=[];
      if(!this.metadataAt || now-this.metadataAt>=300_000) {
        if(now>=(this.backoff.get('metadata')?.until??0))try { const fetched=await this.client.metadata(c.eid);if(epoch!==this.epoch)return false;this.metadata=fetched;this.metadataAt=this.clock();this.backoff.delete('metadata'); }
        catch(err){if(epoch!==this.epoch)return false;this.fail('metadata',err);metadataError.push('Live event metadata is unavailable; no event-adjusted earnings forecast is shown.');}
        else metadataError.push('Live event metadata is unavailable; waiting before retrying.');
      }
      if(epoch!==this.epoch)return false;
      const coops=new Map<string,{raw:Raw;checkedAt:number}>(), errors=new Map<string,string>();
      for(const local of activeContracts(backup)) {
        if(!local.coopIdentifier)continue;
        const {id,segment}=contractIdentity(local), cacheKey='coop:'+segment;
        const cached=this.store.rawValue(cacheKey);if(cached)coops.set(segment,cached);
        if(now<(this.backoff.get(cacheKey)?.until??0)){errors.set(segment,'Retrying this co-op after a temporary API failure.');continue;}
        try {
          const raw=await this.client.coop(c.eid,id,local.coopIdentifier);if(epoch!==this.epoch)return false;
          const value={raw,checkedAt:this.clock()};coops.set(segment,value);this.store.raw(cacheKey,value);this.backoff.delete(cacheKey);
        }catch(err){if(epoch!==this.epoch)return false;this.fail(cacheKey,err);errors.set(segment,err instanceof Error?err.message:'Co-op temporarily unavailable.');}
      }
      if(epoch!==this.epoch)return false;
      this.store.raw('backup',backup);this.store.raw('metadata',this.metadata);
      const allowed=new Set(['backup','metadata',...activeContracts(backup).map(l=>'coop:'+contractIdentity(l).segment)]);
      for(const row of this.store.db.prepare('SELECT key FROM raw').all())if(!allowed.has(String(row.key)))this.store.db.prepare('DELETE FROM raw WHERE key=?').run(String(row.key));
      const snapshot=normalize(backup,coops,errors,this.metadata,c.eid,this.clock());snapshot.notes.push(...metadataError);
      this.store.save(snapshot,c.interval);this.lastSuccess=this.clock();this.store.set('lastSuccess',this.lastSuccess);this.error=null;this.backoff.delete('backup');
      return true;
    }catch(err){
      if(epoch===this.epoch){this.fail('backup',err);this.error=err instanceof Error?err.message:'Collection failed. Last saved stats are still available.';}
      return false;
    }finally{this.running=false;this.schedule();this.publish();}
  }
}
