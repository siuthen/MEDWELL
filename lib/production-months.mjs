import {planQuantity} from './production-plan.mjs';
import {validMonth} from './production-period.mjs';
import {nextMonth} from './auto-production.mjs';
export const FIRST_PLAN_MONTH='2026-11';
export const seoulPlanMonth=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now);
export function productionMonths(plans,now=new Date()){
 const current=seoulPlanMonth(now),latest=[FIRST_PLAN_MONTH,...(validMonth(current)?[current]:[]),...plans.map(p=>String(p.date||'').slice(0,7)).filter(validMonth)].sort().at(-1),months=[];
 for(let month=FIRST_PLAN_MONTH;month&&month<=latest;month=nextMonth(month))months.push(month);return months;
}
export const selectedPlanMonth=(months,value)=>months.includes(value)?value:months.at(-1);
export const plansForMonth=(plans,month)=>plans.filter(p=>String(p.date||'').slice(0,7)===month);
export const planMonthTotal=(plans,month)=>plansForMonth(plans,month).reduce((n,p)=>n+(Number.isFinite(Number(planQuantity(p)))?Number(planQuantity(p)):0),0);
export const canEditProductionPlan=p=>p.kind==='productionPlan'&&!p.cancelled&&!p.deleted&&!p.batchId&&!['replaced','cancelled','deleted'].includes(p.status);
