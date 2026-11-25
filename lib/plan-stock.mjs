import {LEGACY_WAREHOUSES,openingWarehouseBalances,warehouseNames} from './warehouse-data.mjs';
export const WH=LEGACY_WAREHOUSES;
export const activePlan=(s,p)=>!p.cancelled&&!p.deleted&&p.status!=='replaced'&&(!p.batchId||(s.productionBatches||[]).some(b=>b.batchId===p.batchId&&b.status==='active'));
export const lineAllocations=(p,l)=>Array.isArray(l.warehouseAllocations)?l.warehouseAllocations:[{warehouse:p.warehouse,qty:l.qty}];

export function stockBalances(s,code,excludeBatchId){
 const warehouses=warehouseNames(s),base=s.opening?.[code];
 const b=Object.fromEntries(warehouses.map(name=>[name,0]));
 const add=(name,qty)=>{if(Object.hasOwn(b,name))b[name]+=qty;};
 for(const row of openingWarehouseBalances(base))add(row.warehouse,row.qty);
 for(const r of s.receipts||[])if(r.code===code&&!r.cancelled&&!r.deleted&&r.inventoryApplied!==false)add(r.warehouse,r.paid+r.free);
 for(const p of s.productions||[])if(activePlan(s,p)&&(!excludeBatchId||p.batchId!==excludeBatchId))for(const l of p.lines||[])if(l.code===code)for(const a of lineAllocations(p,l))add(a.warehouse,-a.qty);
 for(const t of s.transfers||[])if(t.code===code&&!t.cancelled&&!t.deleted){add(t.from,-t.qty);add(t.to,t.qty);}
 for(const a of s.adjustments||[])if(a.code===code&&!a.cancelled&&!a.deleted)add(a.warehouse,a.qty);
 const known=base?(base.known??(base.warehouseBalances?base.warehouseBalances.map(row=>row.warehouse):WH)).filter(name=>warehouses.includes(name)):[];
 return {...b,total:warehouses.reduce((total,name)=>total+b[name],0),known,confirmed:known.length===warehouses.length};
}

export function allocateMaterial(required,stock,warehouses=WH){
 if(!(required>0)||!Number.isFinite(required))throw Error('유효한 필요량이 아닙니다.');
 const ranked=warehouses.slice().sort((a,b)=>stock[b]-stock[a]),whole=ranked.find(w=>stock[w]>=required);
 if(whole)return [{warehouse:whole,qty:required}];
 let remaining=required;
 const sums=new Map();
 for(const w of ranked){const take=Math.min(Math.max(0,stock[w]),remaining);if(take){sums.set(w,take);remaining-=take;}}
 if(remaining)sums.set(ranked[0],(sums.get(ranked[0])||0)+remaining);
 return warehouses.filter(w=>sums.has(w)).map(warehouse=>({warehouse,qty:sums.get(warehouse)}));
}
