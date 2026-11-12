'use client';
import {planMonthTotal} from '../lib/production-months.mjs';
export default function ProductionMonthButtons({months,plans,value,onChange}:any){
 function key(e:any,index:number){let next=index;if(e.key==='ArrowRight')next=Math.min(months.length-1,index+1);else if(e.key==='ArrowLeft')next=Math.max(0,index-1);else if(e.key==='Home')next=0;else if(e.key==='End')next=months.length-1;else return;e.preventDefault();onChange(months[next]);document.getElementById('production-month-'+months[next])?.focus();}
 return <div className="production-month-buttons" role="tablist" aria-label="생산계획 조회월">{months.map((month:string,i:number)=><button key={month} id={'production-month-'+month} type="button" role="tab" aria-selected={value===month} aria-controls="production-month-list" tabIndex={value===month?0:-1} className={value===month?'active':''} onClick={()=>onChange(month)} onKeyDown={e=>key(e,i)}><span>{month.slice(0,4)}년 {Number(month.slice(5))}월</span><small>총 {planMonthTotal(plans,month).toLocaleString('ko-KR',{maximumFractionDigits:3})}</small></button>)}</div>;
}
