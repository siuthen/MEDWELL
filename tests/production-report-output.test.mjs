import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {transpileModule,ModuleKind} from 'typescript';import {DOMParser,XMLSerializer} from '@xmldom/xmldom';import {buildProductionXlsx} from '../lib/production-xlsx.mjs';import {parsePlanUploadSheets} from '../lib/production-plan-import.mjs';
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer;
const python=(source,v)=>{const r=spawnSync('python',['-c',source],{input:JSON.stringify(v)+'\n',encoding:'utf8',maxBuffer:8e6,timeout:30000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);};
const state={products:[],materials:[{code:'M1',name:'첫 자재'},{code:'M2',name:'두번째 자재'}]},balance=()=>({'김포창고':30,'오류창고':20});
const plans=[{product:'P2',name:'두번째 제품100ml',capacity:'100ml',date:'2026-10-01',qty:1500,lines:[{code:'M1',name:'첫 자재',qty:3000,unitQty:2,warehouseAllocations:[{warehouse:'김포창고',qty:2980},{warehouse:'오류창고',qty:20}]},{code:'M2',name:'두번째 자재',qty:1500,unitQty:1,warehouseAllocations:[{warehouse:'김포창고',qty:1500}]}]},{product:'',manual:true,name:'수기 제품',capacity:'5ml',date:'2026-11-01',qty:500,lines:[{code:'M2',name:'두번째 자재',qty:500,unitQty:1,warehouseAllocations:[{warehouse:'김포창고',qty:500}]}]}];
const verify=`import io,base64,json,openpyxl,copy,zipfile
from openpyxl.styles.numbers import is_date_format
v=json.loads(__import__('sys').stdin.readline());w=openpyxl.load_workbook(io.BytesIO(base64.b64decode(v['output'])));s=w['26.10-11월계획']
assert w.active.title=='26.10-11월계획';assert s.max_row>=130 and s.max_column==27
assert w.sheetnames[:2]==['23년07월계획보고서','26.10-11월계획'];assert w.worksheets[0].sheet_state=='hidden';assert 'BOM자동계산' in w.sheetnames
assert s.sheet_view.topLeftCell=='A1';assert all(v.activeCell=='A1' and v.sqref=='A1' for v in s.sheet_view.selection);assert s.sheet_view.pane.xSplit==4 and s.sheet_view.pane.ySplit==7 and s.sheet_view.pane.state=='frozen';assert s.sheet_view.pane.topLeftCell=='A1'
assert s['A8'].value=='10월' and s['A10'].value=='11월';assert s['C8'].value=='두번째 제품100ml' and s['C10'].value=='수기 제품';assert s['D8'].value=='100ml' and s['D10'].value=='5ml';assert s['J8'].value==1500 and s['J10'].value==500
assert s['P8'].value=='첫 자재' and s['P9'].value=='두번째 자재' and s['P10'].value=='두번째 자재'
for row in range(8,s.max_row+1):
 for col in [2,5,6,7,8,9,11,12,13,14,15,*range(18,27)]:assert s.cell(row,col).value is None,(row,col,s.cell(row,col).value)
for ref in ['J8','J10','Q8','Q9','Q10']:
 c=s[ref];assert isinstance(c.value,(int,float)) and c.data_type=='n';assert c.number_format=='#,##0.###' and not is_date_format(c.number_format)
for ref in ['Q8','Q9','Q10']:
 assert s[ref].value==50;note=s[ref].comment.text;assert all(t in note for t in ['김포 재고: 30','오류 재고: 20','단위소요량','계획 총필요량','자동 배정'])
assert {'A8:A9','B8:B9','C8:C9','D8:D9','J8:J9'}<=set(str(m) for m in s.merged_cells.ranges)
d=w['BOM자동계산'];assert d.max_row-1==sum(1 for r in range(8,s.max_row+1) if s[f'P{r}'].value is not None);assert d.cell(d.max_row,3).value in (None,'');assert d.freeze_panes=='A2' and d.auto_filter.ref
if v.get('original'):
 raw=base64.b64decode(v['original']);old=openpyxl.load_workbook(io.BytesIO(raw));o=old[s.title];assert w.worksheets[0].max_row==old.worksheets[0].max_row;assert set(str(m) for m in w.worksheets[0].merged_cells.ranges)==set(str(m) for m in old.worksheets[0].merged_cells.ranges)
 assert str(s.page_setup)==str(o.page_setup);assert str(s.page_margins)==str(o.page_margins);assert s.print_title_rows==o.print_title_rows
 assert all(s.row_dimensions[i].height==o.row_dimensions[i].height for i in range(1,131));assert {str(m) for m in s.merged_cells.ranges if m.min_row<8}=={str(m) for m in o.merged_cells.ranges if m.min_row<8}
 for key,dim in o.column_dimensions.items():assert s.column_dimensions[key].width==dim.width
 for row in range(1,8):
  for col in range(1,27):assert s.cell(row,col).value==o.cell(row,col).value,(row,col)
 for ref in ['C8','D8','J8','P8','Q8']:
  for attr in ['font','fill','alignment','protection']:assert copy.copy(getattr(s[ref],attr))==copy.copy(getattr(o[ref],attr)),(ref,attr)
print(json.dumps({'rows':s.max_row,'merges':len(s.merged_cells.ranges),'sheets':len(w.sheetnames)}))`;
test('공통 보고서 생성기: 직접/저장 배치, 제품순서·수기 코드 공란·월·블록 병합·공란 규칙·숫자·메모',()=>{const before=JSON.stringify({plans,state});const bytes=buildProductionXlsx({plans,state,balance,periodKey:'2026-10~2026-11',standard:true,snapshot:true});assert.equal(JSON.stringify({plans,state}),before);const result=python(verify,{output:Buffer.from(bytes).toString('base64')});assert.equal(result.rows,130);assert.equal(result.sheets,3);});
const fixture=process.env.MEDWELL_REPORT_FIXTURE_PATH;
test('실제 첨부 XLSX 외부 fixture: 31행 파싱 및 재열기·숨김/양식 보존·원본 무변경', {skip:!fixture},async()=>{const raw=new Uint8Array(await readFile(fixture)),before=raw.slice();const dest=new URL('../work/report-reader.mjs',import.meta.url);await mkdir(new URL('../work/',import.meta.url),{recursive:true});await writeFile(dest,transpileModule(await readFile(new URL('../lib/read-inventory-file.ts',import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.ESNext,target:99}}).outputText);const {readInventoryFile}=await import(dest.href);await unlink(dest);const sheets=await readInventoryFile(new File([raw],'external-report.xlsx'));assert.equal(sheets.length,1);const parsed=parsePlanUploadSheets(sheets,[]);assert.equal(parsed.rows.length,31);assert.equal(parsed.rows.find(r=>r.rowNumber===36).qty,1500);assert.equal(parsed.rows.find(r=>r.rowNumber===41).qty,2000);assert.equal(parsed.rows.find(r=>r.rowNumber===120).qty,500);assert.ok(parsed.rows.every(r=>['2026-10-01','2026-11-01'].includes(r.date)));const bytes=buildProductionXlsx({original:raw,plans,state,balance,snapshot:true,periodKey:'2026-10~2026-11'});assert.deepEqual(raw,before);assert.deepEqual(new Uint8Array(await readFile(fixture)),before);python(verify,{output:Buffer.from(bytes).toString('base64'),original:Buffer.from(raw).toString('base64')});});
test('BOM 행이 원본 공간을 초과해도 행 스타일 복제 및 다음 제품 영역 안전',()=>{const large=[{...plans[0],lines:Array.from({length:160},(_,i)=>({...plans[0].lines[0],code:'L'+i,name:'추가자재'+i}))},plans[1]],bytes=buildProductionXlsx({plans:large,state,balance,standard:true,snapshot:true});const result=python(`import io,base64,json,openpyxl
v=json.loads(__import__('sys').stdin.readline());w=openpyxl.load_workbook(io.BytesIO(base64.b64decode(v['output'])));s=w['26.10-11월계획'];assert s['C8'].value=='두번째 제품100ml';assert s['C168'].value=='수기 제품';assert s['P167'].value=='추가자재159';assert s['P168'].value=='두번째 자재';assert 'C8:C167' in set(str(m) for m in s.merged_cells.ranges);assert s.row_dimensions[9].height is not None;print(json.dumps({'rows':s.max_row}))`,{output:Buffer.from(bytes).toString('base64')});assert.equal(result.rows,169);});
