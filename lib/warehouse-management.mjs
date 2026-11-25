import {isWarehouseName,openingWarehouseBalances,visitWarehouseReferences,warehouseCollections,warehouseNames} from './warehouse-data.mjs';
import {activePlan,stockBalances} from './plan-stock.mjs';

export const warehouseActions=['warehouseCreate','warehouseRename','warehouseDelete'];

function usage(state,name){
 const codes=new Set(Object.keys(state.opening||{}));
 for(const row of [...(state.materials||[]),...(state.receipts||[]),...(state.transfers||[]),...(state.adjustments||[])])if(row.code)codes.add(row.code);
 for(const plan of state.productions||[])for(const line of plan.lines||[])if(line.code)codes.add(line.code);
 const workspace={...state,warehouses:warehouseNames(state)};
 const nonzero=[...codes].filter(code=>stockBalances(workspace,code)[name]!==0).length;
 const activeRows=['historical','orders','receipts','transfers','adjustments','schedules'].flatMap(key=>(state[key]||[]).filter(row=>!row.deleted&&!row.cancelled));
 activeRows.push(...(state.productions||[]).filter(row=>activePlan(state,row)));
 const references=activeRows.filter(row=>{
  let found=false;
  visitWarehouseReferences(row,(_object,_key,value)=>{if(value===name)found=true;});
  return found;
 }).length;
 return {nonzero,references};
}

export function applyWarehouseAction(state,{type,payload,requestId},actor,at){
 if(typeof requestId!=='string'||!requestId.trim())throw Error('요청번호가 없습니다.');
 if(state.processed.includes(requestId))return state;
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('창고 정보를 확인하세요.');

 const warehouses=warehouseNames(state);
 const old=payload.warehouse;
 const name=typeof payload.name==='string'?payload.name.trim():'';
 if(type!=='warehouseCreate'&&!warehouses.includes(old))throw Error('등록된 창고를 선택하세요.');
 if(type!=='warehouseDelete'){
  if(!isWarehouseName(name)||name.length>100||/[\x00-\x1f\x7f]/.test(name))throw Error('유효한 창고명을 입력하세요.');
  if(warehouses.includes(name))throw Error('이미 등록된 창고명입니다.');
 }else{
  if(warehouses.length===1)throw Error('창고는 최소 1개를 유지해야 합니다.');
  const {nonzero,references}=usage(state,old);
  if(nonzero||references)throw Error(`현재고가 0이 아닌 품목 ${nonzero}개 · 사용 기록 ${references}건. 먼저 다른 창고로 이동하거나 기록을 정리하세요.`);
 }

 const trial=structuredClone(state);
 if(type==='warehouseCreate')trial.warehouses=[...warehouses,name];
 else{
  for(const opening of Object.values(trial.opening||{})){
   opening.warehouseBalances=openingWarehouseBalances(opening);
   if(type==='warehouseDelete'){
    opening.warehouseBalances=opening.warehouseBalances.filter(row=>row.warehouse!==old);
    if(opening.known)opening.known=opening.known.filter(warehouse=>warehouse!==old);
   }
  }
  if(type==='warehouseRename'){
   for(const key of warehouseCollections)visitWarehouseReferences(trial[key],(row,key,value)=>{if(value===old)row[key]=name;});
   trial.warehouses=warehouses.map(warehouse=>warehouse===old?name:warehouse);
  }else trial.warehouses=warehouses.filter(warehouse=>warehouse!==old);
 }
 const description={warehouseCreate:'창고 추가',warehouseRename:'창고 이름 변경',warehouseDelete:'창고 삭제'}[type];
 trial.audit.unshift({id:requestId,at,actor,type,description,payload:{warehouse:type==='warehouseCreate'?name:old,...(type==='warehouseRename'?{name}:{})}});
 trial.processed.push(requestId);
 return Object.assign(state,trial);
}
