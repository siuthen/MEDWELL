import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const source=await read('components/material-allocations.tsx'),css=await read('app/globals.css');
const file=new URL('../work/material-layout.mjs',import.meta.url);
await mkdir(new URL('../work/',import.meta.url),{recursive:true});
await writeFile(file,transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX,target:99}}).outputText);
const Material=(await import(file.href)).default;await unlink(file);
test('160개 자재 모두 전용 section/표에 렌더, upload-preview 분리·입력 불변',()=>{
 const rows=Array.from({length:160},(_,i)=>({code:'FIXTURE-'+i,name:'자재 '+i,required:80,currentKimpo:30,currentError:20,afterKimpo:-10,afterError:-20})),before=JSON.stringify(rows),tree=Material({rows});
 assert.equal(tree.type,'section');assert.equal(tree.props.className,'material-allocations');
 const [heading,wrapper]=tree.props.children;assert.equal(heading.type,'h3');assert.equal(wrapper.props.className,'tablewrap material-allocation-table');assert.equal(wrapper.props.children.props.children[1].props.children.length,160);assert.equal(JSON.stringify(rows),before);assert.doesNotMatch(source,/upload-preview/);
});
test('전용 표 높이 제한 제거·정상 문서 흐름·가로스크롤·월별/합산 14px 정렬',()=>{
 const rule=selector=>{const start=css.indexOf(selector+'{');assert.ok(start>=0,selector);return css.slice(start,css.indexOf('}',start)+1)};
 const table=rule('.material-allocation-table');for(const v of ['max-height:none!important','height:auto!important','overflow-x:auto!important','overflow-y:visible!important'])assert.ok(table.includes(v));
 assert.match(css,/\.material-allocation-table table,\.material-allocation-table tbody,\.material-allocation-table tr,\.material-allocation-table td\{height:auto!important;position:static!important\}/);
 assert.ok(rule('.combined-plan-section').includes('padding-left:14px;padding-right:14px'));assert.ok(rule('.two-month-panel>.cardhead').includes('padding-left:0;padding-right:0'));assert.ok(rule('.two-month-panel').includes('padding:14px;margin-bottom:24px'));
 assert.ok(rule('.two-month-panel>.tablewrap').includes('overflow-x:auto;overflow-y:visible'));assert.doesNotMatch(css,/\.two-month-panel \.tablewrap\{/);assert.match(css,/\.upload-preview\{max-height:52vh;overflow:auto\}/);
});
test('합산 제목·표·다운로드·오류는 combined section, modalfoot은 밖에 위치',async()=>{
 const direct=await read('components/direct-production-plans.tsx'),start=direct.indexOf('<section className="combined-plan-section">'),end=direct.indexOf('</section><div className="modalfoot">',start);assert.ok(start>=0&&end>start);const combined=direct.slice(start,end);for(const text of ['전체 계획월 합산 누적 통합재고','<MaterialAllocations rows={combined.allocations}/>','계획보고서 XLSX 내려받기','{error&&'])assert.ok(combined.includes(text));
});

test('입력표 fixed 열 너비·긴 BOM/확인사항 줄바꿈·빨간 경고 CSS',()=>{assert.match(css,/\.direct-plan-entry-table table\{table-layout:fixed;width:100%;min-width:860px\}/);for(const [col,width] of [[1,22],[2,9],[3,16],[4,6],[5,23],[6,17],[7,7]])assert.ok(css.includes('.direct-plan-entry-table th:nth-child('+col+'){width:'+width+'%'));for(const selector of ['.plan-bom-cell','.plan-status-cell']){const start=css.indexOf(selector+'{'),rule=css.slice(start,css.indexOf('}',start));assert.ok(rule.includes('white-space:normal!important'));assert.ok(rule.includes('overflow-wrap:anywhere'));assert.ok(rule.includes('line-height:1.6'));}assert.match(css,/\.plan-bom-cell br\{display:block!important\}/);assert.match(css,/\.plan-bom-missing,\.plan-status-warning\{background:#fff0f0;color:#a52727;border-left:3px solid #d44747;font-weight:700\}/);assert.match(css,/\.direct-plan-entry-table \.product-combobox\{min-width:0;width:100%\}/);});
