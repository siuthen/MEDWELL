import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {DOMParser,XMLSerializer} from '@xmldom/xmldom';import layout from '../data/production-report-layout.json' with {type:'json'};import {zipSync} from 'fflate';import {buildProductionXlsx,loadCanonicalTemplate} from '../lib/production-xlsx.mjs';import {downloadState} from './fixtures/download-plans.mjs';
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer;
test('canonical 날짜 서식 J/Q/R fixture: J/Q number·숫자 서식, R 공란, 시각 서식 보존 및 상세 수량 숫자',()=>{const fixture=structuredClone(layout),doc=new DOMParser().parseFromString(fixture.entries[fixture.mainPath],'application/xml'),styles=new DOMParser().parseFromString(fixture.entries['xl/styles.xml'],'application/xml'),ns=styles.documentElement.namespaceURI,xfs=styles.getElementsByTagNameNS('*','cellXfs')[0],base=Array.from(xfs.childNodes).find(n=>n.nodeType===1).cloneNode(true);base.setAttribute('numFmtId','14');const index=Array.from(xfs.childNodes).filter(n=>n.nodeType===1).length;xfs.appendChild(base);xfs.setAttribute('count',String(index+1));for(const c of Array.from(doc.getElementsByTagNameNS('*','c')))if(/^(J|Q|R)(8|9|10|11|12|13)$/.test(c.getAttribute('r')))c.setAttribute('s',String(index));fixture.entries[fixture.mainPath]=new XMLSerializer().serializeToString(doc);fixture.entries['xl/styles.xml']=new XMLSerializer().serializeToString(styles);const before=JSON.stringify(fixture),s=downloadState(),output=buildProductionXlsx({plans:[{product:'HKE-NX91',qty:10,date:'2026-10-01'}],state:s,balance:()=>({'김포창고':30,'오류창고':20}),template:fixture});assert.equal(JSON.stringify(fixture),before);const r=spawnSync('python',['-c',`import io,json,base64,openpyxl
from openpyxl.styles.numbers import is_date_format
v=json.loads(__import__('sys').stdin.readline());w=openpyxl.load_workbook(io.BytesIO(base64.b64decode(v['output'])));s=w['26.10-11월계획'];original=openpyxl.load_workbook(io.BytesIO(base64.b64decode(v['original'])))['26.10-11월계획']
for ref in ['J8',*[f'Q{r}' for r in range(8,14)]]:
 c=s[ref];assert isinstance(c.value,(int,float)) and c.data_type=='n';assert c.number_format=='#,##0.###' and not is_date_format(c.number_format);assert not c.is_date
for r in range(8,131):assert s[f'R{r}'].value is None
d=w['BOM자동계산']
for r in range(2,d.max_row+1):
 for col in ['E','I','J','K','L','M']:
  c=d[f'{col}{r}'];assert isinstance(c.value,(int,float));assert c.data_type=='n';assert c.number_format=='#,##0.###';assert not is_date_format(c.number_format)
import copy
assert is_date_format(original['J8'].number_format)
for ref in ['J8','Q8']:
 for attr in ['font','fill','border','alignment','protection']:assert copy.copy(getattr(s[ref],attr))==copy.copy(getattr(original[ref],attr)),(ref,attr)
print('verified')`],{input:JSON.stringify({output:Buffer.from(output).toString('base64'),original:Buffer.from(zipSync(loadCanonicalTemplate(fixture))).toString('base64')})+'\n',encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr||r.error?.message);});
