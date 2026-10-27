import qc from '../data/qc-schedule-records.json' with {type:'json'};
import purchases from '../data/purchase-calendar-records.json' with {type:'json'};
import bom from '../data/bom-source-full.json' with {type:'json'};
import {isWeekdayDate} from './schedule-view.mjs';
import {opaqueSourceScheduleId} from './schedule-source-sync.mjs';
const PREVIOUS_RELEASE='2026-10-20:schedule-purchases:v2';
export const RELEASE='2026-10-20:schedule-weekdays:v3';
const OBSOLETE_PURCHASE_IDS=new Set(['po-calendar-2026-2026-10-05-B8','po-calendar-2026-2026-10-04-A13','po-calendar-2026-2026-10-11-A20','po-calendar-2026-2026-10-12-B23','po-calendar-2026-2026-10-18-A33','po-calendar-2026-2026-10-25-A47']);
export function migrateRelease(s){
 if(s.migrations?.scheduleBom===RELEASE)return s;
 const previous=s.migrations?.scheduleBom,baseNeeded=previous!==PREVIOUS_RELEASE;
 let schedules=(s.schedules||[]).map(r=>{const {sourceUrl,sourceTitle,sourceSheet,sourceCell,...kept}=r;return kept.note==='QC Schedule_2026 원본'?{...kept,note:''}:kept;}).filter(r=>!(OBSOLETE_PURCHASE_IDS.has(r.id)&&r.sourceType==='receipt')),ids=new Set(schedules.map(r=>r.id));
 for(const r of qc.records)if(!ids.has(r.id)){schedules.push({...r});ids.add(r.id);}
 for(const r of purchases){const index=schedules.findIndex(x=>x.id===r.id);if(index<0){schedules.push({...r,note:''});ids.add(r.id);}else{const old=schedules[index];schedules[index]={...r,note:old.note||'',...(old.deleted?{deleted:true}:{})};}}
 if(!baseNeeded){Object.assign(s,{schedules,migrations:{...s.migrations,scheduleBom:RELEASE}});return s;}
 const products=s.products.map(p=>({...p,bom:p.bom?.map(l=>({...l}))})),materials=s.materials.filter(m=>!m.deleted),find=c=>materials.find(m=>m.code===c);
 const provenance={file:'bom_source_full.json',date:'2026-10-19',method:'exact 제품코드 + exact 자재코드',sourceSheet:''};
 for(const change of bom.safeChanges){
  const p=products.find(p=>!p.deleted&&p.code===change.productCode),line=change.line,sourceMeta=p&&bom.source[p.code];
  if(!p||!sourceMeta||!find(line.code)||typeof line.qty!=='number'||!(line.qty>0)||!Number.isFinite(line.qty)||p.bom.some(l=>l.code===line.code))continue;
  p.bom.push({code:line.code,qty:line.qty,source:{...provenance,sourceSheet:sourceMeta.sheet}});p.version='원본 보강 · 2026-10-19';p.source={...provenance,sourceSheet:sourceMeta.sheet};
 }
 const cc=find('MHT-RG00-CC'),bx=find('MHC-RG00-BX'),source=bom.source['HC-RG00'];
 if(!products.some(p=>p.code==='HC-RG00')&&source?.code==='HC-RG00'&&source.name==='C_리젠트론미스틱솔루션80ml'&&cc&&bx&&/리젠트론\s*미스틱\s*솔루션/.test(cc.name)&&/용기/.test(cc.name)&&/리젠트론미스틱솔루션80ml/.test(bx.name)&&/단상자/.test(bx.name))products.push({code:source.code,name:source.name,unit:'개',approved:true,version:'원본 교차확인 · 2026-10-19',usageEra:'2023_plus',bom:[{code:cc.code,qty:1},{code:bx.code,qty:1}],source:{...provenance,sourceSheet:source.sheet,plan:'260929_26.10_11_____________V3.xlsx · 26.10-11월계획!71:74',scope:'중국용 · 공용 용기 + C 단상자; 미등록 벌크/캡 제외'}});
 const reviews=[{id:'fx83-conflict',product:'LC-FX83-2',title:'원본 불일치/검토 필요',detail:'MLT-FX83-PC: 기존 10 유지 / 공유 BOM 50. 자동 변경하지 않음.',source:'bom_source_full.json'},{id:'regenic-unmatched',title:'리제닉 마스크 · 원본 매칭 검토',detail:'생산계획의 품명·구성만으로 exact 제품코드와 시장이 확정되지 않아 비활성 후보로 보존합니다.',source:'260929_26.10_11_____________V3.xlsx · 26.10-11월계획!102:105',composition:['중국_파우치','국내-파우치','C_중국단상자(5개입)','KI-단상자(국내/인터)'],active:false}];
 Object.assign(s,{schedules,products,bomSourceReviews:s.bomSourceReviews||reviews,migrations:{...s.migrations,scheduleBom:RELEASE}});return s;
}
export function applySchedule(s,type,p,id,actor,now){
 if(!id||typeof id!=='string')throw Error('요청번호가 없습니다.');if(s.processed.includes(id))return s;
 if(!p||typeof p!=='object')throw Error('일정 입력을 확인하세요.');
 const current=s.schedules||[],old=current.find(r=>(r.id===p.id||(r.sourceId&&opaqueSourceScheduleId(r.sourceId)===p.id))&&!r.deleted);let row;
 if(type!=='scheduleCreate'&&!old)throw Error('수정할 일정이 없습니다.');
 if(type==='scheduleDelete')row={...old,deleted:true};else{
  if(typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||new Date(p.date+'T00:00:00Z').toISOString().slice(0,10)!==p.date)throw Error('일정 날짜를 확인하세요.');
  if(!isWeekdayDate(p.date))throw Error('토·일에는 일정을 등록할 수 없습니다.');
  if(typeof p.title!=='string'||!p.title.trim()||p.title.length>2000||/[\r\n]/.test(p.title)||typeof(p.note??'')!=='string'||(p.note||'').length>5000)throw Error('품목명·비고를 확인하세요.');
  row=old?.sourceType==='receipt'?{...old,date:p.date,itemName:p.title,note:p.note||''}:{...old,id:old?.id||'schedule:'+id,date:p.date,title:p.title,note:p.note||'',...(!old?{sourceType:'qc'}:{})};
 }
 const schedules=old?current.map(r=>r.id===old.id?row:r):current.concat(row);
 Object.assign(s,{schedules,audit:[{id,at:now,actor,type,description:type==='scheduleDelete'?'일정 삭제':'일정 저장',payload:{before:old||null,after:row}},...s.audit],processed:s.processed.concat(id)});return s;
}
