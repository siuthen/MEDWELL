'use client';
import {useState} from 'react';
import Table from './filter-table';
import {batchRows} from '../lib/production-batch.mjs';
import {buildProductionXlsx,downloadXlsx} from '../lib/production-xlsx.mjs';
import {balances} from '../lib/core.mjs';
export default function ProductionBatches({state,busy,onCancel}:any){
 const [error,ErrorText]=useState('');
 const labels:any={active:'활성',replaced:'교체됨 · 읽기 전용',cancelled:'취소됨 · 읽기 전용'};
 function download(batch:any){try{const bytes=buildProductionXlsx({plans:batchRows(state,batch.batchId),state,balance:(code:string)=>balances(state,code),periodKey:batch.periodKey,standard:true,snapshot:true});downloadXlsx(bytes,`${batch.periodKey}_revision${batch.revision}_생산계획.xlsx`);}catch(e:any){ErrorText(e.message)}}
 return <section className="card"><div className="cardhead"><h2>계획 파일 배치 이력</h2></div><p className="help">같은 기간의 활성 파일만 교체합니다. 직접 등록과 과거 배치 없는 기록은 유지됩니다. 다운로드의 현재고는 내려받는 시점 기준이며 BOM은 저장된 스냅샷입니다.</p>{error&&<div className="alert error">{error}</div>}<Table head={['계획기간','파일명','revision','계획 건수','상태','확정 / 교체일','교체 관계','처리']} rows={[...(state.productionBatches||[])].reverse().map((b:any)=>[b.periodKey,b.fileName,b.revision,batchRows(state,b.batchId).length,labels[b.status],new Date(b.createdAt).toLocaleString('ko-KR')+(b.replacedAt?' / '+new Date(b.replacedAt).toLocaleString('ko-KR'):b.cancelledAt?' / '+new Date(b.cancelledAt).toLocaleString('ko-KR'):''),[b.replaces&&'이전: '+b.replaces,b.replacedBy&&'후속: '+b.replacedBy].filter(Boolean).join(' / '),<div className="rowactions"><button className="secondary" onClick={()=>download(b)}>엑셀 내려받기</button>{b.status==='active'&&<button className="link negative" disabled={busy} onClick={()=>{const reason=prompt('배치 전체 취소 사유 (해당 차감이 복원됩니다)');if(reason)onCancel(b.batchId,reason)}}>배치 취소</button>}</div>])}/></section>;
}
