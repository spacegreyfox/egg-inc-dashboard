import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { inflateSync, gunzipSync } from 'node:zlib';

export const proto = protobuf.parse(readFileSync(new URL('../vendor/ei.proto', import.meta.url), 'utf8')).root;
export type Raw = Record<string, any>;
const base = 'https://ctx-dot-auxbrainhome.appspot.com';
export class UpstreamError extends Error {
  constructor(message: string, public retryAfter = 0) { super(message); }
}
export function decodeResponse(text: string, type: string, wrapped: boolean): Raw {
  if (text.length > 28_000_000 || !/^[\s\w+/=-]*$/.test(text)) throw new UpstreamError('The game returned an invalid response.');
  let bytes: Uint8Array = Buffer.from(text.trim(), 'base64');
  if (wrapped) {
    const envelope = proto.lookupType('ei.AuthenticatedMessage').decode(bytes) as any;
    if (!envelope.message?.length) throw new UpstreamError('The game response was empty.');
    bytes = envelope.message;
    if (envelope.compressed) {
      try { bytes = inflateSync(bytes, { maxOutputLength: 20_000_000 }); }
      catch { bytes = gunzipSync(bytes, { maxOutputLength: 20_000_000 }); }
    }
  }
  const t = proto.lookupType(type);
  return t.toObject(t.decode(bytes), { longs: String, enums: Number, defaults: false });
}
export interface EggClient {
  backup(eid: string): Promise<Raw>;
  coop(eid: string, contract: string, coop: string): Promise<Raw>;
  metadata(eid: string): Promise<Raw>;
}
export class GameClient implements EggClient {
  constructor(private transport: typeof fetch = fetch) {}
  private rinfo(eid: string) { return { eiUserId: eid, clientVersion: 75, version: '1.37.2', build: '111359', platform: 2 }; }
  private async request(path: string, requestType: string, responseType: string, payload: Raw, wrapped = true) {
    const t = proto.lookupType(requestType);
    const data = Buffer.from(t.encode(t.fromObject(payload)).finish()).toString('base64');
    try {
      const r = await this.transport(base + path, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data }), signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const header = r.headers.get('retry-after');
        const seconds = header ? (Number.isFinite(Number(header)) ? Number(header) : (Date.parse(header) - Date.now()) / 1000) : 0;
        throw new UpstreamError(r.status === 429 ? 'Game API rate limit reached; retrying later.' : `Game API returned HTTP ${r.status}.`, Math.max(0, seconds * 1000));
      }
      return decodeResponse(await r.text(), responseType, wrapped);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(err instanceof Error && /timeout|abort/i.test(err.name + err.message) ? 'Game API request timed out.' : 'Could not read the game API. Your last saved stats are still available.');
    }
  }
  async backup(eid: string) {
    const r = await this.request('/ei/bot_first_contact', 'ei.EggIncFirstContactRequest', 'ei.EggIncFirstContactResponse', { rinfo: this.rinfo(eid), eiUserId: eid, clientVersion: 75, deviceId: 'local-farm-observatory', platform: 2 }, false);
    if (r.errorCode || r.errorMessage || !r.backup?.game) throw new UpstreamError('No player backup was returned. Check your EID and sync the game.');
    return r.backup;
  }
  async coop(eid: string, contract: string, coop: string) {
    const r = await this.request('/ei/coop_status', 'ei.ContractCoopStatusRequest', 'ei.ContractCoopStatusResponse', { rinfo: this.rinfo(eid), userId: eid, contractIdentifier: contract, coopIdentifier: coop, clientVersion: 75 });
    if (r.responseStatus && r.responseStatus !== 0) throw new UpstreamError('Co-op status is temporarily unavailable or membership has changed.');
    if (!r.contractIdentifier) throw new UpstreamError('The game returned an incomplete co-op response.');
    return r;
  }
  metadata(eid: string) {
    return this.request('/ei/get_periodicals', 'ei.GetPeriodicalsRequest', 'ei.PeriodicalsResponse', { rinfo: this.rinfo(eid), userId: eid, currentClientVersion: 75, contractsUnlocked: true, artifactsUnlocked: true });
  }
}
