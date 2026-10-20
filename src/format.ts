import type { Value } from '../shared/types.ts';
export function percentage(a:unknown,b:unknown): number|null {
  if(a==null||b==null||a===''||b==='')return null;
  const n=Number(a),d=Number(b);
  return Number.isFinite(n)&&Number.isFinite(d)&&d>0 ? Math.max(0,Math.min(100,n/d*100)) : null;
}
export function percentText(value:number|null) {return value==null?'Unavailable':value.toFixed(1)+'%';}
export function short(v:Value|undefined) {
  if(v==null)return '—';
  const n=Number(v);if(!Number.isFinite(n))return '—';
  if(Math.abs(n)>0 && Math.abs(n)<.001)return n.toExponential(2);
  const units=['','K','M','B','T','q','Q','s','S','o','N','d'];
  const i=Math.min(Math.max(0,Math.floor(Math.log10(Math.abs(n)||1)/3)),units.length-1);
  if(Math.abs(n)>=1e36)return n.toExponential(2);
  return (n/1000**i).toLocaleString(undefined,{maximumFractionDigits:i?2:2})+units[i];
}
export function full(v:Value|undefined) {
  if(v==null)return 'Unavailable';
  if(typeof v==='string' && /^-?\d+$/.test(v))return BigInt(v).toLocaleString();
  return Number(v).toLocaleString(undefined,{maximumFractionDigits:8});
}
export function age(at:number|null|undefined,now=Date.now()) {
  if(!at)return 'Not reported';
  const s=Math.max(0,Math.floor((now-at)/1000));
  return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`;
}
export function duration(s:number|null|undefined) {
  if(s==null || !Number.isFinite(s))return '—';s=Math.max(0,Math.floor(s));
  if(s>=86400)return `${Math.floor(s/86400)}d ${Math.floor(s%86400/3600)}h`;
  if(s>=3600)return `${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;
  if(s>=60)return `${Math.floor(s/60)}m ${s%60}s`;
  return `${s}s`;
}

export function completionTime(at: number, now: number) {
  const date = new Date(at), today = new Date(now), tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const day = sameDay(date, today) ? 'Today' : sameDay(date, tomorrow) ? 'Tomorrow' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) });
  return day + ' at ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function estimateCountdown(at: number, now: number) {
  const minutes = Math.max(0, Math.ceil((at - now) / 60000));
  if (minutes <= 1) return '1 minute';
  if (minutes < 60) return minutes + 'm';
  if (minutes < 1440) return Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm';
  return Math.floor(minutes / 1440) + 'd ' + Math.floor(minutes % 1440 / 60) + 'h';
}
