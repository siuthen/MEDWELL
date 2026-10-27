export const scheduleType=r=>r?.sourceType==='receipt'?'receipt':'qc';
export const scheduleName=r=>String(r?.itemName||r?.title||'').trim();
export function scheduleLabel(r){
 const type=scheduleType(r),parts=[scheduleName(r),String(r?.quantity||'').trim()].filter(Boolean);
 if(type==='receipt'&&r?.vendor)parts.push('['+String(r.vendor).trim()+']');
 return (type==='receipt'?'입고: ':'QC: ')+parts.join(' ');
}
export function showOnCalendar(r){
 if(scheduleType(r)==='receipt'||!String(r?.id||'').startsWith('qc-'))return true;
 return /\d[\d,]*\s*(?:EA|SET|박스|KG)(?![A-Za-z])|\d[\d,]{2,}\s*$/i.test(scheduleName(r));
}
export function isWeekdayDate(value){
 const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
 const date=new Date(text+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text)return false;
 const day=date.getUTCDay();return day>=1&&day<=5;
}
export function nextWeekdayDate(value){
 const date=new Date(String(value||'')+'T00:00:00Z');if(!Number.isFinite(date.getTime()))return '';
 while(!isWeekdayDate(date.toISOString().slice(0,10)))date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
}
export function weekdayCalendar(month){
 if(!/^\d{4}-\d{2}$/.test(String(month||'')))return {offset:0,dates:[]};
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),dates=[];
 for(let day=1;day<=days;day++){const date=month+'-'+String(day).padStart(2,'0');if(isWeekdayDate(date))dates.push(date);}
 return {offset:dates.length?new Date(dates[0]+'T00:00:00Z').getUTCDay()-1:0,dates};
}
