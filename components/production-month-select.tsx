'use client';
import {planMonthTotal} from '../lib/production-months.mjs';
export default function ProductionMonthSelect({months,plans,value,onChange}:any){
 return <div className="production-month-select"><label htmlFor="production-month-select">선택월</label><select id="production-month-select" aria-label="선택월" aria-controls="production-month-list" value={value} onChange={e=>onChange(e.target.value)}>{months.map((month:string)=><option key={month} value={month}>{month.slice(0,4)+'년 '+Number(month.slice(5))+'월 · 총 '+planMonthTotal(plans,month).toLocaleString('ko-KR',{maximumFractionDigits:3})}</option>)}</select></div>;
}
