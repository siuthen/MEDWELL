import {autoPlanPreview} from './auto-production.mjs';
import {planQuantity} from './production-plan.mjs';
export function resolvePlanDownload(state,rows,options={}){
 if(!Array.isArray(rows)||!rows.length)throw Error('생산계획을 입력하세요.');
 const included=rows.filter(r=>r.selected!==false).map(r=>({...r,qty:r.qty??planQuantity(r)}));
 if(!included.length)throw Error('포함할 생산계획을 선택하세요.');
 const preview=autoPlanPreview(state,included,options);
 if(preview.invalid.length)throw Error(preview.invalid.map(r=>(r.source||r.product||'생산계획')+': '+r.error).join('\n'));
 if(preview.checked.some(r=>!r.lines.length))throw Error('BOM은 최소 1라인이 필요합니다.');
 return preview.checked;
}
// Read the live controls at the click, including an input that still has focus.
export function readDirectPlanInputs(root,month,rows){
 const controls=root?.querySelectorAll('[data-plan-row]');
 return {month:root?.querySelector('[data-plan-month]')?.value??month,rows:controls&&controls.length===rows.length?Array.from(controls,(r,i)=>({...rows[i],search:(r.querySelector('[data-plan-search]')||r.querySelector('[data-plan-code]')).value,qty:r.querySelector('[data-plan-qty]').value})):rows.map(r=>({...r}))};
}
