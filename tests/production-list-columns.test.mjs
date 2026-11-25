import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),lookup=await readFile(new URL('../components/production-plan-lookup.tsx',import.meta.url),'utf8');
const lookupHeader=page.match(/production-lookup-head"[^>]*>(.*?)<\/div>/s)?.[1]??'';
test('생산계획 조회는 제품명·계획수량·계획월·제조일·BOM·수정삭제로 구성',()=>{for(const label of ['제품명','계획수량','계획월','제조일','수정·삭제'])assert.match(lookupHeader,new RegExp(label));assert.match(page,/ProductionPlanLookup/);for(const label of ['부자재','필요수량','통합 현재고','발주일','입고일'])assert.match(lookup,new RegExp(label));for(const old of ['총 자재 차감량','재고 반영'])assert.doesNotMatch(lookupHeader+lookup,new RegExp(old));});
test('조회는 exact 코드 기반 파생 BOM 도우미와 양방향 삭제 액션 사용',()=>{assert.match(lookup,/productionMaterialRows/);assert.match(lookup,/productionPlanDelete/);assert.match(lookup,/confirm\(/);});
test('취소·비활성 생산계획은 상태를 표시하고 수정·삭제를 비활성화',()=>{assert.match(lookup,/canEditProductionPlan/);assert.match(lookup,/status=.*취소/);assert.match(lookup,/disabled=\{!editable\}/);});
