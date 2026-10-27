import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('업로드 직접 선택은 공용 ARIA combobox를 사용하고 긴 select를 제거',()=>{
 const upload=readFileSync(new URL('../components/production-plan-upload.tsx',import.meta.url),'utf8');
 const combo=readFileSync(new URL('../components/product-combobox.tsx',import.meta.url),'utf8');
 assert.match(upload,/import ProductCombobox/);
 assert.match(upload,/<ProductCombobox[^>]*label=\{r\.source\+' 매칭 제품'\}/);
 assert.doesNotMatch(upload,/<select className="plan-product-select"/);
 assert.match(upload,/원본 품명\(참고\)/);
 assert.doesNotMatch(upload,/onChange=\{e=>update\(i,\{originalName/);
 for(const token of ['role="combobox"','aria-autocomplete="list"','aria-controls={id}','aria-activedescendant=','role="listbox"','role="option"'])assert.match(combo,new RegExp(token.replace(/[{}]/g,'\\$&')));
 for(const key of ['ArrowDown','ArrowUp','Enter','Escape'])assert.match(combo,new RegExp("e\\.key==='"+key+"'"));
 assert.match(combo,/productCandidates\(products,value\)/);
 assert.match(combo,/\{p\.code\} · \{p\.name\}/);
});

test('검색·후보 선택은 기존 행을 기반으로 갱신해 계획수량 필드를 보존',()=>{
 const upload=readFileSync(new URL('../components/production-plan-upload.tsx',import.meta.url),'utf8');
 assert.match(upload,/function updateProduct\(index:number,change:\(row:any\)=>any\)/);
 assert.match(upload,/i===index\?change\(r\):r/);
 assert.match(upload,/updateProduct\(i,row=>updatePlanUploadSearch\(row,search\)\)/);
 assert.match(upload,/updateProduct\(i,row=>selectPlanUploadProduct\(row,p\)\)/);
 assert.match(upload,/value=\{rows\[i\]\.qty\}/);
});
