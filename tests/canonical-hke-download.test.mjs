import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {DOMParser,XMLSerializer} from '@xmldom/xmldom';import {buildProductionXlsx} from '../lib/production-xlsx.mjs';import {downloadState} from './fixtures/download-plans.mjs';import {readFile} from 'node:fs/promises';
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer;
const verify=(bytes,state,original)=>{const r=spawnSync('python',['-c',`import io,base64,json,openpyxl,zipfile,xml.etree.ElementTree as E
from openpyxl.styles.numbers import is_date_format
v=json.loads(__import__('sys').stdin.readline());raw=base64.b64decode(v['output']);w=openpyxl.load_workbook(io.BytesIO(raw));s=w.active;assert s.title=='26.10-11월계획';assert s.max_row>=130 and s.max_column==27
assert s['C8'].value=='KI_넥소디피부스터2.5ml_세트';assert s['D8'].value=='2.5ml';assert s['J8'].value==10
for i,m in enumerate(v['materials'],8):
 assert s[f'P{i}'].value==m['name'];q=s[f'Q{i}'];assert q.value==100 and q.data_type=='n' and q.number_format=='#,##0.###';assert not q.is_date;assert m['code'] in q.comment.text
assert s['J8'].number_format=='#,##0.###' and s['J8'].data_type=='n'
merges=set(str(m) for m in s.merged_cells.ranges);assert {'A8:A13','B8:B13','C8:C13','D8:D13','J8:J13','B130:D130','P130:Z130','E130:O130'}<=merges
for row in range(8,131):
 for col in range(1,28):
  if 8<=row<=13 and col in [1,3,4,10,16,17]:continue
  assert s.cell(row,col).value is None,(row,col,s.cell(row,col).value)
d=w['BOM자동계산'];assert d.max_row==7;assert [d.cell(r,8).value for r in range(2,8)]==[m['name'] for m in v['materials']]
assert s.sheet_view.topLeftCell=='A1';assert all(a.activeCell=='A1' and a.sqref=='A1' for a in s.sheet_view.selection)
if v.get('original'):
 oldraw=base64.b64decode(v['original']);o=openpyxl.load_workbook(io.BytesIO(oldraw));t=o[s.title];assert w.sheetnames[:len(o.sheetnames)]==o.sheetnames
 assert [a.sheet_state for a in w.worksheets[:len(o.sheetnames)]]==[a.sheet_state for a in o.worksheets]
 assert all(s.row_dimensions[i].height==t.row_dimensions[i].height for i in range(1,131));assert all(s.column_dimensions[k].width==a.width for k,a in t.column_dimensions.items());assert str(s.page_setup)==str(t.page_setup);assert str(s.page_margins)==str(t.page_margins);assert str(s.print_options)==str(t.print_options);assert s.print_area==t.print_area and s.print_title_rows==t.print_title_rows
 assert {str(m) for m in s.merged_cells.ranges if m.min_row<8}=={str(m) for m in t.merged_cells.ranges if m.min_row<8}
 ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};a=E.fromstring(zipfile.ZipFile(io.BytesIO(oldraw)).read('xl/worksheets/sheet2.xml'));b=E.fromstring(zipfile.ZipFile(io.BytesIO(raw)).read('xl/worksheets/sheet2.xml'));styles={c.attrib['r']:c.attrib.get('s','0') for c in b.findall('m:sheetData/m:row/m:c',ns)}
 for c in a.findall('m:sheetData/m:row/m:c',ns):
  ref=c.attrib['r']
  if ref=='J8' or ref in [f'Q{i}' for i in range(8,14)]:continue
  assert styles[ref]==c.attrib.get('s','0'),ref
print(json.dumps({'rows':s.max_row,'columns':s.max_column,'merges':len(merges),'bomLines':d.max_row-1}))`],{input:JSON.stringify({output:Buffer.from(bytes).toString('base64'),materials:state.materials,original:original?Buffer.from(original).toString('base64'):null})+'\n',encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout)};
test('HKE-NX91 10개 canonical 재열기: 130×27, P8:P13 6 BOM, 숫자 Q·상세 6라인·공란·병합·A1',()=>{const s=downloadState(),before=JSON.stringify(s),bytes=buildProductionXlsx({plans:[{product:'HKE-NX91',qty:10,date:'2026-10-01'}],state:s,balance:()=>({'김포창고':60,'오류창고':40})});const checked=verify(bytes,s);assert.equal(checked.bomLines,6);assert.equal(JSON.stringify(s),before);});
test('HKE 실제 첨부 외부 fixture 대조: 130행 높이/스타일·시트·숨김·열너비·헤더·인쇄 보존', {skip:!process.env.MEDWELL_REPORT_FIXTURE_PATH},async()=>{const raw=new Uint8Array(await readFile(process.env.MEDWELL_REPORT_FIXTURE_PATH)),before=raw.slice(),s=downloadState();const bytes=buildProductionXlsx({original:raw,plans:[{product:'HKE-NX91',qty:10,date:'2026-10-01'}],state:s,balance:()=>({'김포창고':60,'오류창고':40})});verify(bytes,s,raw);assert.deepEqual(raw,before);assert.deepEqual(new Uint8Array(await readFile(process.env.MEDWELL_REPORT_FIXTURE_PATH)),before);});
