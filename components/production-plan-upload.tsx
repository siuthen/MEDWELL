'use client';
import {useState,useRef} from 'react';
import {readInventoryFile} from '../lib/read-inventory-file';
import {planToday} from '../lib/production-plan.mjs';
import {parsePlanUploadSheets,planUploadPreview,selectPlanUploadProduct,updatePlanUploadSearch} from '../lib/production-plan-import.mjs';
import {inferPlanPeriod,periodValue} from '../lib/production-period.mjs';
import {activeBatch,batchRows,replacementPreview} from '../lib/production-batch.mjs';
import {autoFileName,buildProductionXlsx,downloadXlsx} from '../lib/production-xlsx.mjs';
import MaterialAllocations from './material-allocations';
import ManualPlanBom from './manual-plan-bom';
import ProductCombobox from './product-combobox';
import {balances} from '../lib/core.mjs';
const nf=(v:any)=>Number.isFinite(Number(v))?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:3}):String(v??'');
export default function ProductionPlanUpload({state,version,onClose,onSaved}:any){
 const [rows,RowsState]=useState<any[]>([]),[issues,Issues]=useState<string[]>([]),[error,ErrorText]=useState(''),[busy,Busy]=useState(false),[fileName,FileName]=useState(''),[defaultDate,DefaultDate]=useState(planToday),[baseVersion,BaseVersion]=useState(version),[requestId,RequestId]=useState('');
 const [periodStart,PeriodStart]=useState(''),[periodEnd,PeriodEnd]=useState(''),[periodTouched,PeriodTouched]=useState(false),[original,Original]=useState<Uint8Array|null>(null);
 const latestRows=useRef<any[]>([]);function Rows(value:any){const next=typeof value==='function'?value(latestRows.current):value;latestRows.current=next;RowsState(next)}
 const [manualPanel,ManualPanel]=useState<number|null>(null);
 const inferred=inferPlanPeriod(rows),start=periodTouched?periodStart:inferred?.periodStart||periodStart,end=periodTouched?periodEnd:inferred?.periodEnd||periodEnd;
 let period:any=null,periodError='',old:any=null;try{period=periodValue(start,end);old=activeBatch(state,period.periodKey);}catch(e:any){periodError=e.message;}
 const {checked,included,invalid,deductions,payloadRows,allocations}:any=planUploadPreview(rows,state,'김포창고',defaultDate,(code:string)=>balances(state,code),{allowPeriodDates:true,activeRows:old?batchRows(state,old.batchId):[],autoAllocation:true,excludeBatchId:old?.batchId||null});
 if(period&&included.some((r:any)=>r.date.slice(0,7)<start||r.date.slice(0,7)>end))periodError='포함된 계획일이 선택한 계획기간 밖에 있습니다.';
 const stale=baseVersion!==version;
 const blocked=busy||!included.length||!!invalid.length||!!issues.length||stale||!defaultDate||!!periodError;
 function update(index:number,patch:any){Rows((old:any[])=>old.map((r,i)=>i===index?{...r,...patch}:r));}
 function updateProduct(index:number,change:(row:any)=>any){Rows((old:any[])=>old.map((r,i)=>i===index?change(r):r));}
 async function read(file?:File){
  if(!file)return;Busy(true);ErrorText('');Rows([]);Issues([]);Original(null);ManualPanel(null);PeriodTouched(false);PeriodStart('');PeriodEnd('');FileName(file.name);
  try{const result=parsePlanUploadSheets(await readInventoryFile(file),state.products);Rows(result.rows);Issues(result.issues);if(/\.xlsx$/i.test(file.name))Original(new Uint8Array(await file.arrayBuffer()));BaseVersion(version);RequestId(crypto.randomUUID());if(!result.rows.length)ErrorText('생산계획 행을 찾지 못했습니다. 일반 표의 완제품 코드·계획수량 또는 병합형 보고서 구조를 확인해주세요.');}
  catch(e:any){ErrorText(e.message)}finally{Busy(false)}
 }
 async function commit(){
  if(blocked)return;
  if(!confirm(old?`기존 파일 ${old.fileName} (revision ${old.revision})의 차감을 복원하고 ${included.length}건의 변경 계획을 적용할까요?`:`${included.length}건의 신규 파일 배치를 확정할까요?`))return;
  Busy(true);ErrorText('');
  try{const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:baseVersion,requestId,type:'replaceProductionPlanBatch',payload:{rows:payloadRows,allocationMode:'auto',fileName,periodStart:start,periodEnd:end,expectedBatchId:old?.batchId||null}})}),result:any=await response.json();if(!response.ok)throw new Error(result.error);await onSaved(result);onClose();}
  catch(e:any){ErrorText(e.message)}finally{Busy(false)}
 }
 function download(){try{if(!original)return;const fresh=planUploadPreview(latestRows.current,state,'김포창고',defaultDate,(code:string)=>balances(state,code),{allowPeriodDates:true,activeRows:old?batchRows(state,old.batchId):[],autoAllocation:true,excludeBatchId:old?.batchId||null});if(!fresh.included.length||fresh.invalid.length)throw Error(fresh.invalid.map((r:any)=>r.source+': '+r.error).join('\n')||'포함할 계획을 선택하세요.');const bytes=buildProductionXlsx({original,plans:fresh.included,state,balance:(code:string)=>balances(state,code),periodKey:period?.periodKey||'기간 미확정',excludeBatchId:old?.batchId||null});downloadXlsx(bytes,autoFileName(fileName));}catch(e:any){ErrorText(e.message)}}
 return <div className="overlay"><section className="modal inventory-upload" role="dialog" aria-modal="true" aria-label="생산계획 엑셀 업로드">
  <div className="cardhead"><h2>생산계획 엑셀 업로드</h2><button className="secondary" disabled={busy} onClick={onClose}>닫기</button></div>
  <div className="upload-content">
   <div className="plan-upload-fields">
    <label>기본 계획일<input type="date" required value={defaultDate} disabled={busy} onChange={e=>DefaultDate(e.target.value)}/></label>
    <label>생산계획 파일<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={e=>read(e.target.files?.[0])}/></label>
   </div>
   <div className="plan-upload-fields"><label>계획 시작월<input type="month" required value={start} disabled={busy} onChange={e=>{PeriodStart(e.target.value);PeriodEnd(end);PeriodTouched(true)}}/></label><label>계획 종료월<input type="month" required value={end} disabled={busy} onChange={e=>{PeriodStart(start);PeriodEnd(e.target.value);PeriodTouched(true)}}/></label></div>
   {rows.length>0&&periodError&&<div className="alert error">{periodError}</div>}
   {old&&<div className="alert"><div><b>교체 대상: {old.fileName} · revision {old.revision} · 활성 계획 {batchRows(state,old.batchId).filter((r:any)=>!r.cancelled).length}건</b><p>기존 계획의 차감을 복원하고 변경 파일을 적용합니다. 복원과 새 차감은 한 번에 저장됩니다.</p></div></div>}
   <p className="help">.xlsx / UTF-8 CSV · 최대 15MB, 5,000행. 일반 표와 병합형 생산계획 보고서를 지원합니다. 숨김 시트는 제외합니다. 병합형은 시트 기간과 순번의 월로 매월 1일을 사용합니다. 일반 파일에 날짜가 없으면 기본 계획일을 사용합니다. 부자재는 통합 재고로 표시합니다. 계획기간은 포함한 날짜로 추출하며 수정할 수 있습니다. ‘박스’ 수량은 박스 개수 그대로 적용하며 내용물 수로 곱하지 않습니다.</p>
   {error&&<div className="alert error" role="alert">{error}</div>}
   {!defaultDate&&<div className="alert error">기본 계획일을 선택해주세요.</div>}
   {issues.length>0&&<div className="alert error" role="alert"><div>인식하지 못한 시트를 수정하거나 제거한 뒤 다시 업로드해주세요.<ul>{issues.map(x=><li key={x}>{x}</li>)}</ul></div></div>}
   {stale&&rows.length>0&&<div className="alert error">서버 데이터가 변경되었습니다. 최신 내용을 기준으로 파일을 다시 선택해주세요.</div>}
   {rows.length>0&&<>
    <p><b>{fileName} · 검출 {checked.length}행 · 포함 {included.length}행 · 제외 {checked.length-included.length}행 · 포함 오류 {invalid.length}행</b></p>
    <p className="help">파일의 품목코드가 등록 제품코드와 정확히 일치할 때만 자동 매칭합니다. 원본 품명은 참고용이며 코드가 없거나 미등록이면 검색 후보에서 직접 선택하거나 제외해야 합니다.</p>
    <div className="actions"><button className="secondary" disabled={blocked||!original} onClick={download}>자동작성 엑셀 내려받기</button>{!original&&<small>CSV는 원본 서식이 없어 자동작성 XLSX 내려받기를 지원하지 않습니다.</small>}<button className="secondary" disabled={busy} onClick={()=>Rows((old:any[])=>old.map(r=>({...r,selected:true})))}>전체 선택</button><button className="secondary" disabled={busy} onClick={()=>Rows((old:any[])=>old.map(r=>({...r,selected:false})))}>전체 해제</button></div>
    <div className="tablewrap upload-preview"><table><thead><tr>{['포함','순번 / 원본 위치','원본 품명(참고)','용량','제품 검색 / 선택','제품코드 / 정식 제품명','계획일','계획수량','BOM 버전 / 상태','비고','오류'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
     {checked.map((r:any,i:number)=><tr key={r.source||i} className={r.selected===false?'plan-excluded':''}>
      <td><input type="checkbox" aria-label={r.source+' 포함'} checked={r.selected!==false} disabled={busy} onChange={e=>update(i,{selected:e.target.checked})}/></td>
      <td>{r.sequence||'—'}<br/><small>{r.sheetName} {r.rowNumber}행</small></td><td>{r.originalName||'—'}</td><td>{r.capacity||'—'}</td>
      <td><ProductCombobox products={state.products} value={rows[i]?.search??r.product??''} label={r.source+' 매칭 제품'} disabled={busy} onChange={(search:string)=>updateProduct(i,row=>updatePlanUploadSearch(row,search))} onSelect={(p:any)=>updateProduct(i,row=>selectPlanUploadProduct(row,p))}/><small>{r.manual?<button type="button" className="link" onClick={()=>ManualPanel(i)}>수기 BOM 편집</button>:r.matchReason==='code'?'파일 코드 정확 일치':r.matchReason==='manual'&&r.product?'직접 선택':'직접 선택 필요'}</small>{!r.manual&&<button type="button" className="link" disabled={busy} onClick={()=>{update(i,{product:'',search:'',manual:{name:r.originalName||'',capacity:r.capacity||'',unit:'개',bom:[{code:'',qty:1}]},matchReason:'manual-bom'});ManualPanel(i)}}>수기 BOM 직접 입력</button>}</td>
      <td>{r.product||'—'}<br/>{r.manual?r.manual.name:r.product?r.name:'미선택'}</td><td>{r.date}</td>
      <td className="plan-number"><input aria-label={r.source+' 계획수량'} type="number" step="any" value={rows[i].qty} disabled={busy} onChange={e=>update(i,{qty:e.target.value,quantityRaw:e.target.value,quantityError:false})}/>{r.format==='report'&&!r.quantityError&&<small>{r.quantityFromBatch?'기존 배치 수량 보완':'원본: '+r.quantityRaw}</small>}</td>
      <td>{r.version||'—'} / {r.status}</td><td className="notes-column"><textarea aria-label={r.source+' 비고'} rows={3} value={rows[i].note||''} disabled={busy} onChange={e=>update(i,{note:e.target.value})}/></td><td className={r.selected!==false&&r.error?'negative':''}>{r.selected===false?'제외됨':r.error||'확정 가능'}</td>
     </tr>)}
    </tbody></table></div>
    {manualPanel!==null&&rows[manualPanel]?.manual&&<ManualPlanBom value={rows[manualPanel].manual} materials={state.materials} onClose={()=>ManualPanel(null)} onChange={(manual:any)=>update(manualPanel,{manual})}/>}
    <datalist id="manual-material-codes">{state.materials.filter((m:any)=>!m.deleted).map((m:any)=><option key={m.code} value={m.code}>{m.name}</option>)}</datalist>
    <MaterialAllocations rows={allocations}/>

   </>}
  </div>
  <div className="modalfoot"><small>확정 시 BOM을 저장하고 부자재 현재고를 즉시 차감합니다.</small><button className="primary" disabled={blocked} onClick={commit}>{busy?'처리 중…':old?'기존 계획 복원 후 변경 계획 적용':'신규 계획 배치 확정'}</button></div>
 </section></div>
}
