import reportLayout from '../data/production-report-layout.json' with {type:'json'};
import {resolvePlanDownload} from './plan-download.mjs';
import {lineAllocations} from './plan-stock.mjs';
// Browser-only file generation. No fetch, API calls, or state mutations.
import {zipSync,strFromU8,strToU8} from 'fflate';
import {productCapacity,planQuantity} from './production-plan.mjs';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const xml=text=>new DOMParser().parseFromString(text,'application/xml');
const nodes=(d,name)=>Array.from(d.getElementsByTagNameNS('*',name));
const serialize=d=>new XMLSerializer().serializeToString(d);
const column=i=>{let out='';for(i++;i;i=Math.floor((i-1)/26))out=String.fromCharCode(65+(i-1)%26)+out;return out;};
export const autoFileName=name=>String(name||'생산계획').replace(/\.xlsx$/i,'')+'_자동작성.xlsx';
function setCell(doc,ref,value,style){
 const match=ref.match(/^(\D+)(\d+)$/),number=Number(match[2]),data=nodes(doc,'sheetData')[0];let row=nodes(data,'row').find(r=>Number(r.getAttribute('r'))===number);
 if(!row){row=doc.createElementNS(NS,'row');row.setAttribute('r',String(number));data.insertBefore(row,nodes(data,'row').find(r=>Number(r.getAttribute('r'))>number)||null);}
 let cell=nodes(row,'c').find(c=>c.getAttribute('r')===ref);if(cell&&nodes(cell,'f').length)return false;
 if(!cell){cell=doc.createElementNS(NS,'c');cell.setAttribute('r',ref);const toIndex=letters=>Array.from(letters).reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);row.insertBefore(cell,nodes(row,'c').find(c=>toIndex(c.getAttribute('r').replace(/\d/g,''))>toIndex(match[1]))||null);}
 while(cell.firstChild)cell.removeChild(cell.firstChild);if(style!==undefined)cell.setAttribute('s',String(style));
 if(typeof value==='number'&&Number.isFinite(value)){cell.removeAttribute('t');const v=doc.createElementNS(NS,'v');v.textContent=String(value);cell.appendChild(v);}else{cell.setAttribute('t','inlineStr');const is=doc.createElementNS(NS,'is'),t=doc.createElementNS(NS,'t');t.setAttribute('xml:space','preserve');t.textContent=String(value??'');is.appendChild(t);cell.appendChild(is);}return true;
}
const sheetPath=(workbook,rels,name)=>{const sheet=nodes(workbook,'sheet').find(s=>s.getAttribute('name')===name);if(!sheet)return '';const id=sheet.getAttributeNS(REL,'id')||sheet.getAttribute('r:id'),target=nodes(rels,'Relationship').find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');return target?(target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'')):'';};
function baseArchive(){return {'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'),'_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+REL+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'),'xl/workbook.xml':strToU8('<workbook xmlns="'+NS+'" xmlns:r="'+REL+'"><sheets/></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')};}
function detailStyles(files,rels,types){
 const path='xl/styles.xml';if(!files[path])throw Error('Canonical 계획보고서 스타일을 불러오지 못했습니다. 다운로드를 중단합니다.');
 const doc=xml(strFromU8(files[path]));let formats=nodes(doc,'numFmts')[0];if(!formats){formats=doc.createElementNS(NS,'numFmts');doc.documentElement.insertBefore(formats,doc.documentElement.firstChild);}let numeric=nodes(formats,'numFmt').find(f=>f.getAttribute('formatCode')==='#,##0.###'&&Number(f.getAttribute('numFmtId'))>=164);if(!numeric){numeric=doc.createElementNS(NS,'numFmt');numeric.setAttribute('numFmtId',String(Math.max(163,...nodes(formats,'numFmt').map(f=>Number(f.getAttribute('numFmtId'))))+1));numeric.setAttribute('formatCode','#,##0.###');formats.appendChild(numeric);}formats.setAttribute('count',String(nodes(formats,'numFmt').length));const numberFormat=Number(numeric.getAttribute('numFmtId')),xfs=nodes(doc,'cellXfs')[0],fonts=nodes(doc,'fonts')[0],fontId=nodes(fonts,'font').length,font=doc.createElementNS(NS,'font');font.appendChild(doc.createElementNS(NS,'b'));fonts.appendChild(font);fonts.setAttribute('count',String(fontId+1));const start=nodes(xfs,'xf').length;
 for(const [fmt,fid] of [[numberFormat,0],[0,fontId]]){const xf=doc.createElementNS(NS,'xf');for(const [k,v] of Object.entries({numFmtId:fmt,fontId:fid,fillId:0,borderId:0,xfId:0,applyNumberFormat:1}))xf.setAttribute(k,String(v));xfs.appendChild(xf);}const copies=new Map();
 const forCell=(sheet,ref)=>{const cell=nodes(sheet,'c').find(c=>c.getAttribute('r')===ref),index=Number(cell?.getAttribute('s')||0),base=nodes(xfs,'xf')[index]||nodes(xfs,'xf')[0],key=base;if(copies.has(key))return copies.get(key);const copy=base.cloneNode(true),style=nodes(xfs,'xf').length;copy.setAttribute('numFmtId',String(numberFormat));copy.setAttribute('applyNumberFormat','1');xfs.appendChild(copy);copies.set(key,style);return style;};
 return {number:start,header:start+1,forCell,save(){xfs.setAttribute('count',String(nodes(xfs,'xf').length));files[path]=strToU8(serialize(doc));}};
}
const detailHeaders=['계획기간','제품코드','제품명','계획수량','자재코드','자재명','단위소요량','총필요량','통합 현재고','계획 후 통합재고','상태'];
function addSheet(files,wb,rels,types,title,values,styles){
 let name=title,n=2;while(nodes(wb,'sheet').some(s=>s.getAttribute('name')===name))name=title+'_'+n++;
 const ids=nodes(wb,'sheet').map(s=>Number(s.getAttribute('sheetId'))),sheetId=Math.max(0,...ids)+1;let index=sheetId;while(files[`xl/worksheets/sheet${index}.xml`])index++;
 let rid='rIdAuto'+sheetId;while(nodes(rels,'Relationship').some(r=>r.getAttribute('Id')===rid))rid+='x';
 const sheet=wb.createElementNS(NS,'sheet');sheet.setAttribute('name',name);sheet.setAttribute('sheetId',String(sheetId));sheet.setAttributeNS(REL,'r:id',rid);nodes(wb,'sheets')[0].appendChild(sheet);
 const rel=rels.createElementNS(rels.documentElement.namespaceURI,'Relationship');rel.setAttribute('Id',rid);rel.setAttribute('Type',REL+'/worksheet');rel.setAttribute('Target',`worksheets/sheet${index}.xml`);rels.documentElement.appendChild(rel);
 const override=types.createElementNS(types.documentElement.namespaceURI,'Override');override.setAttribute('PartName',`/xl/worksheets/sheet${index}.xml`);override.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');types.documentElement.appendChild(override);
 const end=column(values[0].length-1)+(values.length||1),body=values.map((row,i)=>`<row r="${i+1}">${row.map((value,j)=>{const ref=column(j)+(i+1),numeric=typeof value==='number'&&Number.isFinite(value);return numeric?`<c r="${ref}" s="${styles.number}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"${i===0?` s="${styles.header}"`:''}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;}).join('')}</row>`).join('');
 files[`xl/worksheets/sheet${index}.xml`]=strToU8(`<worksheet xmlns="${NS}"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${values[0].length}" width="22" customWidth="1"/></cols><sheetData>${body}</sheetData><autoFilter ref="A1:${end}"/></worksheet>`);
}
export function planExportRows(plans,state,balance,periodKey,restored=new Map()){
 const totals=new Map();for(const p of plans)for(const l of p.lines)totals.set(l.code,(totals.get(l.code)||0)+l.qty);
 return plans.flatMap(p=>p.lines.map(l=>{const b=balance(l.code),current=Number(b['김포창고']||0)+Number(b['오류창고']||0),restore=(restored.get(l.code+'|김포창고')||0)+(restored.get(l.code+'|오류창고')||0),qty=p.qty??planQuantity(p);const after=current+restore-(totals.get(l.code)||0);return [periodKey,p.manual?'':p.product,p.name,qty,l.code,l.name||state.materials.find(m=>m.code===l.code)?.name||l.code,l.unitQty??l.qty/qty,l.qty,current,after,after<0?'발주 필요':'충분'];}));
}
export function loadCanonicalTemplate(layout=reportLayout){
 if(!layout?.entries||!layout.mainPath)throw Error('Canonical 계획보고서 템플릿을 불러오지 못했습니다. 다운로드를 중단합니다.');
 const files=baseArchive();for(const [path,text] of Object.entries(layout.entries))files[path]=strToU8(text);
 for(const path of ['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','[Content_Types].xml',layout.mainPath])if(!layout.entries[path])throw Error('Canonical 계획보고서 구성요소가 없습니다: '+path);
 const wb=xml(strFromU8(files['xl/workbook.xml'])),rels=xml(strFromU8(files['xl/_rels/workbook.xml.rels'])),sheet=xml(strFromU8(files[layout.mainPath]));
 if(sheetPath(wb,rels,'26.10-11월계획')!==layout.mainPath||!nodes(sheet,'sheetData').length||!nodes(sheet,'row').some(r=>r.getAttribute('r')==='130')||!nodes(sheet,'c').some(c=>/^AA/.test(c.getAttribute('r')))||!nodes(xml(strFromU8(files['xl/styles.xml'])),'cellXfs').length)throw Error('Canonical 계획보고서 양식이 올바르지 않습니다. 다운로드를 중단합니다.');
 return files;
}
function dataRow(doc,prototype,at){const row=prototype?prototype.cloneNode(true):doc.createElementNS(NS,'row');row.setAttribute('r',String(at));for(const c of nodes(row,'c')){c.setAttribute('r',c.getAttribute('r').replace(/\d+$/,String(at)));c.removeAttribute('t');while(c.firstChild)c.removeChild(c.firstChild);}return row;}
function addComments(files,doc,types,path,items){
 if(!items.length)return;const stem=path.split('/').at(-1).replace('.xml',''),commentPath='xl/comments_'+stem+'_auto.xml',vmlPath='xl/drawings/'+stem+'_auto.vml',relsPath='xl/worksheets/_rels/'+stem+'.xml.rels',relationNS='http://schemas.openxmlformats.org/package/2006/relationships';
 let relations=files[relsPath]?xml(strFromU8(files[relsPath])):xml('<Relationships xmlns="'+relationNS+'"/>');for(const r of nodes(relations,'Relationship'))if(/\/(comments|vmlDrawing)$/.test(r.getAttribute('Type')))r.parentNode.removeChild(r);
 for(const [id,type,target] of [['rIdBomComments','comments','../comments_'+stem+'_auto.xml'],['rIdBomVml','vmlDrawing','../drawings/'+stem+'_auto.vml']]){const r=relations.createElementNS(relationNS,'Relationship');r.setAttribute('Id',id);r.setAttribute('Type',REL+'/'+type);r.setAttribute('Target',target);relations.documentElement.appendChild(r);}
 files[relsPath]=strToU8(serialize(relations));for(const old of nodes(doc,'legacyDrawing'))old.parentNode.removeChild(old);const legacy=doc.createElementNS(NS,'legacyDrawing');legacy.setAttributeNS(REL,'r:id','rIdBomVml');doc.documentElement.appendChild(legacy);
 files[commentPath]=strToU8('<comments xmlns="'+NS+'"><authors><author>메드웰 BOM</author></authors><commentList>'+items.map(c=>'<comment ref="'+c.ref+'" authorId="0"><text><t xml:space="preserve">'+esc(c.text)+'</t></text></comment>').join('')+'</commentList></comments>');
 files[vmlPath]=strToU8('<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>'+items.map((c,i)=>'<v:shape id="_x0000_s'+(1025+i)+'" type="#_x0000_t202" style="position:absolute;width:240pt;height:100pt;visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>'+(Number(c.ref.match(/\d+/)[0])-1)+'</x:Row><x:Column>16</x:Column></x:ClientData></v:shape>').join('')+'</xml>');
 for(const [part,content] of [['/'+commentPath,'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml']]){let override=nodes(types,'Override').find(r=>r.getAttribute('PartName')===part);if(!override){override=types.createElementNS(types.documentElement.namespaceURI,'Override');override.setAttribute('PartName',part);types.documentElement.appendChild(override);}override.setAttribute('ContentType',content);}if(!nodes(types,'Default').some(r=>r.getAttribute('Extension')==='vml')){const d=types.createElementNS(types.documentElement.namespaceURI,'Default');d.setAttribute('Extension','vml');d.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.vmlDrawing');types.documentElement.insertBefore(d,types.documentElement.firstChild);}
}
function rebuildReport(files,wb,rels,types,path,plans,state,balance,styles){
 const doc=xml(strFromU8(files[path])),data=nodes(doc,'sheetData')[0],originalRows=nodes(data,'row'),prototype=originalRows.find(r=>r.getAttribute('r')==='9'),comments=[],used=plans.reduce((n,p)=>n+p.lines.length,7),end=Math.max(130,used+1),overflow=used>=130;
 // Clear values in place. Never delete canonical rows or their formatting.
 for(const row of originalRows)if(Number(row.getAttribute('r'))>=8)for(const c of nodes(row,'c')){c.removeAttribute('t');while(c.firstChild)c.removeChild(c.firstChild);}
 for(let at=131;at<=end;at++)data.appendChild(dataRow(doc,at===end&&overflow?originalRows.find(r=>r.getAttribute('r')==='130'):prototype,at));
 let merges=nodes(doc,'mergeCells')[0];const productColumns=new Set(['A','B','C','D','J']);
 for(const m of nodes(merges,'mergeCell')){const ref=m.getAttribute('ref'),first=ref.split(':')[0].match(/([A-Z]+)(\d+)/),row=Number(first[2]);if(row<8)continue;if(row===130){if(overflow)m.setAttribute('ref',ref.replace(/130/g,String(end)));continue;}if(productColumns.has(first[1])||overflow&&Number(ref.match(/\d+$/)[0])>=130)m.parentNode.removeChild(m);}
 const merge=ref=>{const m=doc.createElementNS(NS,'mergeCell');m.setAttribute('ref',ref);merges.appendChild(m);};let at=8,monthStart=8,priorMonth='';
 for(const p of plans){
  const size=p.lines.length,month=/^\d{4}-(\d{2})/.exec(p.date||p.planDate||'')?.[1]||'',label=month?Number(month)+'월':'';
  if(at>8&&label!==priorMonth){if(at-monthStart>1)merge('A'+monthStart+':A'+(at-1));monthStart=at;}const start=at;
  for(let i=0;i<size;i++,at++){if(i===0){if(start===monthStart)setCell(doc,'A'+at,label);setCell(doc,'C'+at,p.name);setCell(doc,'D'+at,p.capacity||productCapacity(p.name)||p.unit||'');setCell(doc,'J'+at,Number(p.qty??planQuantity(p)),styles.forCell(doc,'J'+at));}
   const line=p.lines[i],b=balance(line.code),kimpo=Number(b['김포창고']||0),error=Number(b['오류창고']||0),qty=p.qty??planQuantity(p),allocations=lineAllocations(p,line);setCell(doc,'P'+at,line.name||state.materials.find(m=>m.code===line.code)?.name||line.code);setCell(doc,'Q'+at,kimpo+error,styles.forCell(doc,'Q'+at));comments.push({ref:'Q'+at,text:'자재코드: '+line.code+'\n단위소요량: '+(line.unitQty??line.qty/qty)+'\n계획 총필요량: '+line.qty+'\n통합 현재고: '+(kimpo+error)});
  }
  if(size>1)for(const c of ['B','C','D','J'])merge(c+start+':'+c+(at-1));priorMonth=label;
 }
 if(at-monthStart>1)merge('A'+monthStart+':A'+(at-1));merges.setAttribute('count',String(nodes(merges,'mergeCell').length));nodes(doc,'dimension')[0].setAttribute('ref','A1:AA'+end);
 const sheetIndex=nodes(wb,'sheet').findIndex(s=>sheetPath(wb,rels,s.getAttribute('name'))===path);
 for(const view of nodes(wb,'workbookView')){view.setAttribute('activeTab',String(sheetIndex));view.setAttribute('firstSheet',String(sheetIndex));}
 for(const s of nodes(wb,'sheet')){const other=sheetPath(wb,rels,s.getAttribute('name'));if(other!==path&&files[other]){const d=xml(strFromU8(files[other]));if(nodes(d,'sheetView').some(v=>v.getAttribute('tabSelected')==='1')){for(const v of nodes(d,'sheetView'))v.removeAttribute('tabSelected');files[other]=strToU8(serialize(d));}}}
 for(const view of nodes(doc,'sheetView')){view.setAttribute('tabSelected','1');view.setAttribute('topLeftCell','A1');for(const pane of nodes(view,'pane'))pane.setAttribute('topLeftCell','A1');for(const select of nodes(view,'selection')){select.setAttribute('activeCell','A1');select.setAttribute('sqref','A1');}}
 // Keep existing print configuration; extend a defined area only when needed.
 if(end>130)for(const n of nodes(wb,'definedName'))if(n.getAttribute('name')==='_xlnm.Print_Area'&&Number(n.getAttribute('localSheetId'))===sheetIndex)n.textContent=n.textContent.replace(/(\$[A-Z]+\$)\d+$/,(_,prefix)=>prefix+end);
 addComments(files,doc,types,path,comments);files[path]=strToU8(serialize(doc));
}
/** @param {{original?: Uint8Array|null, plans: any[], state: any, balance: Function, periodKey?: string, standard?: boolean, snapshot?: boolean, excludeBatchId?: string|null}} options */
export function buildProductionXlsx({original=null,plans,state,balance,periodKey='',standard=false,snapshot=false,excludeBatchId=null,template=reportLayout}){
 plans=plans.filter(p=>p.selected!==false);
 if(snapshot){if(!plans.length)throw Error('생산계획이 없습니다.');plans=plans.map(p=>{const qty=p.qty??planQuantity(p),codes=new Set();if(p.error||!(qty>0)||!Number.isFinite(qty)||!p.name||!Array.isArray(p.lines)||!p.lines.length)throw Error('저장된 계획/BOM 스냅샷을 확인하세요.');for(const l of p.lines){if(!l.code||codes.has(l.code)||!(l.qty>0)||!Number.isFinite(l.qty))throw Error('저장된 BOM 라인 오류');codes.add(l.code);}return {...p,qty};});}
 else plans=resolvePlanDownload(state,plans,{excludeBatchId});
 // All download entry points use the same canonical layout, never an arbitrary uploaded workbook.
 const files=loadCanonicalTemplate(template),wb=xml(strFromU8(files['xl/workbook.xml'])),rels=xml(strFromU8(files['xl/_rels/workbook.xml.rels'])),types=xml(strFromU8(files['[Content_Types].xml'])),styles=detailStyles(files,rels,types),path=template.mainPath;
 rebuildReport(files,wb,rels,types,path,plans,state,balance,styles);
 const restored=new Map(),active=(state.productionBatches||[]).find(b=>b.periodKey===periodKey&&b.status==='active');if(active&&(original||plans.some(p=>p.batchId===active.batchId)))for(const p of state.productions.filter(p=>p.batchId===active.batchId&&!p.cancelled))for(const l of p.lines)for(const a of lineAllocations(p,l)){const key=l.code+'|'+a.warehouse;restored.set(key,(restored.get(key)||0)+a.qty);}
 addSheet(files,wb,rels,types,'BOM자동계산',[detailHeaders,...planExportRows(plans,state,balance,periodKey,restored)],styles);let calc=nodes(wb,'calcPr')[0];if(!calc){calc=wb.createElementNS(NS,'calcPr');wb.documentElement.appendChild(calc);}calc.setAttribute('fullCalcOnLoad','1');styles.save();files['xl/workbook.xml']=strToU8(serialize(wb));files['xl/_rels/workbook.xml.rels']=strToU8(serialize(rels));files['[Content_Types].xml']=strToU8(serialize(types));return zipSync(files);
}
export function downloadXlsx(bytes,name){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
