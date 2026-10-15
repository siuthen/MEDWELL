'use client';
import {useState} from 'react';
import {readInventoryFile} from '../lib/read-inventory-file';
import {planToday} from '../lib/production-plan.mjs';
import {parsePlanUploadSheets,planUploadPreview} from '../lib/production-plan-import.mjs';
import {balances} from '../lib/core.mjs';
const nf=(v:any)=>Number.isFinite(Number(v))?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:3}):String(v??'');
export default function ProductionPlanUpload({state,version,onClose,onSaved}:any){
 const [rows,Rows]=useState<any[]>([]),[issues,Issues]=useState<string[]>([]),[error,ErrorText]=useState(''),[busy,Busy]=useState(false),[fileName,FileName]=useState(''),[warehouse,Warehouse]=useState('김포창고'),[defaultDate,DefaultDate]=useState(planToday),[baseVersion,BaseVersion]=useState(version),[requestId,RequestId]=useState('');
 const {checked,included,invalid,deductions,payloadRows}:any=planUploadPreview(rows,state,warehouse,defaultDate,(code:string)=>balances(state,code));
 const negative=deductions.some((r:any)=>r.after<0),stale=baseVersion!==version;
 const products=state.products.filter((p:any)=>!p.deleted).slice().sort((a:any,b:any)=>a.code.localeCompare(b.code));
 const blocked=busy||!included.length||!!invalid.length||!!issues.length||stale||!defaultDate;
 function update(index:number,patch:any){Rows(old=>old.map((r,i)=>i===index?{...r,...patch}:r));}
 async function read(file?:File){
  if(!file)return;Busy(true);ErrorText('');Rows([]);Issues([]);FileName(file.name);
  try{const result=parsePlanUploadSheets(await readInventoryFile(file),state.products);Rows(result.rows);Issues(result.issues);BaseVersion(version);RequestId(crypto.randomUUID());if(!result.rows.length)ErrorText('생산계획 행을 찾지 못했습니다. 일반 표의 완제품 코드·계획수량 또는 병합형 보고서 구조를 확인해주세요.');}
  catch(e:any){ErrorText(e.message)}finally{Busy(false)}
 }
 async function commit(){
  if(blocked)return;
  if(!confirm(`${included.length}건의 생산계획을 확정하고 해당 창고의 부자재를 즉시 차감할까요?`))return;
  Busy(true);ErrorText('');
  try{const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:baseVersion,requestId,type:'bulkProductionPlan',payload:{rows:payloadRows,defaultWarehouse:warehouse,fileName}})}),result:any=await response.json();if(!response.ok)throw new Error(result.error);await onSaved(result);onClose();}
  catch(e:any){ErrorText(e.message)}finally{Busy(false)}
 }
 return <div className="overlay"><section className="modal inventory-upload" role="dialog" aria-modal="true" aria-label="생산계획 엑셀 업로드">
  <div className="cardhead"><h2>생산계획 엑셀 업로드</h2><button className="secondary" disabled={busy} onClick={onClose}>닫기</button></div>
  <div className="upload-content">
   <div className="plan-upload-fields">
    <label>기본 계획일<input type="date" required value={defaultDate} disabled={busy} onChange={e=>DefaultDate(e.target.value)}/></label>
    <label>기본 차감 창고<select value={warehouse} disabled={busy} onChange={e=>Warehouse(e.target.value)}><option>김포창고</option><option>오류창고</option></select></label>
    <label>생산계획 파일<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={e=>read(e.target.files?.[0])}/></label>
   </div>
   <p className="help">.xlsx / UTF-8 CSV · 최대 15MB, 5,000행. 일반 표와 병합형 생산계획 보고서를 지원합니다. 숨김 시트는 제외합니다. 파일에 계획일·창고가 없으면 위 기본값을 사용합니다. ‘박스’ 수량은 박스 개수 그대로 적용하며 내용물 수로 곱하지 않습니다.</p>
   {error&&<div className="alert error" role="alert">{error}</div>}
   {!defaultDate&&<div className="alert error">기본 계획일을 선택해주세요.</div>}
   {issues.length>0&&<div className="alert error" role="alert"><div>인식하지 못한 시트를 수정하거나 제거한 뒤 다시 업로드해주세요.<ul>{issues.map(x=><li key={x}>{x}</li>)}</ul></div></div>}
   {stale&&rows.length>0&&<div className="alert error">서버 데이터가 변경되었습니다. 최신 내용을 기준으로 파일을 다시 선택해주세요.</div>}
   {rows.length>0&&<>
    <p><b>{fileName} · 검출 {checked.length}행 · 포함 {included.length}행 · 제외 {checked.length-included.length}행 · 포함 오류 {invalid.length}행</b></p>
    <p className="help">이름과 용량이 유일하게 일치할 때만 자동 추천합니다. 매칭 제품·단위·BOM을 확인해주세요. 모호하거나 등록되지 않은 제품은 직접 선택하거나 제외해야 합니다.</p>
    <div className="actions"><button className="secondary" disabled={busy} onClick={()=>Rows(old=>old.map(r=>({...r,selected:true})))}>전체 선택</button><button className="secondary" disabled={busy} onClick={()=>Rows(old=>old.map(r=>({...r,selected:false})))}>전체 해제</button></div>
    <div className="tablewrap upload-preview"><table><thead><tr>{['포함','순번 / 원본 위치','원본 품명','용량','매칭 제품','제품코드 / 정식 제품명','계획일','창고','계획수량','BOM 버전 / 상태','비고','오류'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
     {checked.map((r:any,i:number)=><tr key={i} className={r.selected===false?'plan-excluded':''}>
      <td><input type="checkbox" aria-label={r.source+' 포함'} checked={r.selected!==false} disabled={busy} onChange={e=>update(i,{selected:e.target.checked})}/></td>
      <td>{r.sequence||'—'}<br/><small>{r.sheetName} {r.rowNumber}행</small></td><td>{r.originalName||'—'}</td><td>{r.capacity||'—'}</td>
      <td><select className="plan-product-select" aria-label={r.source+' 매칭 제품'} value={r.product} disabled={busy} onChange={e=>update(i,{product:e.target.value,matchReason:'manual'})}><option value="">제품을 선택하세요</option>{r.product&&!products.some((p:any)=>p.code===r.product)&&<option value={r.product}>미등록: {r.product}</option>}{products.map((p:any)=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select><small>{r.matchReason==='auto'?'자동 추천':r.matchReason==='ambiguous'?`후보 ${r.candidateCount}개 · 직접 선택 필요`:r.matchReason==='none'?'일치 제품 없음':r.matchReason==='manual'?'직접 선택':'파일 코드'}</small></td>
      <td>{r.product||'—'}<br/>{r.product?r.name:'미선택'}</td><td>{r.date}</td><td>{r.warehouse}</td>
      <td className="plan-number">{r.quantityError?r.quantityRaw:nf(r.qty)}{r.format==='report'&&!r.quantityError&&<small>원본: {r.quantityRaw}</small>}</td>
      <td>{r.version||'—'} / {r.status}</td><td>{r.note}</td><td className={r.selected!==false&&r.error?'negative':''}>{r.selected===false?'제외됨':r.error||'확정 가능'}</td>
     </tr>)}
    </tbody></table></div>
    <h3>BOM 자재 차감 합계</h3><p className="help">포함된 행 중 제품 매칭과 검증이 완료된 행만 합산합니다. 제외된 행은 확정 요청에 포함하지 않습니다.</p>
    {negative&&<div className="alert error">차감 후 예상재고가 음수인 자재가 있습니다. 확인 후에도 확정할 수 있습니다.</div>}
    <div className="tablewrap upload-preview"><table><thead><tr>{['자재코드','자재명','창고','필요수량','현재고 → 차감 후 예상재고'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{deductions.map((r:any)=><tr key={r.code+r.warehouse}><td>{r.code}</td><td>{r.name}</td><td>{r.warehouse}</td><td className="plan-number">{nf(r.required)}</td><td className={'plan-number '+(r.after<0?'negative':'')}>{nf(r.current)} → {nf(r.after)}{!r.known&&' (기초재고 미확정)'}</td></tr>)}</tbody></table></div>
   </>}
  </div>
  <div className="modalfoot"><small>확정 시 BOM을 저장하고 부자재 현재고를 즉시 차감합니다.</small><button className="primary" disabled={blocked} onClick={commit}>{busy?'처리 중…':'생산계획 일괄 확정'}</button></div>
 </section></div>
}
