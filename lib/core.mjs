import {migrateRelease,applySchedule} from './release-data.mjs';
import {editOrder,beforeOrderStatus,editCompletionReceipt} from './order-completion.mjs';
import {stockBalances} from './plan-stock.mjs';
import {createDirectPlans} from './auto-production.mjs';
import {deleteTransaction} from './transaction-delete.mjs';
import {bulkCreateProductBoms} from './bulk-product-boms.mjs';
import {replacePlanBatch,cancelPlanBatch,isActivePlan} from './production-batch.mjs';
import {buildPlanRecords,planQuantity} from './production-plan.mjs';
import {migrateUsageEra,canProduce} from './usage-era.mjs';
import {validateInventoryRows} from './inventory-import.mjs';
export const BASELINE='2026-10-14';
export const WAREHOUSES=['김포창고','오류창고'];
export function seed(raw,review){
 const products=[], materials=new Map();
 for(const sheet of raw.bom.filter(s=>s.name!=='제품')){
  const rows=sheet.rows;
  for(let c=1;c<22;c+=6){
   const code=(rows[2]?.[c+1]||'').trim(),name=rows[1]?.[c+1]?.trim();
   if(!code||!name)continue;
   const bom=[];
   for(const row of rows.slice(5)){
    const material=(row[c]||'').trim(),label=(row[c+2]||'').trim(),qty=Number((row[c+4]||'').replaceAll(',',''));
    if(!material||!label||!Number.isFinite(qty)||qty<=0||/벌크|_BK|\.BK/.test(label+' '+material))continue;
    materials.set(material,{code:material,name:label,unit:'개'});bom.push({code:material,qty});
   }
   if(bom.length&&!products.some(p=>p.code===code))products.push({code,name,bom,version:'가져온 BOM · 확인 필요',approved:false,unit:/세트|\*\d+ea|10ea/i.test(name)?'세트':'개'});
  }
 }
 const historical=raw.purchase.slice(1).filter(r=>r[1]==='부자재').map((r,i)=>{
  const code=(r[2]||'').trim(); if(code&&!materials.has(code))materials.set(code,{code,name:r[3],unit:'개'});
  return {id:'historical-'+i,status:r[0],code,name:r[3],quantity:r[4],price:r[5]||'',vendor:r[6],date:r[7]||'',expected:r[9]||'',note:r[10]||''};
 });
 return {products,materials:[...materials.values()].sort((a,b)=>a.code.localeCompare(b.code)),historical,review,opening:{},orders:[],receipts:[],productions:[],transfers:[],adjustments:[],closes:{},audit:[],processed:[]};
}
function fail(message){throw new Error(message)}
function number(v,name,positive=false){const n=Number(v);if(v===''||v==null||!Number.isFinite(n)||n<0||(positive&&n===0))fail(name+'을 확인하세요.');return n}
function date(v,minDate=BASELINE){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v||(minDate&&v<minDate))fail(minDate?'기초재고 이후의 유효한 날짜를 입력하세요.':'유효한 날짜를 입력하세요.');return v}
function text(v){return String(v||'').trim().slice(0,300)}
const norm=v=>text(v).replace(/\s+/g,'').toLowerCase();
export function migrate(s){
 for(const r of s.historical){if(r.status==='전표완료')r.status='입고완료';r.qty??=Number(String(r.quantity||'').replace(/[^\d.]/g,''));}
 for(const m of s.materials){m.spec??='';}
 for(const code of Object.keys(s.opening)){s.opening[code].known??=['김포창고','오류창고'];}
 return migrateRelease(migrateUsageEra(s));
}
export function orderStatus(s,o){return beforeOrderStatus(s,o);}
export function latestNote(s,code,warehouse){
 for(const a of s.audit){
  if(a.type==='bulkStock'){const row=a.payload?.rows?.find(r=>r.code===code&&(!warehouse||r.warehouse===warehouse));if(row)return row.note||a.payload.note||'';}
  if(['stockSet','adjustment','opening','mapReview'].includes(a.type)&&a.payload?.code===code&&(!a.payload.warehouse||a.payload.warehouse===warehouse)&&!(a.type==='adjustment'&&s.adjustments.find(x=>x.id===a.id)?.cancelled))return a.payload.note||'';
 }
 return '';
}

function findMaterial(s,p){
 const code=text(p.code),name=text(p.name);
 if(code){const m=s.materials.find(x=>!x.deleted&&x.code===code);if(!m)fail('등록되지 않은 품목코드입니다. 창고별 재고에서 품목을 추가하세요.');return m;}
 const matches=s.materials.filter(x=>!x.deleted&&norm(x.name)===norm(name));
 if(matches.length!==1)fail(matches.length?'동일한 품명이 여러 개입니다. 품목코드를 입력하세요.':'등록된 품명 또는 품목코드를 입력하세요. 신규 품목은 창고별 재고에서 추가하세요.');return matches[0];
}
export function balances(s,code){return stockBalances(s,code);}
export function closing(s,month){return s.receipts.filter(r=>r.date.startsWith(month)&&!r.cancelled).map(r=>({...r,supply:Math.round(r.paid*r.price),vat:Math.round(Math.round(r.paid*r.price)*r.tax/100)}))}
export function apply(s,command,actor){
 if(command.type==='releaseMigration'){if(!command.requestId)fail('요청번호가 없습니다.');if(s.processed.includes(command.requestId))return s;migrateRelease(s);s.processed.push(command.requestId);return s;}
 if(['scheduleCreate','scheduleEdit','scheduleDelete'].includes(command.type))return applySchedule(s,command.type,command.payload,command.requestId,actor,new Date().toISOString());
 if(['orderEdit','deleteOrder','deleteReceipt','createDirectProductionPlans'].includes(command.type)){if(typeof command.requestId!=='string'||!command.requestId.trim())fail('요청번호가 없습니다.');if(s.processed.includes(command.requestId))return s;if(!command.payload||typeof command.payload!=='object')fail('입력값이 없습니다.');return command.type==='orderEdit'?editOrder(s,command.payload,command.requestId,actor,new Date().toISOString()):command.type==='createDirectProductionPlans'?createDirectPlans(s,command.payload,command.requestId,actor,new Date().toISOString()):deleteTransaction(s,command.type,command.payload,command.requestId,actor,new Date().toISOString());}
 if(command.type==='receiptEdit'&&s.receipts.some(r=>r.id===command.payload?.id&&r.source==='order_completion')){if(typeof command.requestId!=='string'||!command.requestId.trim())fail('요청번호가 없습니다.');if(s.processed.includes(command.requestId))return s;return editCompletionReceipt(s,command.payload,command.requestId,actor,new Date().toISOString());}
 if(command.type==='bulkCreateProductBoms'){if(!command.requestId||typeof command.requestId!=='string')fail('요청번호가 없습니다.');if(s.processed.includes(command.requestId))return s;return bulkCreateProductBoms(s,command.payload,command.requestId,actor,new Date().toISOString());}
 migrate(s);
 if(!command.requestId||typeof command.requestId!=='string')fail('요청번호가 없습니다.');
 if(s.processed.includes(command.requestId))return s;
 const {type,payload:p}=command;if(!p||typeof p!=='object')fail('입력값이 없습니다.');
 const id=command.requestId,now=new Date().toISOString();
 const material=()=>{if(!s.materials.some(m=>!m.deleted&&m.code===p.code))fail('등록된 부자재를 선택하세요.');};
 const warehouse=()=>{if(!WAREHOUSES.includes(p.warehouse))fail('창고를 선택하세요.');};
 const checkMonth=d=>{if(s.closes[d.slice(0,7)])fail('확정된 마감월입니다. 먼저 마감을 해제하세요.');};
 if(type==='replaceProductionPlanBatch')return replacePlanBatch(s,p,id,actor,now);
 if(type==='cancelProductionPlanBatch')return cancelPlanBatch(s,p,id,actor,now);
 if(type==='bulkProductionPlan'||type==='productionPlan'){
  const records=buildPlanRecords(s,type==='productionPlan'?{rows:[p],fileName:'직접 등록'}:p,id);
  s.productions.push(...records);
  s.audit.unshift({id,at:now,actor,type,description:'생산계획 확정 · '+(p.fileName||'직접 등록'),payload:{fileName:records[0].fileName,planCount:records.length,bomLineCount:records.reduce((n,r)=>n+r.lines.length,0)}});
  s.processed.push(id);return s;
 }else if(type==='productionPlanEdit'){
  const old=s.productions.find(r=>r.id===p.id&&r.kind==='productionPlan'&&!r.cancelled);if(!old)fail('수정할 생산계획이 없습니다.');if(old.allocationMode==='auto')fail('자동 배정 계획은 취소 후 다시 등록하세요.');if(old.batchId)fail('파일 배치 계획은 파일 교체로 수정하세요.');checkMonth(old.date);
  const record=buildPlanRecords(s,{rows:[p],fileName:old.fileName},id)[0];
  if(record.product===old.product){const lines=old.lines.map(line=>({...line,qty:line.qty/planQuantity(old)*record.plannedQty}));if(lines.some(line=>!s.materials.some(m=>!m.deleted&&m.code===line.code)||!Number.isFinite(line.qty)))fail('저장된 BOM 자재를 확인하세요.');record.lines=lines;record.version=old.version;}
  Object.assign(old,{...record,id:old.id,source:old.source,ecount:old.ecount});
 }else if(type==='bulkStock'){
  if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>5000)fail('1~5000개 재고 행을 선택하세요.');
  const rows=validateInventoryRows(p.rows.map(r=>({...r,selected:true})),s.materials);const invalid=rows.find(r=>r.error);if(invalid)fail((invalid.source||invalid.code)+': '+invalid.error);
  const trial=structuredClone(s),audit=structuredClone(s.audit),processed=[...s.processed];
  for(let i=0;i<rows.length;i++){
   const row=rows[i],existing=trial.materials.find(m=>m.code===row.code),note=text(row.note||p.note||'엑셀 재고 반영');
   apply(trial,{type:'stockEntry',requestId:id+':'+i,payload:{...row,spec:row.spec||existing?.spec||'',unit:row.unit||existing?.unit||'개',qty:Number(row.qty),note}},actor);
   trial.audit=[...audit];trial.processed=[...processed];
  }
  Object.assign(s,trial);
 }else if(type==='receiptEdit'||type==='productionEdit'){
  const collection=type==='receiptEdit'?'receipts':'productions',old=s[collection].find(x=>x.id===p.id);
  if(!old||old.cancelled||old.deleted)fail('수정할 내역이 없습니다.');if(old.allocationMode==='auto')fail('자동 배정 계획은 취소 후 다시 등록하세요.');if(old.batchId)fail('파일 배치 계획은 파일 교체로 수정하세요.');checkMonth(old.date);
  const nextDate=date(p.date,type==='receiptEdit'?null:BASELINE);checkMonth(nextDate);
  let updated;
  if(type==='productionEdit'&&p.product===old.product){
   if(!canProduce(s.products.find(x=>x.code===old.product)))fail('품목의 BOM 승인 또는 사용구분을 확인하세요.');
   warehouse();const normal=number(p.normal,'정상 완제품 수량'),retained=number(p.retained,'관리품 수량');if(normal+retained===0)fail('생산수량을 입력하세요.');
   updated={...old,date:nextDate,warehouse:p.warehouse,normal,retained,note:text(p.note),lines:old.lines.map(line=>({...line,qty:line.qty/(old.normal+old.retained)*(normal+retained)}))};
  }else{
   const trial=structuredClone(s);trial[collection]=trial[collection].filter(x=>x.id!==old.id);
   const payload={...p};if(type==='receiptEdit'&&!p.orderId&&!p.orderNumber)payload.keepUnlinked=true;
   apply(trial,{type:type==='receiptEdit'?'receipt':'production',requestId:id+':validate',payload},actor);
   updated={...trial[collection].at(-1),id:old.id,ecount:old.ecount};
  }
  Object.assign(old,updated);
 }else if(type==='order'){
  material();const d=date(p.date);s.orders.push({id,date:d,code:p.code,vendor:text(p.vendor),qty:number(p.qty,'발주수량',true),price:number(p.price??0,'단가'),status:['대기','부분입고','입고완료','부적합'].includes(p.status)?p.status:'대기',expected:p.expected?date(p.expected):'',note:text(p.note),ecount:false});if(!s.orders.at(-1).vendor)fail('거래처를 입력하세요.');
 }else if(type==='receipt'){
  p.code=findMaterial(s,p).code;material();if(p.warehouse!=null&&p.warehouse!==''&&!WAREHOUSES.includes(p.warehouse))fail('유효한 창고를 선택하세요.');const d=date(p.date,null);checkMonth(d);const paid=number(p.paid,'유상 입고량'),free=number(p.free,'무상 추가입고량');if(paid+free===0)fail('입고수량을 입력하세요.');
  const orders=[...s.orders,...s.historical].filter(o=>!o.deleted);let order=orders.find(o=>o.id===(p.orderId||p.orderNumber));
  if(!order&&!p.keepUnlinked){const candidates=orders.filter(o=>o.code===p.code&&(!p.vendor||norm(o.vendor)===norm(p.vendor))&&!['입고완료','부적합'].includes(orderStatus(s,o)));if(candidates.length>1)fail('같은 품목·업체의 미입고 발주가 여러 건입니다. 발주관리의 발주번호를 입력하세요.');order=candidates[0];}
  if(order&&orderStatus(s,order)==='부적합')fail('부적합 발주에는 입고를 연결할 수 없습니다.');
  if((p.orderId||p.orderNumber)&&(!order||order.code!==p.code))fail('발주번호와 입고 품목이 다릅니다.');
  if(order&&p.vendor&&norm(order.vendor)!==norm(p.vendor))fail('발주업체와 입력한 업체가 다릅니다.');
  const tax=number(p.tax,'부가세율');if(![0,10].includes(tax))fail('부가세율은 0 또는 10입니다.');
  const vendor=text(p.vendor||order?.vendor);if(!vendor)fail('거래처를 입력하세요.');
  s.receipts.push({id,date:d,code:p.code,warehouse:p.warehouse||'',inventoryApplied:!!p.warehouse,inventoryExclusionReason:p.warehouse?'':'warehouse_unselected',paid,free,price:number(p.price,'단가'),tax,vendor,orderId:order?.id||'',note:text(p.note)});
 }else if(type==='production'){
  warehouse();const d=date(p.date);checkMonth(d);let product=s.products.find(x=>x.code===p.product);if(!product){const matches=s.products.filter(x=>norm(x.name)===norm(p.productName||p.product));if(matches.length>1)fail('같은 품목명이 여러 개입니다. 품목코드를 입력하세요.');product=matches[0];}if(!product)fail('등록된 품목명·품목코드를 찾을 수 없습니다. 제품·BOM에서 확인하세요.');if(!canProduce(product))fail(product.code+' '+product.name+'의 BOM이 미승인 상태입니다. 제품·BOM에서 자재와 소요량을 확인한 뒤 승인하세요.');
  if(product.bom.some(b=>!s.materials.some(m=>m.code===b.code&&!m.deleted)))fail('BOM에 삭제된 부자재가 있습니다. BOM을 수정하세요.');
  const normal=number(p.normal,'정상 완제품 수량'),retained=number(p.retained,'관리품 수량');if(normal+retained===0)fail('생산수량을 입력하세요.');
  s.productions.push({id,date:d,product:product.code,name:product.name,normal,retained,warehouse:p.warehouse,version:product.version,lines:product.bom.map(x=>({code:x.code,qty:x.qty*(normal+retained)})),ecount:false,note:text(p.note)});
 }else if(type==='transfer'){
  material();const d=date(p.date);checkMonth(d);if(!WAREHOUSES.includes(p.from)||!WAREHOUSES.includes(p.to)||p.from===p.to)fail('서로 다른 창고를 선택하세요.');s.transfers.push({id,date:d,code:p.code,from:p.from,to:p.to,qty:number(p.qty,'이동수량',true),note:text(p.note)});
 }else if(type==='opening'){
  material();const total=number(p.total,'전체 재고'),error=number(p.error,'오류창고 재고');if(error>total)fail('오류창고 재고가 전체보다 큽니다. 원자료를 확인하세요.');s.opening[p.code]={total,error,at:'2026-10-14T14:33:00+09:00',note:text(p.note),actor};
 }else if(type==='approveBom'){
  const product=s.products.find(x=>x.code===p.product);if(!product)fail('제품을 선택하세요.');product.approved=true;product.version='V1 · '+now.slice(0,10);
 }else if(type==='productSave'){
  const code=text(p.product),name=text(p.name);if(!code||!name)fail('품목코드와 품목명을 입력하세요.');if(!Array.isArray(p.bom)||!p.bom.length)fail('BOM을 한 줄 이상 입력하세요.');
  const bom=p.bom.map(b=>{if(text(b.code)&&!s.materials.some(m=>m.code===text(b.code))){if(!text(b.name))fail('신규 부자재의 품명을 입력하세요.');s.materials.push({code:text(b.code),name:text(b.name),spec:text(b.spec),unit:'개',usageEra:'unmatched'});}const m=findMaterial(s,b);return {code:m.code,qty:number(b.qty,'소요량',true)}});if(new Set(bom.map(b=>b.code)).size!==bom.length)fail('BOM에 같은 자재코드가 중복되었습니다.');
  const old=s.products.find(x=>x.code===code);const record={code,name,usageEra:old?.usageEra||'unmatched',unit:text(p.unit)||'개',bom,approved:!!p.approved,version:'V'+((old?.revision||1)+1)+' · '+now.slice(0,10),revision:(old?.revision||1)+1};if(old)Object.assign(old,record);else s.products.push(record);
 }else if(type==='stockBoth'){
  if(!text(p.note))fail('재고 변경 사유를 입력하세요.');
  for(const key of ['kimpo','error'])if(p[key]===''||p[key]==null||!Number.isFinite(Number(p[key])))fail('두 창고의 현재 재고를 입력하세요.');
  apply(s,{requestId:id+':meta',type:'materialSave',payload:p},actor);
  for(const [warehouse,key] of [['김포창고','kimpo'],['오류창고','error']])apply(s,{requestId:id+':'+key,type:'stockSet',payload:{...p,warehouse,qty:p[key]}},actor);
 }else if(type==='stockEntry'){
  apply(s,{requestId:id+':meta',type:'materialSave',payload:p},actor);
  apply(s,{requestId:id+':qty',type:'stockSet',payload:p},actor);
 }else if(type==='materialSave'){
  const code=text(p.code),name=text(p.name);if(!code||!name)fail('품목코드와 품명을 입력하세요.');let m=s.materials.find(x=>x.code===code);if(m?.deleted)fail('삭제된 코드입니다. 다른 코드를 사용하세요.');if(m)Object.assign(m,{name,spec:text(p.spec),unit:text(p.unit)||'개'});else s.materials.push({code,name,spec:text(p.spec),unit:text(p.unit)||'개',usageEra:'unmatched'});
 }else if(type==='materialDelete'){
  material();if(s.products.some(x=>x.bom.some(b=>b.code===p.code)))fail('BOM에 사용되는 품목입니다. 먼저 BOM에서 제거하세요.');const b=balances(s,p.code);if(b['김포창고']!==0||b['오류창고']!==0)fail('재고가 남아 있습니다. 먼저 재고를 조정하세요.');s.materials.find(x=>x.code===p.code).deleted=true;
 }else if(type==='stockSet'){
  material();warehouse();const qty=Number(p.qty);if(p.qty===''||p.qty==null||!Number.isFinite(qty))fail('현재 재고를 입력하세요.');if(!text(p.note))fail('재고 변경 사유를 입력하세요.');
  const b=balances(s,p.code),base=s.opening[p.code];if(base&&b.known.includes(p.warehouse)){checkMonth(now.slice(0,10));s.adjustments.push({id,date:now.slice(0,10),code:p.code,warehouse:p.warehouse,qty:qty-b[p.warehouse],note:text(p.note)});}else{
   const o=base||{total:0,error:0,known:[],at:'2026-10-14T14:33:00+09:00'};const delta=qty-b[p.warehouse];if(p.warehouse==='오류창고'){o.error+=delta;o.total+=delta;}else o.total+=delta;o.known.push(p.warehouse);o.note=text(p.note);s.opening[p.code]=o;
  }
 }else if(type==='reviewDelete'){
  const r=s.review.find(x=>x.id===p.id);if(!r)fail('자료가 없습니다.');r.deleted=true;
 }else if(type==='mapReview'){
  const r=s.review.find(x=>x.id===p.reviewId);if(!r||r.deleted)fail('자료를 선택하세요.');const code=text(p.code),name=text(p.name);if(!code||!name)fail('품목코드와 품명을 입력하세요.');let m=s.materials.find(x=>x.code===code&&!x.deleted);if(!m){m={code,name,spec:text(p.spec),unit:'개',usageEra:'unmatched'};s.materials.push(m);}else Object.assign(m,{name,spec:text(p.spec)});
  const total=number(p.total,'전체 재고'),error=number(p.error,'오류창고 재고');if(error>total)fail('오류 재고가 전체 재고보다 큽니다. 원자료를 확인하세요.');if(s.opening[code])fail('이미 연결된 품목입니다. 현재고 수정 화면을 이용하세요.');s.opening[code]={total,error,known:[...WAREHOUSES],at:'2026-10-14T14:33:00+09:00',note:text(p.note),actor};r.mappedCode=code;
 }else if(type==='ecount'){
  const row=[...s.orders,...s.receipts,...s.productions].find(x=>x.id===p.id);if(!row)fail('내역이 없습니다.');if(row.batchId)fail('파일 배치 이력은 읽기 전용입니다.');row.ecount=!!p.value;
 }else if(type==='cancel'){
  const row=[...s.receipts,...s.productions,...s.transfers,...s.adjustments].find(x=>x.id===p.id);if(!row||row.cancelled)fail('취소할 내역이 없습니다.');if(row.batchId)fail('파일 배치는 배치 전체 취소를 이용하세요.');checkMonth(row.date);if(!text(p.reason))fail('취소 사유를 입력하세요.');row.cancelled=true;row.reason=text(p.reason);
 }else if(type==='adjustment'){
  material();warehouse();const d=date(p.date);checkMonth(d);const qty=Number(p.qty);if(!Number.isFinite(qty)||qty===0)fail('증감수량을 입력하세요.');if(!text(p.note))fail('반품·불량·실사조정 사유를 입력하세요.');s.adjustments.push({id,date:d,code:p.code,warehouse:p.warehouse,qty,note:text(p.note)});
 }else if(type==='close'||type==='reopen'){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month))fail('마감월을 확인하세요.');if(type==='close')s.closes[p.month]={at:now,actor};else delete s.closes[p.month];
 }else fail('지원하지 않는 작업입니다.');
 s.audit.unshift({id,at:now,actor,type,description:text(p.note||p.reason||p.code||p.product||p.month||p.id),payload:structuredClone(p)});s.processed.push(id);return s;
}
