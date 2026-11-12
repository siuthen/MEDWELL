import {autoPlanPreview} from './auto-production.mjs';
import {activePlan} from './plan-stock.mjs';
import {planQuantity} from './production-plan.mjs';
import {normalizeProductName} from './product-search.mjs';
const input=v=>String(v??'').normalize('NFKC').trim();
const code=v=>input(v).toUpperCase();
export function pendingProductMatch(products,plan){
 const active=products.filter(p=>!p.deleted),findCode=value=>active.filter(p=>code(p.code)===code(value));
 if(input(plan.product)){const matches=findCode(plan.product);return matches.length===1?{product:matches[0],method:'productCode'}:null;}
 const values=[plan.productInput,plan.originalInput,plan.originalName,plan.name].map(input).filter(Boolean);
 for(const value of values){const matches=findCode(value);if(matches.length)return matches.length===1?{product:matches[0],method:'inputCode'}:null;}
 for(const value of values){const name=normalizeProductName(value);if(!name)continue;const matches=active.filter(p=>normalizeProductName(p.name)===name);if(matches.length)return matches.length===1&&findCode(matches[0].code).length===1?{product:matches[0],method:'uniqueName'}:null;}
 return null;
}
function validBom(state,product,qty){
 if(product.approved!==true||!Array.isArray(product.bom)||!product.bom.length)return false;
 const codes=new Set();for(const line of product.bom){if(!line||codes.has(line.code)||!state.materials.some(m=>!m.deleted&&m.code===line.code)||!['number','string'].includes(typeof line.qty)||!(Number(line.qty)>0)||!Number.isFinite(Number(line.qty)*qty))return false;codes.add(line.code);}return true;
}
export function reconcilePendingProductionPlans(state,{requestId,trigger,now}){
 const candidates=[],skipped=[];
 for(const plan of state.productions){
  if(plan.kind!=='productionPlan'||plan.allocationMode!=='auto'||!Array.isArray(plan.lines)||plan.lines.length||!activePlan(state,plan)||['replaced','cancelled','deleted'].includes(plan.status))continue;
  const qty=Number(planQuantity(plan)),date=plan.date||plan.planDate;
  if(!(qty>0)||!Number.isFinite(qty)){skipped.push({planId:plan.id,reason:'invalidQuantity'});continue;}
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<'1900-01-01'){skipped.push({planId:plan.id,reason:'invalidDate'});continue;}
  if(state.closes?.[date.slice(0,7)]){skipped.push({planId:plan.id,reason:'closedMonth'});continue;}
  const match=pendingProductMatch(state.products,plan);
  if(!match){skipped.push({planId:plan.id,reason:'unmatchedOrAmbiguous'});continue;}
  if(!validBom(state,match.product,qty)){skipped.push({planId:plan.id,reason:'unapprovedOrInvalidBom'});continue;}
  candidates.push({plan,match,qty,date});
 }
 if(!candidates.length)return {plans:[],skipped};
 // Resolve all lines against one common inventory pool before changing any plan.
 // The temporary product code aliases adapt case-insensitive matching to the existing preview contract.
 const previewState={...state,products:state.products.map(p=>({...p,code:code(p.code)}))};
 const preview=autoPlanPreview(previewState,candidates.map(c=>({product:code(c.match.product.code),qty:c.qty,date:c.date})),{direct:false});
 if(preview.invalid.length||preview.checked.some(r=>!r.lines.length))throw Error('미반영 계획의 BOM 소요량과 자동 배정을 확인하세요.');
 const updates=candidates.map((c,i)=>{
  const row=preview.checked[i],product=c.match.product;
  const reconciliation={requestId,trigger,at:now,product:product.code,bomVersion:product.version||'',matchMethod:c.match.method,plannedQty:c.qty,bomLineCount:row.lines.length,original:{product:c.plan.product||'',name:c.plan.name||'',version:c.plan.version||''}};
  return {plan:c.plan,patch:{product:product.code,name:product.name,unit:row.unit,capacity:row.capacity,version:row.version,lines:row.lines,reconciliation,note:[c.plan.note,'품목·BOM 자동 반영 · '+product.code+' · '+(product.version||'BOM 버전 없음')+' · '+now].filter(Boolean).join('\n')},summary:{planId:c.plan.id,product:product.code,plannedQty:c.qty,bomLineCount:row.lines.length}};
 });
 for(const {plan,patch} of updates)Object.assign(plan,patch);
 return {plans:updates.map(u=>u.summary),skipped};
}
