export const normalize=v=>String(v??'').replace(/[\s_\-()\[\]·.\/]/g,'').toLowerCase();
export function warehouseName(v){const n=normalize(v).replace(/^제2/,'').replace(/^2/,'');if(['김포','김포창고','gimpo','kimpo'].includes(n))return '김포창고';if(['오류','오류창고','오류동','오류동창고','oryu'].includes(n))return '오류창고';return '';}
const labels={code:['품목코드','자재코드','부자재코드','코드','code','itemcode','materialcode'],name:['품목명','부자재명','품명','자재명','부자재제품명','itemname','materialname'],warehouse:['창고구분','창고명','창고','warehouse'],qty:['재고수량','현재고수량','현재고','현재고','재고량','수량','재고','quantity','qty','stock'],note:['비고','메모','note','memo'],spec:['규격','spec'],unit:['단위','unit']};
export function parseInventorySheets(sheets){const rows=[],issues=[];for(const sheet of sheets){let header=-1,cols;
 for(let i=0;i<Math.min(sheet.rows.length,60);i++){
  const cells=sheet.rows[i].map(normalize),found={};for(const [key,names] of Object.entries(labels)){let at=-1;for(const label of names){at=cells.indexOf(label);if(at>=0)break;}if(at>=0)found[key]=at;}
  const wide=['김포창고','오류창고'].map(w=>({warehouse:w,col:cells.findIndex(c=>warehouseName(c)===w)})).filter(x=>x.col>=0);
  if(found.code!==undefined&&found.name!==undefined&&((found.warehouse!==undefined&&found.qty!==undefined)||wide.length)){header=i;cols={...found,wide};break;}
 }
 if(header<0){issues.push(sheet.name+': 품목명·품목코드·창고·재고수량 제목을 찾지 못했습니다.');continue;}
 for(let i=header+1;i<sheet.rows.length;i++){
  const raw=sheet.rows[i];if(!raw?.some(v=>String(v??'').trim()))continue;
  const code=String(raw[cols.code]??'').trim(),name=String(raw[cols.name]??'').trim();if(normalize(code)==='품목코드'||normalize(code)==='code')continue;
  if(!code&&!name)continue;
  const targets=cols.warehouse!==undefined?[{warehouse:String(raw[cols.warehouse]??'').trim(),col:cols.qty}]:cols.wide;
  for(const target of targets){const value=raw[target.col];if(cols.warehouse===undefined&&(value===''||value==null))continue;rows.push({source:sheet.name+' '+(i+1)+'행',code,name,warehouse:warehouseName(target.warehouse)||target.warehouse,qty:value==null?'':String(value).replaceAll(',','').trim(),note:cols.note===undefined?'':String(raw[cols.note]??''),spec:cols.spec===undefined?'':String(raw[cols.spec]??''),unit:cols.unit===undefined?'개':String(raw[cols.unit]||'개'),selected:true});}
 }
 }
 if(rows.length>5000)throw Error('한 번에 5,000개 창고별 재고 행까지 처리할 수 있습니다. 파일을 나누어주세요.');return {rows,issues};}
export function validateInventoryRows(rows,materials){const seen=new Set(),names=new Map();return rows.map(row=>{const errors=[],code=String(row.code||'').trim(),name=String(row.name||'').trim(),warehouse=warehouseName(row.warehouse),qty=String(row.qty??'').replaceAll(',','').trim(),existing=materials.find(m=>m.code===code);if(!row.selected)return {...row,error:'제외',isNew:!existing};
 if(!code||!name)errors.push('품목코드·품목명 필수');if(!warehouse)errors.push('김포/오류 창고 확인');if(qty===''||!Number.isFinite(Number(qty))||Number(qty)<0)errors.push('0 이상 재고수량 필요');
 if(existing?.deleted)errors.push('삭제된 품목코드');if(existing&&normalize(existing.name)!==normalize(name))errors.push('기존 품목명: '+existing.name);
 if(names.has(code)&&normalize(names.get(code))!==normalize(name))errors.push('같은 코드의 품목명이 다름');names.set(code,name);
 const key=code+'|'+warehouse;if(seen.has(key))errors.push('품목·창고 중복');seen.add(key);
 return {...row,code,name,warehouse:warehouse||row.warehouse,qty,error:errors.join(' / '),isNew:!existing};});}
