import {planQuantity} from './production-plan.mjs';
import {validMonth} from './production-period.mjs';
export const FIRST_PLAN_MONTH='2026-11';
export const seoulPlanMonth=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now);
export function productionMonths(plans,now=new Date()){
 const months=[...new Set(plans.map(p=>String(p.date||'').slice(0,7)).filter(month=>validMonth(month)&&month>=FIRST_PLAN_MONTH))].sort();
 if(months.length)return months;
 const current=seoulPlanMonth(now);return [validMonth(current)&&current>=FIRST_PLAN_MONTH?current:FIRST_PLAN_MONTH];
}
export const selectedPlanMonth=(months,value,now=new Date())=>months.includes(value)?value:months.includes(seoulPlanMonth(now))?seoulPlanMonth(now):months.at(-1);
export const plansForMonth=(plans,month)=>plans.filter(p=>String(p.date||'').slice(0,7)===month);
export const planMonthTotal=(plans,month)=>plansForMonth(plans,month).reduce((n,p)=>n+(Number.isFinite(Number(planQuantity(p)))?Number(planQuantity(p)):0),0);
export const canEditProductionPlan=p=>p.kind==='productionPlan'&&!p.cancelled&&!p.deleted&&!p.batchId&&!['replaced','cancelled','deleted'].includes(p.status);
