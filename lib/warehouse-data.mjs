export const LEGACY_WAREHOUSES=['김포창고','오류창고'];
const nonWarehouse=new Set(['자재별 자동배정','total','known','confirmed','__proto__','constructor','prototype']);
export const isWarehouseName=name=>typeof name==='string'&&name.trim()!==''&&!nonWarehouse.has(name);

export function openingWarehouseBalances(opening){
 return opening?.warehouseBalances??[
  {warehouse:LEGACY_WAREHOUSES[0],qty:opening?Number(opening.total??0)-Number(opening.error??0):0},
  {warehouse:LEGACY_WAREHOUSES[1],qty:Number(opening?.error??0)}
 ];
}

export function visitWarehouseReferences(row,visit){
 if(!row||typeof row!=='object')return;
 for(const [key,value] of Object.entries(row)){
  if(['warehouse','from','to'].includes(key)&&isWarehouseName(value))visit(row,key,value);
  if(key==='known'&&Array.isArray(value))value.forEach((name,index)=>{if(isWarehouseName(name))visit(value,index,name);});
  else if(value&&typeof value==='object')visitWarehouseReferences(value,visit);
 }
}

export const warehouseCollections=['opening','historical','orders','receipts','productions','productionBatches','transfers','adjustments','schedules','review','closes'];

/** @returns {string[]} */
export function warehouseNames(state){
 if(Array.isArray(state?.warehouses))return state.warehouses;
 const names=new Set(LEGACY_WAREHOUSES);
 for(const key of warehouseCollections)visitWarehouseReferences(state?.[key],(_row,_key,name)=>names.add(name));
 return [...names];
}
