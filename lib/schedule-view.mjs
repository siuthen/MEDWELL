export const scheduleType=r=>r?.scheduleKind||(r?.sourceType==='receipt'?'receipt':'qc');
const scheduleTypeOrder={receipt:0,qc:1,manufacturing:2};
const compareScheduleTypes=(a,b)=>(scheduleTypeOrder[scheduleType(a)]??3)-(scheduleTypeOrder[scheduleType(b)]??3);
export function compareScheduleListRows(a,b){
 return a.date.localeCompare(b.date)||compareScheduleTypes(a,b)||a.id.localeCompare(b.id);
}
export function calendarSchedulesForDate(records,date){
 // The input is ordered by the list comparator. A stable type sort preserves its start-date and ID order within each type.
 return records.filter(row=>scheduleDates(row).includes(date)&&showOnCalendar(row)).sort(compareScheduleTypes);
}
export const scheduleName=r=>String(r?.itemName||r?.title||'').trim();
export const scheduleEndDate=r=>String(r?.endDate||r?.date||'');
export function scheduleLabel(r){const parts=[scheduleName(r),String(r?.quantity??'').trim()].filter(Boolean);const vendor=String(r?.vendor||'').trim(),note=String(r?.note||'').trim();if(vendor)parts.push('['+vendor+']');if(note)parts.push(note);return parts.join(' ');}
export function scheduleKindLabel(r){return scheduleType(r)==='receipt'?'입고':scheduleType(r)==='manufacturing'?'제조':'QC';}
export function showOnCalendar(r){if(scheduleType(r)==='manufacturing'||scheduleType(r)==='receipt'||!String(r?.id||'').startsWith('qc-'))return true;return /\d[\d,]*\s*(?:EA|SET|박스|KG)(?![A-Za-z])|\d[\d,]{2,}\s*$/i.test(scheduleName(r));}
export function isWeekdayDate(value){const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;const date=new Date(text+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text)return false;const day=date.getUTCDay();return day>=1&&day<=5;}
export function nextWeekdayDate(value){const date=new Date(String(value||'')+'T00:00:00Z');if(!Number.isFinite(date.getTime()))return '';while(!isWeekdayDate(date.toISOString().slice(0,10)))date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
export function scheduleDates(r){const start=String(r?.date||''),end=scheduleEndDate(r);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return [];const out=[],d=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');while(d<=last){const v=d.toISOString().slice(0,10);if(isWeekdayDate(v))out.push(v);d.setUTCDate(d.getUTCDate()+1);}return out;}
export function scheduleOverlapsMonth(r,month){return scheduleDates(r).some(d=>d.startsWith(month));}
export function shiftWeekdayRange(oldStart,oldEnd,newStart){const count=Math.max(1,scheduleDates({date:oldStart,endDate:oldEnd}).length),d=new Date(newStart+'T00:00:00Z');let seen=0,last=newStart;while(seen<count){const v=d.toISOString().slice(0,10);if(isWeekdayDate(v)){seen++;last=v;}if(seen<count)d.setUTCDate(d.getUTCDate()+1);}return last;}
export function weekdayCalendar(month){if(!/^\d{4}-\d{2}$/.test(String(month||'')))return {offset:0,dates:[]};const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),dates=[];for(let day=1;day<=days;day++){const date=month+'-'+String(day).padStart(2,'0');if(isWeekdayDate(date))dates.push(date);}return {offset:dates.length?new Date(dates[0]+'T00:00:00Z').getUTCDay()-1:0,dates};}
