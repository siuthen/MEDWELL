import prices from './closing-prices.json' with {type:'json'};
// Server-only: never import from client components or state/mutation modules.
export function closingReport(state,month){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('마감월을 확인하세요.');
 const rows=state.receipts.filter(r=>!r.cancelled&&!r.deleted&&r.date?.startsWith(month+'-')).map(r=>{
  const price=Object.hasOwn(prices,r.code)?prices[r.code]:null;
  const supply=price===null?null:Math.round(r.paid*price),vat=supply===null?null:Math.round(supply*r.tax/100);
  return {id:r.id,date:r.date,code:r.code,name:state.materials.find(m=>m.code===r.code)?.name||r.name||r.code,vendor:r.vendor,orderId:r.orderId||'',paid:r.paid,free:r.free,tax:r.tax,price,supply,vat,total:supply===null?null:supply+vat,priceStatus:price===null?'단가 미등록':'등록',note:r.note||''};
 });
 const missingCount=rows.filter(r=>r.price===null).length,supply=rows.reduce((n,r)=>n+(r.supply??0),0),vat=rows.reduce((n,r)=>n+(r.vat??0),0);
 return {month,rows,missingCount,supply,vat,total:supply+vat};
}
