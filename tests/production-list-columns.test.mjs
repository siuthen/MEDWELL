import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),lookup=await readFile(new URL('../components/production-plan-lookup.tsx',import.meta.url),'utf8');
const lookupHeader=page.match(/production-lookup-head"[^>]*>(.*?)<\/div>/s)?.[1]??'';
test('생산계획 조회는 제품명·계획수량·계획월·제조일·BOM·수정삭제로 구성',()=>{for(const label of ['제품명','계획수량','계획월','제조일','수정·삭제'])assert.match(lookupHeader,new RegExp(label));assert.match(page,/ProductionPlanLookup/);for(const label of ['부자재','필요수량','계획 반영 재고','발주일','입고일'])assert.match(lookup,new RegExp(label));for(const old of ['총 자재 차감량','재고 반영'])assert.doesNotMatch(lookupHeader+lookup,new RegExp(old));});
test('조회는 exact 코드 기반 파생 BOM 도우미와 양방향 삭제 액션 사용',()=>{assert.match(lookup,/productionMaterialRows/);assert.match(lookup,/productionPlanDelete/);assert.match(lookup,/confirm\(/);});
test('취소·비활성 생산계획은 상태를 표시하고 수정·삭제를 비활성화',()=>{assert.match(lookup,/canEditProductionPlan/);assert.match(lookup,/status=.*취소/);assert.match(lookup,/disabled=\{!editable\}/);});

test('발주량은 발주일과 같은 유효 기록에서 정확한 코드로 합산',async()=>{
 const {productionMaterialRows}=await import('../lib/production-lookup.mjs');
 const plan={id:'P',plannedQty:1,warehouse:'김포창고',lines:[{code:'A-1',qty:1200},{code:'B',qty:3}]};
 const state={
  materials:[{code:'A-1',name:'동일품명',unit:'EA'},{code:'B',name:'미발주'}],
  opening:{'A-1':{total:1000,error:0}},productions:[plan],
  orders:[
   {id:'same',code:'A-1',qty:1000,date:'2026-11-04',expected:'2026-11-14'},
   {id:'wrong',code:'A1',name:'동일품명',qty:9999},
   {id:'case',code:'a-1',name:'동일품명',qty:9999},
   {id:'deleted',code:'A-1',qty:9999,deleted:true},
   {id:'cancelled',code:'A-1',qty:9999,cancelled:true},
   {id:'cancelled-status',code:'A-1',qty:9999,status:'취소'},
   {id:'completed',code:'A-1',qty:25},
   {id:'rejected',code:'A-1',qty:9999,status:'부적합'}
  ],
  historical:[{id:'old',code:'A-1',quantity:'2,500',date:'2026-11-02',expected:'2026-11-13'}],
  receipts:[
   {id:'received-part',code:'A-1',orderId:'same',warehouse:'김포창고',paid:30,free:0,date:'2026-11-11'},
   {id:'received-all',code:'A-1',orderId:'completed',warehouse:'김포창고',paid:25,free:0,date:'2026-11-12'}
  ]
 };
 const before=structuredClone(state);
 const [row,missing]=productionMaterialRows(state,plan);
 assert.deepEqual(row.orders.map(order=>order.id),['old','same']);
 assert.equal(row.orderQuantity,3500);
 assert.deepEqual(row.receipts.map(receipt=>receipt.id),['received-all','received-part']);
 assert.equal(row.stock,-145);
 assert.equal(missing.orderQuantity,null);
 assert.deepEqual(state,before);
});

test('BOM 표는 7개 열, 단위·천 단위 발주 합계, 음수 재고, 미발주 대시와 날짜 펼침을 렌더링',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {mkdir,writeFile,unlink}=await import('node:fs/promises');
 const {transpileModule,ModuleKind,JsxEmit}=await import('typescript');
 const dir=new URL('../work/',import.meta.url),file=new URL('production-bom-lookup-test.mjs',dir);
 await mkdir(dir,{recursive:true});
 await writeFile(file,transpileModule(lookup,{compilerOptions:{module:ModuleKind.ESNext,target:99,jsx:JsxEmit.ReactJSX}}).outputText);
 try{
  const {default:Lookup}=await import(file.href);
  const plan={id:'P',name:'완제품',plannedQty:1,warehouse:'김포창고',lines:[{code:'A',qty:2000},{code:'B',qty:0}]};
  const state={materials:[{code:'A',name:'부자재 A',unit:'EA'}],opening:{},productions:[plan],orders:[
   {id:'a1',code:'A',qty:1000,date:'2026-11-02'},{id:'a2',code:'A',qty:2500,date:'2026-11-03'}
  ],receipts:[]};
  const html=renderToStaticMarkup(createElement(Lookup,{state,plans:[plan]}));
  assert.deepEqual([...html.matchAll(/<th scope="col" class="[^"]+">(.*?)<\/th>/g)].map(match=>{
   return match[1].match(/aria-describedby="[^"]+">([^<]+)<\/span>/)?.[1]??match[1];
  }),[
   '부자재 코드','부자재명','필요수량','계획 반영 재고','발주수량','발주일','입고일'
  ]);
  const columnClasses=['bom-code-col','bom-name-col','bom-quantity-col','bom-quantity-col','bom-quantity-col','bom-date-col','bom-date-col'];
  const alignmentClasses=['bom-text','bom-text','bom-number','bom-number','bom-number','bom-date','bom-date'];
  assert.deepEqual([...html.matchAll(/<col class="([^"]+)"/g)].map(match=>match[1]),columnClasses);
  assert.deepEqual([...html.matchAll(/<th scope="col" class="([^"]+)"/g)].map(match=>match[1]),alignmentClasses);
  for(const [,row] of html.matchAll(/<tr>(<td.*?<\/td>)<\/tr>/g)){
   assert.deepEqual([...row.matchAll(/<td class="([^ "]+)[^"]*"/g)].map(match=>match[1]),alignmentClasses);
  }
  const helpId=html.match(/class="planned-stock-label" tabindex="0" aria-describedby="([^"]+)">계획 반영 재고/)?.[1];
  assert.ok(helpId);
  assert.ok(html.includes(`id="${helpId}" role="tooltip">현재 재고에서 확정 생산계획의 필요수량을 차감한 수량</span>`));
  assert.doesNotMatch(html,/통합 현재고/);
  assert.match(html,/<td class="bom-text">A<\/td><td class="bom-text"><b>부자재 A<\/b><\/td><td class="bom-number">2,000 EA<\/td><td class="bom-number negative">-2,000 EA<\/td><td class="bom-number">3,500 EA<\/td>/);
  assert.match(html,/<summary>2026-11-02 외 1건<\/summary>/);
  assert.match(html,/<td class="bom-text">B<\/td><td class="bom-text"><b>B<\/b><\/td><td class="bom-number">0<\/td><td class="bom-number">0<\/td><td class="bom-number">-<\/td><td class="bom-date"><span>-<\/span><\/td><td class="bom-date">-<\/td>/);
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/\.planned-stock-heading:hover \.planned-stock-tooltip,\.planned-stock-heading:focus-within \.planned-stock-tooltip\{visibility:visible\}/);
  assert.match(css,/\.production-bom-table\{[^}]*min-width:940px;table-layout:fixed/);
  assert.match(css,/\.production-bom-table \.bom-text\{text-align:left/);
  assert.match(css,/\.production-bom-table \.bom-number\{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums/);
  assert.match(css,/\.production-bom-table \.bom-date\{text-align:center;white-space:nowrap/);
  assert.match(css,/\.production-bom-table \.bom-date :is\(details,summary\)\{text-align:center/);
  assert.match(css,/\.planned-stock-heading\{[^}]*display:inline-flex;justify-content:flex-end/);
  assert.match(css,/\.production-bom-inline\{[^}]*overflow-x:auto/);
 }finally{await unlink(file);}
});
