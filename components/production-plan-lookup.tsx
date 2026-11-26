'use client';
import {useId} from 'react';
import {productionMaterialRows,productionPlanMonth,manufacturingRange} from '../lib/production-lookup.mjs';
import {planQuantity} from '../lib/production-plan.mjs';
import {canEditProductionPlan} from '../lib/production-months.mjs';

const nf=(v:number)=>v.toLocaleString('ko-KR');
const formatQuantity=(quantity:number|null,unit:string)=>quantity===null?'-':[nf(quantity),unit].filter(Boolean).join(' ');
const stockColumn='계획 반영 재고';
const bomColumns=[
 {label:'부자재 코드',width:'bom-code-col',alignment:'bom-text'},
 {label:'부자재명',width:'bom-name-col',alignment:'bom-text'},
 {label:'필요수량',width:'bom-quantity-col',alignment:'bom-number'},
 {label:stockColumn,width:'bom-quantity-col',alignment:'bom-number'},
 {label:'발주수량',width:'bom-quantity-col',alignment:'bom-number'},
 {label:'발주일',width:'bom-date-col',alignment:'bom-date'},
 {label:'입고일',width:'bom-date-col',alignment:'bom-date'}
];

function PlannedStockHeading(){
 const descriptionId=useId();
 return <span className="planned-stock-heading">
  <span className="planned-stock-label" tabIndex={0} aria-describedby={descriptionId}>{stockColumn}</span>
  <span className="planned-stock-tooltip" id={descriptionId} role="tooltip">현재 재고에서 확정 생산계획의 필요수량을 차감한 수량</span>
 </span>;
}

function DateDetails({rows,kind,unit}:{
 rows:{id:string;date?:string;expected?:string;paid?:number;free?:number}[];
 kind:'order'|'receipt';
 unit:string;
}){
 if(!rows.length)return <span>-</span>;
 const firstDate=rows[0].date||'-';
 const firstLabel=kind==='receipt'?firstDate+' 완료':firstDate;
 if(rows.length===1)return <span>{firstLabel}</span>;
 return <details>
  <summary>{firstLabel} 외 {rows.length-1}건</summary>
  {rows.map(row=><small key={row.id}>{kind==='order'
   ? `${row.date||'-'} · ${row.expected||'예정일 미정'}`
   : `${row.date||'-'} · ${formatQuantity(Number(row.paid||0)+Number(row.free||0),unit)}`}</small>)}
 </details>;
}

export default function ProductionPlanLookup({state,plans,version,onSaved,onEdit}:any){
 async function remove(plan:any){if(!canEditProductionPlan(plan))return;if(!confirm('생산계획과 연결 제조 일정을 삭제하고 차감 재고를 원복할까요?'))return;const r=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'productionPlanDelete',expectedVersion:version,requestId:crypto.randomUUID(),payload:{id:plan.id,reason:'사용자 삭제'}})}),d=await r.json() as {error?:string};if(!r.ok){alert(d.error??'생산계획을 삭제하지 못했습니다.');return}onSaved(d)}
 return <div className="production-lookup">{plans.map((p:any)=>{
  const range=manufacturingRange(state,p),materials=productionMaterialRows(state,p),editable=canEditProductionPlan(p);
  const status=p.cancelled||p.deleted||p.status==='cancelled'?'취소':p.status==='replaced'?'교체됨':'확정';
  return <article className="production-plan-row" key={p.id}>
   <div className="production-plan-main">
    <div><b>{p.name}</b><small>{p.product||'제품코드 미지정'} · {status}</small></div>
    <strong>{nf(planQuantity(p))}</strong>
    <span>{productionPlanMonth(p)}</span>
    <span>{range?(range.start===range.end?range.start:`${range.start} ~ ${range.end}`):'제조일 미정'}</span>
    <div className="rowactions">
     <button className="secondary" disabled={!editable} onClick={()=>onEdit(p)}>수정</button>
     <button className="secondary negative" disabled={!editable} onClick={()=>remove(p)}>삭제</button>
    </div>
   </div>
   {materials.length?<div className="production-bom-inline" role="region" aria-label={p.name+' BOM 상세'} tabIndex={0}>
    <table className="production-bom-table">
     <colgroup>{bomColumns.map(({label,width})=><col key={label} className={width}/>)}</colgroup>
     <thead><tr>{bomColumns.map(({label,alignment})=><th key={label} scope="col" className={alignment}>{label===stockColumn?<PlannedStockHeading/>:label}</th>)}</tr></thead>
     <tbody>{materials.map((m:any)=>{
      const expected=m.orders[0]?.expected;
      return <tr key={m.code}>
       <td className="bom-text">{m.code}</td>
       <td className="bom-text"><b>{m.name}</b></td>
       <td className="bom-number">{formatQuantity(m.required,m.unit)}</td>
       <td className={m.stock<0?'bom-number negative':'bom-number'}>{formatQuantity(m.stock,m.unit)}</td>
       <td className="bom-number">{formatQuantity(m.orderQuantity,m.unit)}</td>
       <td className="bom-date"><DateDetails rows={m.orders} kind="order" unit={m.unit}/></td>
       <td className="bom-date">{m.receipts.length?<DateDetails rows={m.receipts} kind="receipt" unit={m.unit}/>:expected?`${expected} 예정`:'-'}</td>
      </tr>;
     })}</tbody>
    </table>
   </div>:<p className="help">BOM 미반영 · 제품/BOM 확인 후 자동 반영됩니다.</p>}
  </article>;
 })}</div>;
}
