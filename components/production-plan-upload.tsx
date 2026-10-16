'use client';
import {useState} from 'react';
import {readInventoryFile} from '../lib/read-inventory-file';
import {planToday} from '../lib/production-plan.mjs';
import {parsePlanUploadSheets,planUploadPreview} from '../lib/production-plan-import.mjs';
import {inferPlanPeriod,periodValue} from '../lib/production-period.mjs';
import {activeBatch,batchRows,replacementPreview} from '../lib/production-batch.mjs';
import {autoFileName,buildProductionXlsx,downloadXlsx} from '../lib/production-xlsx.mjs';
import {balances} from '../lib/core.mjs';
const nf=(v:any)=>Number.isFinite(Number(v))?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:3}):String(v??'');
export default function ProductionPlanUpload({state,version,onClose,onSaved}:any){
 const [rows,Rows]=useState<any[]>([]),[issues,Issues]=useState<string[]>([]),[error,ErrorText]=useState(''),[busy,Busy]=useState(false),[fileName,FileName]=useState(''),[warehouse,Warehouse]=useState('김포창고'),[defaultDate,DefaultDate]=useState(planToday),[baseVersion,BaseVersion]=useState(version),[requestId,RequestId]=useState('');
 const [periodStart,PeriodStart]=useState(''),[periodEnd,PeriodEnd]=useState(''),[periodTouched,PeriodTouched]=useState(false),[original,Original]=useState<Uint8Array|null>(null);
 const inferred=inferPlanPeriod(rows),start=periodTouched?periodStart:inferred?.periodStart||periodStart,end=periodTouched?periodEnd:inferred?.periodEnd||periodEnd;
 let period:any=null,periodError='',old:any=null;try{period=periodValue(start,end);old=activeBatch(state,period.periodKey);}catch(e:any){periodError=e.message;}
 const {checked,included,invalid,deductions,payloadRows}:any=planUploadPreview(rows,state,warehouse,defaultDate,(code:string)=>balances(state,code),{allowPeriodDates:true,activeRows:old?batchRows(state,old.batchId):[]});
 if(period&&included.some((r:any)=>r.date.slice(0,7)<start||r.date.slice(0,7)>end))periodError='포함된 계획일이 선택한 계획기간 밖에 있습니다.';
 const replacement:any=period?replacementPreview(state,period.periodKey,deductions,(code:string)=>balances(state,code)):{rows:[]};
 const negative=replacement.rows.some((r:any)=>r.after<0),stale=baseVersion!==version;
 const products=state.products.filter((p:any)=>!p.deleted).slice().sort((a:any,b:any)=>a.code.localeCompare(b.code));
 const blocked=busy||!included.length||!!invalid.length||!!issues.length||stale||!defaultDate||!!periodError;
 function update(index:number,patch:any){Rows(old=>old.map((r,i)=>i===index?{...r,...patch}:r));}
 async function read(file?:File){
  if(!file)return;Busy(true);ErrorText('');Rows([]);Issues([]);Original(null);PeriodTouched(false);PeriodStart('');PeriodEnd('');FileName(file.name);
  try{const result=parsePlanUploadSheets(await readInventoryFile(file),state.products);Rows(result.rows);Issues(result.issues);if(/\.xlsx$/i.test(file.name))Original(new Uint8Array(await file.arrayBuffer()));BaseVersion(version);RequestId(crypto.randomUUID());if(!result.rows.length)ErrorText('생산계획 행을 찾지 못했습니다. 일반 표의 완제품 코드·계획수량 또는 병합형 보고서 구조를 확인해주세요.');}
  catch(e:any){ErrorText(e.message)}finally{Busy(false)}
 }
 async function commit(){
  if(blocked)return;
  if(!confirm(old?`기존 파일 ${old.fileName} (revision ${old.revision})의 차감을 복원하고 ${included.length}건의 변경 계획을 적용할까요?`:`${included.length}건의 신규 파일 배치를 확정할까요?`))return;
  Busy(true);ErrorText('');
  try{const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:baseVersion,requestId,type:'replaceProductionPlanBatch',payload:{rows:payloadRows,defaultWarehouse:warehouse,fileName,periodStart:start,periodEnd:end,expectedBatchId:old?.batchId||null}})}),result:any=await response.json();if(!response.ok)throw new Error(result.error);await onSaved(result);onClose();}
  catch(e:any){ErrorText(e.message)}finally{Busy(false)}
 }
 function download(){try{if(!original)return;const bytes=buildProductionXlsx({original,plans:checked,state,balance:(code:string)=>balances(state,code),periodKey:period?.periodKey||'기간 미확정'});downloadXlsx(bytes,autoFileName(fileName));}catch(e:any){ErrorText(e.message)}}
 return <div className="overlay"><section className="modal inventory-upload" role="dialog" aria-modal="true" aria-label="생산계획 엑셀 업로드">
  <div className="cardhead"><h2>생산계획 엑셀 업로드</h2><button className="secondary" disabled={busy} onClick={onClose}>닫기</button></div>
  <div className="upload-content">
   <div className="plan-upload-fields">
    <label>기본 계획일<input type="date" required value={defaultDate} disabled={busy} onChange={e=>DefaultDate(e.target.value)}/></label>
    <label>기본 차감 창고<select value={warehouse} disabled={busy} onChange={e=>Warehouse(e.target.value)}><option>김포창고</option><option>오류창고</option></select></label>
    <label>생산계획 파일<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={e=>read(e.target.files?.[0])}/></label>
   </div>
   <div className="plan-upload-fields"><label>계획 시작월<input type="month" required value={start} disabled={busy} onChange={e=>{PeriodStart(e.target.value);PeriodEnd(end);PeriodTouched(true)}}/></label><label>계획 종료월<input type="month" required value={end} disabled={busy} onChange={e=>{PeriodStart(start);PeriodEnd(e.target.value);PeriodTouched(true)}}/></label></div>
   {rows.length>0&&periodError&&<div className="alert error">{periodError}</div>}
   {old&&<div className="alert"><div><b>교체 대상: {old.fileName} · revision {old.revision} · 활성 계획 {batchRows(state,old.batchId).filter((r:any)=>!r.cancelled).length}건</b><p>기존 계획의 차감을 복원하고 변경 파일을 적용합니다. 복원과 새 차감은 한 번에 저장됩니다.</p></div></div>}
   <p className="help">.xlsx / UTF-8 CSV · 최대 15MB, 5,000행. 일반 표와 병합형 생산계획 보고서를 지원합니다. 숨김 시트는 제외합니다. 병합형은 시트 기간과 순번의 월로 매월 1일을 사용합니다. 일반 파일에 날짜·창고가 없으면 위 기본값을 사용합니다. 계획기간은 포함한 날짜로 추출하며 수정할 수 있습니다. ‘박스’ 수량은 박스 개수 그대로 적용하며 내용물 수로 곱하지 않습니다.</p>
   {error&&<div className="alert error" role="alert">{error}</div>}
   {!defaultDate&&<div className="alert error">기본 계획일을 선택해주세요.</div>}
   {issues.length>0&&<div className="alert error" role="alert"><div>인식하지 못한 시트를 수정하거나 제거한 뒤 다시 업로드해주세요.<ul>{issues.map(x=><li key={x}>{x}</li>)}</ul></div></div>}
   {stale&&rows.length>0&&<div className="alert error">서버 데이터가 변경되었습니다. 최신 내용을 기준으로 파일을 다시 선택해주세요.</div>}
   {rows.length>0&&<>
    <p><b>{fileName} · 검출 {checked.length}행 · 포함 {included.length}행 · 제외 {checked.length-included.length}행 · 포함 오류 {invalid.length}행</b></p>
    <p className="help">이름과 용량이 유일하게 일치할 때만 자동 추천합니다. 매칭 제품·단위·BOM을 확인해주세요. 모호하거나 등록되지 않은 제품은 직접 선택하거나 제외해야 합니다.</p>
    <div className="actions"><button className="secondary" disabled={busy||!original} onClick={download}>자동작성 엑셀 내려받기</button>{!original&&<small>CSV는 원본 서식이 없어 자동작성 XLSX 내려받기를 지원하지 않습니다.</small>}<button className="secondary" disabled={busy} onClick={()=>Rows(old=>old.map(r=>({...r,selected:true})))}>전체 선택</button><button className="secondary" disabled={busy} onClick={()=>Rows(old=>old.map(r=>({...r,selected:false})))}>전체 해제</button></div>
    <div className="tablewrap upload-preview"><table><thead><tr>{['포함','순번 / 원본 위치','원본 품명','용량','매칭 제품','제품코드 / 정식 제품명','계획일','창고','계획수량','BOM 버전 / 상태','비고','오류'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
     {checked.map((r:any,i:number)=><tr key={i} className={r.selected===false?'plan-excluded':''}>
      <td><input type="checkbox" aria-label={r.source+' 포함'} checked={r.selected!==false} disabled={busy} onChange={e=>update(i,{selected:e.target.checked})}/></td>
      <td>{r.sequence||'—'}<br/><small>{r.sheetName} {r.rowNumber}행</small></td><td>{r.originalName||'—'}</td><td>{r.capacity||'—'}</td>
      <td><select className="plan-product-select" aria-label={r.source+' 매칭 제품'} value={r.product} disabled={busy} onChange={e=>update(i,{product:e.target.value,matchReason:'manual'})}><option value="">제품을 선택하세요</option>{r.product&&!products.some((p:any)=>p.code===r.product)&&<option value={r.product}>미등록: {r.product}</option>}{products.map((p:any)=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select><small>{r.matchReason==='auto'?'자동 추천':r.matchReason==='ambiguous'?`후보 ${r.candidateCount}개 · 직접 선택 필요`:r.matchReason==='none'?'일치 제품 없음':r.matchReason==='manual'?'직접 선택':'파일 코드'}</small></td>
      <td>{r.product||'—'}<br/>{r.product?r.name:'미선택'}</td><td>{r.date}</td><td>{r.warehouse}</td>
      <td className="plan-number">{r.quantityError?r.quantityRaw:nf(r.qty)}{r.format==='report'&&!r.quantityError&&<small>{r.quantityFromBatch?'기존 배치 수량 보완':'원본: '+r.quantityRaw}</small>}</td>
      <td>{r.version||'—'} / {r.status}</td><td>{r.note}</td><td className={r.selected!==false&&r.error?'negative':''}>{r.selected===false?'제외됨':r.error||'확정 가능'}</td>
     </tr>)}
    </tbody></table></div>
    <h3>{old?'교체 재고 미리보기':'신규 배치 차감 미리보기'}</h3><p className="help">포함된 행 중 제품 매칭과 검증이 완료된 행만 합산합니다. 제외된 행은 확정 요청에 포함하지 않습니다.</p>
    {negative&&<div className="alert error">차감 후 예상재고가 음수인 자재가 있습니다. 확인 후에도 확정할 수 있습니다.</div>}
    <div className="tablewrap upload-preview"><table><thead><tr>{['자재코드','자재명','창고','기존 차감량','복원량','새 차감량','순증감','현재고 → 교체 후 예상재고'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{replacement.rows.map((r:any)=><tr key={r.code+r.warehouse}><td>{r.code}</td><td>{r.name}</td><td>{r.warehouse}</td><td className="plan-number">{nf(r.previous)}</td><td className="plan-number">{nf(r.restored)}</td><td className="plan-number">{nf(r.required)}</td><td className="plan-number">{nf(r.net)}</td><td className={'plan-number '+(r.after<0?'negative':'')}>{nf(r.current)} → {nf(r.after)}</td></tr>)}</tbody></table></div>
   </>}
  </div>
  <div className="modalfoot"><small>확정 시 BOM을 저장하고 부자재 현재고를 즉시 차감합니다.</small><button className="primary" disabled={blocked} onClick={commit}>{busy?'처리 중…':old?'기존 계획 복원 후 변경 계획 적용':'신규 계획 배치 확정'}</button></div>
 </section></div>
}
