import {buildPlanRecords,productCapacity} from './production-plan.mjs';
import {periodValue} from './production-period.mjs';
export const batchRows=(state,id)=>state.productions.filter(r=>r.batchId===id);
export const activeBatch=(state,key)=>{const matches=(state.productionBatches||[]).filter(b=>b.periodKey===key&&b.status==='active');if(matches.length>1)throw Error('같은 기간에 활성 배치가 여러 개입니다. 확인이 필요합니다.');return matches[0]||null;};
export const isActivePlan=(state,row)=>!row.cancelled&&row.status!=='replaced'&&(!row.batchId||(state.productionBatches||[]).some(b=>b.batchId===row.batchId&&b.status==='active'));
export function replacementPreview(state,periodKey,deductions,balance){
 const old=activeBatch(state,periodKey),sums=new Map();
 const entry=(code,warehouse,name)=>{const key=code+'|'+warehouse;if(!sums.has(key))sums.set(key,{code,name:name||state.materials.find(m=>m.code===code)?.name||code,warehouse,previous:0,required:0});return sums.get(key)};
 if(old)for(const r of batchRows(state,old.batchId).filter(r=>isActivePlan(state,r)))for(const line of r.lines)entry(line.code,r.warehouse,line.name).previous+=line.qty;
 for(const r of deductions)entry(r.code,r.warehouse,r.name).required+=r.required;
 return {old,rows:[...sums.values()].map(r=>{const current=balance(r.code)[r.warehouse];return {...r,restored:r.previous,net:r.previous-r.required,current,after:current+r.previous-r.required};})};
}
function assertOpen(state,rows){if(rows.some(r=>state.closes?.[r.date.slice(0,7)]))throw Error('확정된 마감월의 계획은 교체·취소할 수 없습니다.');}
export function replacePlanBatch(state,payload,id,actor,now){
 const period=periodValue(payload.periodStart,payload.periodEnd),old=activeBatch(state,period.periodKey);
 if(!Object.hasOwn(payload,'expectedBatchId')||(payload.expectedBatchId||null)!==(old?.batchId||null))throw Error('활성 배치가 변경되었습니다. 최신 파일 배치를 확인하세요.');
 if(!String(payload.fileName||'').trim())throw Error('파일명이 필요합니다.');
 const records=buildPlanRecords(state,payload,id,{minDate:'1900-01-01'});
 if(records.some(r=>r.date.slice(0,7)<period.periodStart||r.date.slice(0,7)>period.periodEnd))throw Error('포함된 계획일이 선택한 계획기간 밖에 있습니다.');
 const prior=old?batchRows(state,old.batchId):[];assertOpen(state,prior);
 const revision=Math.max(0,...(state.productionBatches||[]).filter(b=>b.periodKey===period.periodKey).map(b=>b.revision))+1,batchId=id+':batch';
 for(const [index,r] of records.entries()){const source=payload.rows[index];r.sequence=String(source.sequence||'').slice(0,150);r.sheetName=String(source.sheetName||'').slice(0,150);r.rowNumber=Number.isInteger(source.rowNumber)?source.rowNumber:null;r.batchId=batchId;r.status='active';r.capacity=productCapacity(r.name);r.lines=r.lines.map((l,i)=>({...l,name:state.materials.find(m=>m.code===l.code)?.name||l.code,unit:state.materials.find(m=>m.code===l.code)?.unit||'개',unitQty:Number(state.products.find(p=>p.code===r.product).bom[i].qty)}));}
 const totals=new Map();for(const r of records)for(const l of r.lines){const key=l.code+'|'+r.warehouse;totals.set(key,(totals.get(key)||0)+l.qty);if(!Number.isFinite(totals.get(key)))throw Error('자재 합계가 너무 큽니다.');}
 const batch={batchId,...period,fileName:String(payload.fileName).slice(0,250),revision,status:'active',createdAt:now,replaces:old?.batchId||null,replacedBy:null,planCount:records.length,bomLineCount:records.reduce((n,r)=>n+r.lines.length,0)};
 // Build all replacement state before publishing it to the caller; the route persists it in one CAS UPDATE.
 const productions=state.productions.map(r=>old&&r.batchId===old.batchId?{...r,status:'replaced',cancelled:true,replacedBy:batchId}:r).concat(records);
 const batches=(state.productionBatches||[]).map(b=>b===old?{...b,status:'replaced',replacedBy:batchId,replacedAt:now}:b).concat(batch);
 const audit={id,at:now,actor,type:'replaceProductionPlanBatch',description:'생산계획 파일 '+(old?'교체':'확정')+' · '+period.periodKey,payload:{...period,previousFileName:old?.fileName||'',fileName:batch.fileName,revision,previousPlanCount:prior.filter(r=>!r.cancelled).length,planCount:records.length,bomLineCount:batch.bomLineCount,replaces:batch.replaces,batchId}};
 Object.assign(state,{productions,productionBatches:batches,audit:[audit,...state.audit],processed:[...state.processed,id]});return state;
}
export function cancelPlanBatch(state,payload,id,actor,now){
 const batch=(state.productionBatches||[]).find(b=>b.batchId===payload.batchId);
 if(!batch||batch.status!=='active')throw Error('활성 배치만 취소할 수 있습니다. 교체된 배치는 복원할 수 없습니다.');
 const rows=batchRows(state,batch.batchId);assertOpen(state,rows);const reason=String(payload.reason||'').trim().slice(0,300);if(!reason)throw Error('취소 사유를 입력하세요.');
 Object.assign(state,{productionBatches:state.productionBatches.map(b=>b===batch?{...b,status:'cancelled',cancelledAt:now,reason}:b),productions:state.productions.map(r=>r.batchId===batch.batchId?{...r,status:'cancelled',cancelled:true,reason}:r),audit:[{id,at:now,actor,type:'cancelProductionPlanBatch',description:'생산계획 배치 취소 · '+batch.periodKey,payload:{batchId:batch.batchId,periodKey:batch.periodKey,fileName:batch.fileName,revision:batch.revision,planCount:rows.length,reason}},...state.audit],processed:[...state.processed,id]});return state;
}
