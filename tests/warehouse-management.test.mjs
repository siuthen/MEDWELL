import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apply,balances,latestNote,seed} from '../lib/core.mjs';
import {warehouseNames} from '../lib/warehouse-data.mjs';
import {inventoryCsvRows} from '../lib/usage-era.mjs';
import {parseInventorySheets,validateInventoryRows} from '../lib/inventory-import.mjs';
import {autoPlanRecords} from '../lib/auto-production.mjs';

const fixture=()=>{
 const state=seed({bom:[],purchase:[]},[]);
 state.materials=[{code:'M',name:'자재',spec:'규격'},{code:'N',name:'미확정'}];
 state.products=[{code:'P',name:'완제품',approved:true,bom:[{code:'M',qty:2}]}];
 state.opening.M={total:100,error:20,known:['김포창고','오류창고']};
 return state;
};
const run=(state,type,payload,requestId=type)=>apply(state,{type,payload,requestId},'fixture');

test('기존 자료의 정확한 구조화 창고명을 수집하고 원본 상태를 보존',()=>{
 const state=fixture();
 state.opening.M.known.push(' A 별관 ');
 state.receipts.push({warehouse:'A 별관'});
 state.productions.push({warehouse:'자재별 자동배정',lines:[{warehouseAllocations:[{warehouse:'별관 B'}]}]});
 state.transfers.push({from:'별관 C',to:'별관 D'});
 state.audit.push({payload:{warehouse:'감사 스냅샷'}});
 const before=structuredClone(state);
 assert.deepEqual(warehouseNames(state),['김포창고','오류창고',' A 별관 ','A 별관','별관 B','별관 C','별관 D']);
 assert.deepEqual(state,before);
});

test('창고 추가는 0으로 시작하고 중복·빈 이름을 거절하며 창고별 CSV 열을 추가',()=>{
 const state=fixture();
 run(state,'warehouseCreate',{name:'  제3창고  '});
 assert.deepEqual(state.warehouses,['김포창고','오류창고','제3창고']);
 assert.equal(balances(state,'M')['제3창고'],0);
 assert.equal(balances(state,'N')['제3창고'],0);
 assert.deepEqual(state.adjustments,[]);
 assert.deepEqual(inventoryCsvRows(state.materials,code=>balances(state,code),state.warehouses),[
  ['품목코드','품목명','규격','김포창고','오류창고','제3창고'],
  ['M','자재','규격',80,20,0],
  ['N','미확정',undefined,'미확정','미확정',0]
 ]);
 const before=structuredClone(state);
 assert.throws(()=>run(state,'warehouseCreate',{name:' 제3창고 '},'dup'),/중복|이미/);
 assert.throws(()=>run(state,'warehouseCreate',{name:'   '},'empty'),/창고명/);
 assert.deepEqual(state,before);
});

test('이름 변경은 기초재고·입고·생산·배정·이동 양쪽·조정을 바꾸고 재고 합계와 과거 감사로그를 보존',()=>{
 const s=fixture(),old='김포창고',name='신규 이름';
 s.receipts.push({code:'M',warehouse:old,paid:6,free:2});
 s.productions.push({warehouse:old,lines:[{code:'M',qty:7}]},{warehouse:'자재별 자동배정',lines:[{code:'M',qty:2,warehouseAllocations:[{warehouse:old,qty:2}]}]});
 s.transfers.push({code:'M',from:old,to:'오류창고',qty:3},{code:'M',from:'오류창고',to:old,qty:1});
 s.adjustments.push({code:'M',warehouse:old,qty:4});
 s.audit.push({type:'stockSet',payload:{code:'M',warehouse:old,note:'이전 메모'}});
 const oldAudit=structuredClone(s.audit),before=balances(s,'M');
 run(s,'warehouseRename',{warehouse:old,name});
 assert.equal(balances(s,'M')[name],before[old]);
 assert.equal(balances(s,'M').total,before.total);
 assert.equal(balances(s,'M')['오류창고'],before['오류창고']);
 assert.ok(s.opening.M.known.includes(name));
 assert.equal(s.opening.M.warehouseBalances[0].warehouse,name);
 assert.equal(s.receipts[0].warehouse,name);
 assert.equal(s.productions[0].warehouse,name);
 assert.equal(s.productions[1].lines[0].warehouseAllocations[0].warehouse,name);
 assert.equal(s.transfers[0].from,name);
 assert.equal(s.transfers[1].to,name);
 assert.equal(s.adjustments[0].warehouse,name);
 assert.deepEqual(s.audit.slice(1),oldAudit);
 assert.equal(latestNote(s,'M',name),'이전 메모');
 assert.equal(s.audit[0].type,'warehouseRename');
});

test('비제로 재고와 재고 효과가 없는 활성 참조도 삭제를 막고 미사용·마지막 창고를 구분',()=>{
 const s=fixture();
 run(s,'warehouseCreate',{name:'미사용'});
 assert.throws(()=>run(s,'warehouseDelete',{warehouse:'김포창고'},'stock'),/품목 1개 · 사용 기록 0건.*먼저 다른 창고로 이동하거나 기록을 정리하세요/);
 const receipt={code:'M',warehouse:'미사용',paid:5,free:0,inventoryApplied:false};
 s.receipts.push(receipt);
 const before=structuredClone(s);
 assert.throws(()=>run(s,'warehouseDelete',{warehouse:'미사용'},'reference'),/품목 0개 · 사용 기록 1건/);
 assert.deepEqual(s,before);
 receipt.cancelled=true;
 run(s,'warehouseDelete',{warehouse:'미사용'},'unused');
 assert.ok(!warehouseNames(s).includes('미사용'));
 assert.equal(s.receipts[0].warehouse,'미사용');
 s.opening={};
 run(s,'warehouseDelete',{warehouse:'오류창고'},'second');
 assert.throws(()=>run(s,'warehouseDelete',{warehouse:'김포창고'},'last'),/최소 1개/);
});

test('추가 창고를 입고·이동·조정·계획·재고 파일에서 사용하고 조회 화면도 동적 목록을 연결',()=>{
 const s=fixture();
 run(s,'warehouseCreate',{name:'제3창고'});
 run(s,'receipt',{code:'M',warehouse:'제3창고',paid:150,free:0,tax:0,price:0,date:'2026-11-02',vendor:'업체'});
 run(s,'transfer',{code:'M',from:'제3창고',to:'김포창고',qty:5,date:'2026-11-03'});
 run(s,'adjustment',{code:'M',warehouse:'제3창고',qty:2,note:'조정',date:'2026-11-04'});
 const records=autoPlanRecords(s,{rows:[{product:'P',qty:10,date:'2026-11-05'}]},'auto');
 assert.deepEqual(records[0].lines[0].warehouseAllocations,[{warehouse:'제3창고',qty:20}]);
 run(s,'productionPlan',{product:'P',qty:2,date:'2026-11-05',warehouse:'제3창고'});
 assert.equal(balances(s,'M')['제3창고'],143);
 const parsed=parseInventorySheets([{name:'재고',rows:[['품목코드','품목명','제3창고'],['M','자재','9']]}],s.warehouses);
 assert.equal(validateInventoryRows(parsed.rows,s.materials,s.warehouses)[0].error,'');
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/품목·재고 추가<\/button>.*창고 추가/);
 assert.match(page,/WarehouseManager warehouses=\{warehouses\}/);
 assert.match(page,/head=\{\['품목코드','부자재명','규격',\.\.\.warehouses/);
 assert.match(page,/select\('출발창고','from',warehouses\)/);
 assert.match(page,/select\('도착창고','to',warehouses\)/);
});
