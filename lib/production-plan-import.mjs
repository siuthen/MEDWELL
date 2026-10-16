import {sheetPeriod,sequenceDate} from './production-period.mjs';
import {parsePlanSheets,validatePlans,planDeductions,planToday,productCapacity,planQuantity} from './production-plan.mjs';

const clean=value=>String(value??'').normalize('NFKC').trim();
const heading=value=>clean(value).replace(/\s/g,'');
const withoutNotes=value=>{let text=clean(value);for(let i=0;i<5;i++)text=text.replace(/\([^()]*\)|\[[^\[\]]*\]/g,'');return text;};
const sizeKey=value=>{
 const text=clean(value).toLowerCase().replace(/[★☆]/g,'').replace(/\s|,/g,'').replace(/×|x/g,'*').replace(/ml|㎖|g|ea|개|박스/gi,'');
 if(!/^\d+(?:\.\d+)?(?:\*\d+(?:\.\d+)?)*$/.test(text))return '';
 const parts=text.split('*').map(Number);return parts.every(v=>v>0&&Number.isFinite(v))?parts.join('*'):'';
};
function identity(name,capacity){
 let text=withoutNotes(name).trim().replace(/^(?:KE|KI|C|I|T)_/i,'');
 const size=/\d+(?:\.\d+)?\s*(?:ml|㎖|g|ea|개|박스)(?:\s*[*×x]\s*\d+(?:\.\d+)?\s*(?:ea|개|박스)?)?/ig;
 const tokens=[...text.matchAll(size)];
 // More than one distinct size is unsafe to infer.
 const keys=[...new Set(tokens.map(m=>sizeKey(m[0])))];
 const volume=capacity===undefined?(keys.length===1?keys[0]:''):sizeKey(capacity);
 if(keys.length>1||(capacity!==undefined&&keys.length===1&&keys[0]!==volume))return {name:'',volume:''};
 text=text.replace(size,'').toLowerCase().replace(/\+/g,'플러스').replace(/[\s_.·,\-/]/g,'');
 return {name:text,volume};
}
export function recommendPlanProduct(name,capacity,products){
 const wanted=identity(name,String(capacity||'').trim()?capacity:undefined);
 const candidates=wanted.name&&wanted.volume?products.filter(p=>!p.deleted).filter(p=>{const candidate=identity(p.name);return candidate.name===wanted.name&&candidate.volume===wanted.volume;}):[];
 return {product:candidates.length===1?candidates[0].code:'',matchReason:candidates.length===1?'auto':candidates.length>1?'ambiguous':'none',candidateCount:candidates.length};
}
export function reportQuantity(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>0?value:NaN;
 const text=clean(value).replace(/\s|,/g,'');
 if(!/^(?:\d+(?:\.\d+)?|\.\d+)(?:개|박스|ea)?$/i.test(text))return NaN;
 const qty=Number(text.replace(/(?:개|박스|ea)$/i,''));return qty>0&&Number.isFinite(qty)?qty:NaN;
}
export function detectPlanReport(sheet){
 if(sheet.format!=='xlsx')return false;
 const top=sheet.rows.slice(0,60),all=top.flat().map(heading);
 return all.includes('제품생산계획수량')&&top.some(r=>heading(r[9])==='제품계획보고란')&&top.some(r=>heading(r[9])==='계획수량')&&top.some(r=>heading(r[1])==='순번'&&heading(r[2])==='품명'&&heading(r[3])==='용량');
}
export function parsePlanUploadSheets(sheets,products){
 const rows=[],issues=[];
 for(const sheet of sheets){
  const simple=parsePlanSheets([sheet]);
  if(!simple.issues.length){rows.push(...simple.rows.map(r=>({...r,selected:true,format:'table',sheetName:sheet.name,rowNumber:Number(r.source.match(/ (\d+)행$/)?.[1]),originalName:r.productName,capacity:'',sequence:'',quantityRaw:r.qty,matchReason:'code'})));continue;}
  if(!detectPlanReport(sheet)){issues.push(...simple.issues);continue;}
  let found=0;const period=sheetPeriod(sheet.name);
  for(let i=0;i<sheet.rows.length;i++){
   const r=sheet.rows[i],sequence=clean(r[1]),originalName=clean(r[2]),capacity=clean(r[3]);
   if(!/^\d+\s*[-–]\s*(?:[1-9]|1[0-2])\s*월(?:\s|$)/.test(sequence)||(!originalName&&!clean(r[12])))continue;
   const qty=reportQuantity(r[9]),code=clean(r[12]).toUpperCase(),matched=code?{product:code,matchReason:'code',candidateCount:products.some(p=>!p.deleted&&p.code===code)?1:0}:recommendPlanProduct(originalName,capacity,products);
   rows.push({selected:true,format:'report',productName:originalName,originalName,capacity,sequence,sheetName:sheet.name,rowNumber:i+1,source:sheet.name+' '+(i+1)+'행',quantityRaw:clean(r[9]),qty:Number.isFinite(qty)?qty:clean(r[9]),quantityError:!!clean(r[9])&&!Number.isFinite(qty),date:sequenceDate(sequence,period),dateError:!!period&&!sequenceDate(sequence,period),...period,warehouse:'',note:clean(r[14]),...matched});found++;
  }
  if(!found)issues.push(sheet.name+': 보고서에서 순번·품명·용량이 있는 제품 행을 찾지 못했습니다.');
 }
 if(rows.length>5000)throw Error('생산계획은 한 번에 5,000행까지 업로드할 수 있습니다.');
 return {rows,issues};
}
export function planUploadPreview(rows,state,defaultWarehouse='김포창고',defaultDate=planToday(),balance,options={}){
 const prepared=rows.map(r=>{const product=state.products.find(p=>!p.deleted&&p.code===clean(r.product).toUpperCase());let qty=r.qty,quantityError=r.quantityError,quantityFromBatch=false;const date=clean(r.date)||defaultDate,warehouse=clean(r.warehouse)||defaultWarehouse;if(r.format==='report'&&!clean(r.quantityRaw)&&!clean(r.qty)){const same=options.activeRows?.filter(p=>!p.cancelled&&p.product===r.product)||[],precise=same.filter(p=>p.date.slice(0,7)===date.slice(0,7)&&p.warehouse===warehouse),candidates=precise.length?precise:same.length===1?same:[],duplicates=rows.filter(x=>x.selected!==false&&x.product===r.product&&(clean(x.date)||defaultDate).slice(0,7)===date.slice(0,7)&&(clean(x.warehouse)||defaultWarehouse)===warehouse);if(candidates.length&&duplicates.length===1){qty=candidates.reduce((n,p)=>n+planQuantity(p),0);quantityFromBatch=true;}else quantityError=true;}return {...r,qty,quantityError,quantityFromBatch,date,capacity:r.capacity||productCapacity(product?.name)};});
 const checked=validatePlans(prepared,state,defaultWarehouse,undefined,options.allowPeriodDates?{minDate:'1900-01-01'}:{}).map(r=>r.dateError?{...r,error:[r.error,'순번의 월이 시트 계획기간과 맞지 않습니다.'].filter(Boolean).join(' / '),lines:[]}:r).map(r=>r.quantityError?{...r,error:[r.error,'계획수량 오류: 수량이 미확정이거나 숫자·개·박스·EA 형식이 아닙니다.'].filter(Boolean).join(' / '),lines:[]}:r);
 const included=checked.filter(r=>r.selected!==false),invalid=included.filter(r=>r.error);
 return {checked,included,invalid,deductions:balance?planDeductions(included,state,balance):[],payloadRows:included.map(({product,qty,date,warehouse,note,source,sequence,sheetName,rowNumber})=>({product,qty,date,warehouse,note,source,sequence,sheetName,rowNumber}))};
}
