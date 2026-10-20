import type { Member, Value } from '../shared/types.ts';
const value = (v: Value | undefined): number | null => v == null || v === '' || !Number.isFinite(Number(v)) || Number(v)<0 ? null : Number(v);
export function productionLimit(member: Member): string {
  const laying=value(member.metrics.laying?.value), shipping=value(member.metrics.shipping?.value);
  if(laying==null || shipping==null)return 'Production unavailable';
  if(laying===0 && shipping===0)return 'No production reported';
  if(laying===0)return 'No laying reported';
  return shipping<laying?'Shipping limited':laying<shipping?'Laying limited':'Balanced';
}
export function sortedProduction(members: Member[], key: string, direction: number): Member[] {
  return [...members].sort((a,b)=>{
    const av=value(a.metrics[key]?.value), bv=value(b.metrics[key]?.value);
    return av==null ? bv==null?a.name.localeCompare(b.name):1 : bv==null?-1 : direction*(av-bv)||a.name.localeCompare(b.name);
  });
}
