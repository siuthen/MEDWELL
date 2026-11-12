import {allocateMaterial,stockBalances,WH,activePlan} from './plan-stock.mjs';
import {planQuantity} from './production-plan.mjs';
const fail=message=>{throw Error(message)};
const positive=(value,label)=>{if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||!(Number(value)>0))fail(label+'은 양의 유한 숫자여야 합니다.');return Number(value)};
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value&&value>='1900-01-01';
const close=(a,b)=>Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-12;
export function editAutoProductionPlan(state,payload,id,actor,now){
 const plan=state.productions.find(p=>p.id===payload.id);
 if(!plan||plan.kind!=='productionPlan'||plan.allocationMode!=='auto'||!activePlan(state,plan)||['cancelled','deleted','replaced'].includes(plan.status))fail('수정할 활성 생산계획이 없습니다.');
 if(plan.batchId)fail('파일 배치 계획은 파일 교체로 수정하세요.');
 if(Object.hasOwn(payload,'product')&&payload.product!==(plan.product||''))fail('자동 계획의 품목코드는 변경할 수 없습니다.');
 const oldQty=positive(planQuantity(plan),'기존 계획수량'),newQty=positive(payload.qty,'누적 계획수량');
 if(!validDate(plan.date)||!validDate(payload.date))fail('유효한 계획일을 입력하세요.');
 if(state.closes?.[plan.date.slice(0,7)]||state.closes?.[payload.date.slice(0,7)])fail('확정된 마감월입니다. 먼저 마감을 해제하세요.');
 if(!Array.isArray(plan.lines))fail('저장된 BOM 스냅샷을 확인하세요.');
 const pools=new Map(),stock=code=>{if(!pools.has(code)){const balance=stockBalances(state,code);if(WH.some(w=>!Number.isFinite(balance[w])))fail('현재 재고를 확인하세요.');pools.set(code,{...balance});}return pools.get(code)};
 const lines=plan.lines.map(line=>{
  const oldTotal=positive(line.qty,'저장 BOM 수량'),ratio=line.unitQty===undefined?oldTotal/oldQty:positive(line.unitQty,'저장 BOM 단위소요량');
  if(!Number.isFinite(ratio)||!close(ratio*oldQty,oldTotal))fail('저장된 BOM 비율을 확인하세요.');
  const newTotal=newQty===oldQty?oldTotal:ratio*newQty;if(!Number.isFinite(newTotal)||!(newTotal>0))fail('변경 BOM 수량을 확인하세요.');
  const delta=newTotal-oldTotal,balance=stock(line.code);
  if(!Array.isArray(line.warehouseAllocations)){if(!WH.includes(plan.warehouse))fail('기존 창고 정보를 확인하세요.');balance[plan.warehouse]-=delta;return {...line,qty:newTotal};}
  const previous=line.warehouseAllocations;
  if(!previous.length||previous.some(a=>!WH.includes(a.warehouse)||typeof a.qty!=='number'||!Number.isFinite(a.qty)||a.qty<0)||!close(previous.reduce((n,a)=>n+a.qty,0),oldTotal))fail('저장된 창고 배정 합계를 확인하세요.');
  if(delta===0)return structuredClone(line);
  let allocations;
  if(delta>0){const added=allocateMaterial(delta,balance);allocations=previous.map(a=>({...a})).concat(added);for(const a of added)balance[a.warehouse]-=a.qty;}
  else{let remaining=newTotal;allocations=[];for(const a of previous){const keep=Math.min(a.qty,remaining);if(keep>0)allocations.push({...a,qty:keep});remaining-=keep;balance[a.warehouse]+=a.qty-keep;}}
  // Release from the most recently appended allocations first, retaining the oldest assignments.
  const last=allocations.at(-1);if(!last)fail('변경 창고 배정 합계를 확인하세요.');const prefix=allocations.slice(0,-1).reduce((n,a)=>n+a.qty,0);const previousLast=last.qty;last.qty=newTotal-prefix;balance[last.warehouse]-=last.qty-previousLast;
  if(allocations.some(a=>!Number.isFinite(a.qty)||a.qty<0)||!close(allocations.reduce((n,a)=>n+a.qty,0),newTotal))fail('변경 창고 배정 합계를 확인하세요.');
  return {...line,qty:newTotal,warehouseAllocations:allocations};
 });
 const summary={planId:plan.id,oldQty,newQty,deltaQty:newQty-oldQty,oldDate:plan.date,newDate:payload.date};
 Object.assign(plan,{date:payload.date,plannedQty:newQty,normal:newQty,lines});
 state.audit.unshift({id,at:now,actor,type:'productionPlanEdit',description:'누적 생산계획수량 수정',payload:summary});state.processed.push(id);return state;
}
