import {stockBalances} from './plan-stock.mjs';
import {beforeOrderStatus,orderQty} from './order-completion.mjs';
import {planQuantity} from './production-plan.mjs';
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';
const cancelledOrderStatuses=new Set(['취소','취소됨','cancelled','canceled']);

export function productionMaterialRows(state,plan){
 const qty=planQuantity(plan);
 return (plan.lines||[]).map(line=>{
  const material=state.materials.find(m=>m.code===line.code);
  const balance=stockBalances(state,line.code);
  const orders=[...(state.orders||[]),...(state.historical||[])]
   .filter(o=>o.code===line.code&&!o.deleted&&!o.cancelled&&!cancelledOrderStatuses.has(o.status)
    &&!['입고완료','부적합'].includes(beforeOrderStatus(state,o)))
   .sort((a,b)=>date(a.expected||a.date).localeCompare(date(b.expected||b.date)));
  const orderQuantities=orders.map(orderQty).filter(Number.isFinite);
  const receipts=(state.receipts||[])
   .filter(r=>!r.deleted&&!r.cancelled&&r.code===line.code)
   .sort((a,b)=>date(b.date).localeCompare(date(a.date)));
  return {
   code:line.code,
   name:line.name||material?.name||line.code,
   unit:material?.unit||line.unit||'',
   required:Number(line.qty)||0,
   unitQty:line.unitQty??(qty?Number(line.qty)/qty:0),
   stock:balance.total,
   orderQuantity:orderQuantities.length?orderQuantities.reduce((sum,n)=>sum+n,0):null,
   orders,
   receipts
  };
 });
}
export function productionPlanMonth(plan){return String(plan.planMonth||plan.planDate||plan.date||'').slice(0,7);}
export function manufacturingRange(state,plan){const schedule=plan.scheduleId&&(state.schedules||[]).find(r=>r.id===plan.scheduleId&&!r.deleted);return schedule?{start:schedule.date,end:schedule.endDate||schedule.date,color:schedule.color}:null;}
