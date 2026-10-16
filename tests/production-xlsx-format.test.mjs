import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {buildProductionXlsx} from '../lib/production-xlsx.mjs';
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer;
function python(source,input=''){const r=spawnSync('python',['-c',source],{input:input+'\n',encoding:'utf8',maxBuffer:8*1024*1024,timeout:20000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);}
test('openpyxl 재열기: 날짜 서식 J/Q/R은 숫자 유지, 시각 서식 보존 및 BOM 수량 열 숫자 형식',()=>{
 const fixture=python(`import openpyxl,io,json,base64,datetime
from openpyxl.styles import Font,PatternFill,Border,Side,Alignment,Protection
w=openpyxl.Workbook();s=w.active;s.title='26.10-11월계획'
for row,qty,fmt in [(33,800,'yyyy-mm-dd'),(36,1500,'mm-dd-yy'),(87,5000,'d-mmm-yy')]:
 for col in ['J','Q','R']:
  c=s[f'{col}{row}'];c.value=qty;c.number_format=fmt;c.font=Font(name='Calibri',size=12,bold=True,color='FF123456');c.fill=PatternFill('solid',fgColor='FFABCDEF');c.border=Border(left=Side(style='thin',color='FF112233'),bottom=Side(style='double'));c.alignment=Alignment(horizontal='right',vertical='center',wrap_text=True);c.protection=Protection(locked=False)
s['U33']=datetime.datetime(2026,10,1);s['U33'].number_format='yyyy-mm-dd'
s['Z1']=1.25;s['Z1'].number_format='#,##0.###'
b=io.BytesIO();w.save(b);raw=b.getvalue();loaded=openpyxl.load_workbook(io.BytesIO(raw));assert all(isinstance(loaded.active[f'R{r}'].value,datetime.datetime) for r in [33,36,87])
print(json.dumps({'xlsx':base64.b64encode(raw).decode()}))`);
 const original=new Uint8Array(Buffer.from(fixture.xlsx,'base64')),before=original.slice();
 const plans=[33,36,87].map((row,i)=>({format:'report',sheetName:'26.10-11월계획',rowNumber:row,sequence:(i+1)+'-10월',date:'2026-10-01',product:'P',name:'제품50ml',qty:[800,1500,5000][i],warehouse:'김포창고',error:'',lines:[{code:'M',qty:[800,1500,5000][i]}]}));
 const state={products:[{code:'P',name:'제품50ml'}],materials:[{code:'M',name:'자재'}]},snapshot=structuredClone(state);
 const output=buildProductionXlsx({original,plans,state,balance:()=>({'김포창고':0}),periodKey:'2026-10~2026-11'});
 assert.deepEqual(original,before);assert.deepEqual(state,snapshot);
 const verified=python(`import openpyxl,io,json,base64,datetime,copy
from openpyxl.styles.numbers import is_date_format
v=json.loads(__import__('sys').stdin.readline());source=openpyxl.load_workbook(io.BytesIO(base64.b64decode(v['original'])));w=openpyxl.load_workbook(io.BytesIO(base64.b64decode(v['output'])));s=w['26.10-11월계획'];old=source[s.title];checked=[]
for row,qty in [(33,800),(36,1500),(87,5000)]:
 for col,expected in [('J',qty),('Q',0),('R',qty)]:
  ref=f'{col}{row}';c=s[ref];a=old[ref];assert isinstance(c.value,(int,float)) and not isinstance(c.value,bool),(ref,type(c.value));assert c.value==expected,(ref,c.value);assert c.data_type=='n';assert c.number_format=='#,##0.###';assert not is_date_format(c.number_format);assert not c.is_date
  for attr in ['font','fill','border','alignment','protection']:assert copy.copy(getattr(c,attr))==copy.copy(getattr(a,attr)),(ref,attr)
  checked.append(ref)
assert isinstance(s['U33'].value,datetime.datetime);assert s['U33'].number_format==old['U33'].number_format
d=w['BOM자동계산'];n=0
for row in range(2,d.max_row+1):
 for col in ['E','I','J','K','L','M']:
  c=d[f'{col}{row}'];assert isinstance(c.value,(int,float)),(c.coordinate,type(c.value));assert c.data_type=='n';assert c.number_format=='#,##0.###';assert not c.is_date;assert not is_date_format(c.number_format);n+=1
print(json.dumps({'checked':checked,'detailNumbers':n}))`,JSON.stringify({original:fixture.xlsx,output:Buffer.from(output).toString('base64')}));
 assert.equal(verified.checked.length,9);assert.equal(verified.detailNumbers,18);
});
