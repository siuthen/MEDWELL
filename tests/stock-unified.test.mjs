import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,apply,balances,latestNote} from '../lib/core.mjs';
const fresh=()=>seed({bom:[],purchase:[]},[]);
test('통합 수정: 두 창고 재고 및 비고, 재시도 중복 방지, 이동 및 취소',()=>{
 const s=fresh();const cmd={type:'stockBoth',requestId:'edit',payload:{code:'M1',name:'용기',spec:'100ml',kimpo:25,error:0,note:'김포 보관'}};
 apply(s,cmd,'tester');apply(s,cmd,'tester');
 assert.equal(balances(s,'M1')['김포창고'],25);assert.equal(balances(s,'M1')['오류창고'],0);assert.equal(balances(s,'M1').confirmed,true);
 assert.equal(latestNote(s,'M1','김포창고'),'김포 보관');assert.equal(latestNote(s,'M1','오류창고'),'김포 보관');
 apply(s,{...cmd,requestId:'edit2',payload:{...cmd.payload,kimpo:30,error:10,note:'수량 확인'}},'tester');
 assert.equal(balances(s,'M1').total,40);
 apply(s,{type:'transfer',requestId:'move',payload:{code:'M1',date:'2026-10-15',from:'김포창고',to:'오류창고',qty:5}},'tester');
 assert.equal(balances(s,'M1')['김포창고'],25);assert.equal(balances(s,'M1')['오류창고'],15);
 apply(s,{type:'cancel',requestId:'cancel',payload:{id:'move',reason:'취소'}},'tester');assert.equal(balances(s,'M1')['김포창고'],30);
});
test('미입력 창고 수량이나 사유 없이 통합 수정하지 않음',()=>{
 for(const p of [{kimpo:'',error:0,note:'확인'},{kimpo:10,error:0,note:''}]){
 const s=fresh();assert.throws(()=>apply(s,{type:'stockBoth',requestId:'bad',payload:{code:'M1',name:'용기',...p}},'tester'));assert.equal(s.materials.length,0);
 }
});
