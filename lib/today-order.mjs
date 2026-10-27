export function koreaDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function todaySort(rows,kind='order',now=new Date()){
 const today=koreaDate(now),valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||''),date=r=>kind==='receipt'?r.date:r.expected||r.date;
 const rank=r=>kind==='receipt'?r.date===today?0:1:r.date===today||r.expected===today?0:valid(date(r))&&date(r)>today?1:2;
 return [...rows].sort((a,b)=>rank(a)-rank(b)||(kind==='order'&&rank(a)===1?String(date(a)).localeCompare(String(date(b))):String(date(b)||'').localeCompare(String(date(a)||''))));
}
