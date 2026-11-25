import {stockBalances} from './plan-stock.mjs';
import {beforeOrderStatus} from './order-completion.mjs';
import {planQuantity} from './production-plan.mjs';
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';
export function productionMaterialRows(state,plan){const qty=planQuantity(plan);return (plan.lines||[]).map(line=>{const balance=stockBalances(state,line.code),orders=[...(state.orders||[]),...(state.historical||[])].filter(o=>!o.deleted&&o.code===line.code&&!['입고완료','부적합'].includes(beforeOrderStatus(state,o))).sort((a,b)=>date(a.expected||a.date).localeCompare(date(b.expected||b.date))),receipts=(state.receipts||[]).filter(r=>!r.deleted&&!r.cancelled&&r.code===line.code).sort((a,b)=>date(b.date).localeCompare(date(a.date)));return {code:line.code,name:line.name||state.materials.find(m=>m.code===line.code)?.name||line.code,required:Number(line.qty)||0,unitQty:line.unitQty??(qty?Number(line.qty)/qty:0),stock:balance.total,orders,receipts};});}
export function productionPlanMonth(plan){return String(plan.planMonth||plan.planDate||plan.date||'').slice(0,7);}
export function manufacturingRange(state,plan){const schedule=plan.scheduleId&&(state.schedules||[]).find(r=>r.id===plan.scheduleId&&!r.deleted);return schedule?{start:schedule.date,end:schedule.endDate||schedule.date,color:schedule.color}:null;}
