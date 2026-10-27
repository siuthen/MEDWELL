import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {transpileModule,ModuleKind} from 'typescript';
import {DOMParser} from '@xmldom/xmldom';
import {zipSync,strToU8} from 'fflate';
import {parsePlanSheets,validatePlans} from '../lib/production-plan.mjs';
import {parsePlanUploadSheets,selectPlanUploadProduct,updatePlanUploadSearch} from '../lib/production-plan-import.mjs';
const dest=new URL('../work/plan-file-reader.mjs',import.meta.url);await mkdir(new URL('../work/',import.meta.url),{recursive:true});await writeFile(dest,transpileModule(await readFile(new URL('../lib/read-inventory-file.ts',import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.ESNext,target:99}}).outputText);const {readInventoryFile}=await import(dest.href);await unlink(dest);globalThis.DOMParser=DOMParser;
const state={products:[{code:'P1',name:'테스트',approved:true,version:'V1',bom:[{code:'M1',qty:2}]}],materials:[{code:'M1'}]};
test('UTF-8 CSV 실제 파일: BOM, 혼합 대소문자, 열 순서, 쉼표와 줄바꿈 메모',async()=>{const file=new File(['\ufeff비고,수량,cOdE,일자,창고\r\n"메모,상세\n두 줄",3, p1 ,2026-10-15,오류창고'], '계획.CSV');const parsed=parsePlanSheets(await readInventoryFile(file));const [r]=validatePlans(parsed.rows,state);assert.equal(r.product,'P1');assert.equal(r.qty,3);assert.equal(r.warehouse,'오류창고');assert.equal(r.note,'메모,상세\n두 줄');assert.equal(r.error,'');});
test('실제 XLSX 파일: 열 재배치, 별칭, 숫자 날짜, 공란 기본 창고',async()=>{const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';const cell=(ref,text)=>`<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;const archive=zipSync({'xl/workbook.xml':strToU8(`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="생산" sheetId="1" r:id="rId1"/></sheets></workbook>`),'xl/_rels/workbook.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/worksheets/sheet1.xml':strToU8(`<worksheet xmlns="${ns}"><sheetData><row r="1">${cell('A1','생산수량')}${cell('B1','완제품코드')}${cell('C1','계획일')}</row><row r="2"><c r="A2"><v>4</v></c>${cell('B2',' p1 ')}<c r="C2"><v>46310</v></c></row></sheetData></worksheet>`)});const parsed=parsePlanSheets(await readInventoryFile(new File([archive],'생산.xlsx')));const [r]=validatePlans(parsed.rows,state,'김포창고');assert.equal(r.product,'P1');assert.equal(r.qty,4);assert.equal(r.date,'2026-10-15');assert.equal(r.warehouse,'김포창고');assert.equal(r.source,'생산 2행');assert.equal(r.error,'');});
test('파일 크기·형식 제한과 깨진 CSV 차단',async()=>{await assert.rejects(readInventoryFile(new File([new Uint8Array(15*1024*1024+1)],'큰파일.csv')),/15MB/);await assert.rejects(readInventoryFile(new File(['x'],'계획.xls')),/xlsx/);await assert.rejects(readInventoryFile(new File(['"닫히지 않음'],'계획.csv')),/따옴표/);});

test('병합형 XLSX 실파일 최소 fixture: 표시 시트 31행, 숨김 과거 시트 제외',async()=>{
 const {minimalPlanReport}=await import('./fixtures/production-report.mjs');
 const report=minimalPlanReport(),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const column=i=>{let out='';for(i++;i;i=Math.floor((i-1)/26))out=String.fromCharCode(65+(i-1)%26)+out;return out;};
 const xml=`<worksheet xmlns="${ns}"><sheetData>${report.rows.map((row,i)=>`<row r="${i+1}">${row.map((v,c)=>`<c r="${column(c)}${i+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData><mergeCells count="2"><mergeCell ref="C8:C13"/><mergeCell ref="J6:K6"/></mergeCells></worksheet>`;
 const workbook=`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="과거" sheetId="1" state="hidden" r:id="rId1"/><sheet name="26.10-11월계획" sheetId="2" r:id="rId2"/></sheets></workbook>`;
 const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>';
 const archive=zipSync({'xl/workbook.xml':strToU8(workbook),'xl/_rels/workbook.xml.rels':strToU8(rels),'xl/worksheets/sheet1.xml':strToU8(xml),'xl/worksheets/sheet2.xml':strToU8(xml)});
 const sheets=await readInventoryFile(new File([archive],'minimal-report.xlsx'));
 assert.equal(sheets.length,1);assert.equal(sheets[0].format,'xlsx');assert.equal(sheets[0].name,'26.10-11월계획');
 const result=parsePlanUploadSheets(sheets,[]);assert.equal(result.rows.length,31);assert.equal(result.rows.find(r=>r.rowNumber===36).qty,1500);assert.equal(result.rows.find(r=>r.rowNumber===41).qty,2000);assert.equal(result.rows.find(r=>r.rowNumber===120).qty,500);
});

const actualFixture=process.env.MEDWELL_REPORT_FIXTURE_PATH;
test('실제 130×27 XLSX의 모든 유효 행 월·수량은 미매칭·검색·직접선택 후 동일', {skip:!actualFixture},async()=>{
 const file=new File([await readFile(actualFixture)],'actual-plan.xlsx'),sheets=await readInventoryFile(file);
 assert.equal(sheets.length,1);assert.equal(sheets[0].rows.length,130);assert.equal(Math.max(...sheets[0].rows.map(r=>r.length)),27);
 const rows=parsePlanUploadSheets(sheets,[{code:'P',name:'디 부스터(소비자)'}]).rows;
 const signature=value=>value.map(r=>({row:r.rowNumber,month:r.date.slice(0,7),qty:r.qty,quantityRaw:r.quantityRaw}));
 const before=signature(rows);assert.equal(rows.length,31);assert.deepEqual(Object.fromEntries(['2026-10','2026-11'].map(month=>[month,rows.filter(r=>r.date.startsWith(month)).length])),{'2026-10':22,'2026-11':9});assert.equal(rows.reduce((n,r)=>n+Number(r.qty),0),310600);assert.ok(rows.every(r=>r.product===''&&r.matchReason==='none'));
 const searched=rows.map(r=>updatePlanUploadSearch(r,r.originalName));assert.deepEqual(signature(searched),before);assert.ok(searched.every(r=>r.product===''));
 const selected=searched.map(r=>selectPlanUploadProduct(r,{code:'P',name:'정식 제품'}));assert.deepEqual(signature(selected),before);assert.ok(selected.every(r=>r.product==='P'));
});
