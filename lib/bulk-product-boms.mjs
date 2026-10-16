import {USAGE_ERAS} from './usage-era.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=message=>{throw Error(message);};
function string(value,label){if(typeof value!=='string'||!value.trim()||value.length>1000)fail(label+'을 확인하세요.');}
function code(value,label){string(value,label);if(value!==value.trim()||value.length>200||['__proto__','constructor','prototype'].includes(value))fail(label+'에 앞뒤 공백 또는 허용되지 않은 값이 있습니다.');}
function shape(value,keys,label){if(!record(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(label+' 필드 형식을 확인하세요.');}
function era(value){if(value!==undefined&&!USAGE_ERAS.includes(value))fail('사용구분이 올바르지 않습니다.');}
function unique(codes,label){if(new Set(codes).size!==codes.length)fail(label+' 코드가 요청 안에서 중복됩니다.');}
function assertNoProductReferences(state,target){
 const textKeys=new Set(['name','note','description','source','fileName','version','reason','unit','spec','at','createdAt','expected','date','usageEra']);
 const materialRoots=new Set(['materials','orders','receipts','transfers','adjustments','historical','review']);
 function walk(value,path){
  if(typeof value==='string'&&value===target){const key=path.at(-1),root=path[0];
   if(textKeys.has(key)||(root==='review'&&key==='mappedCode'&&path.length===3))return;
   if(key==='code'&&((root==='products'&&path.length===3)||(materialRoots.has(root)&&path.length===3)||path.includes('bom')||(root==='productions'&&path.includes('lines'))))return;
   fail('제품코드 '+target+'의 참조가 남아 있습니다: '+path.join('.')+' (운영 전표는 변경하지 않습니다)');
  }
  if(Array.isArray(value))value.forEach((v,i)=>walk(v,[...path,String(i)]));
  else if(record(value))for(const [key,v] of Object.entries(value)){if(key===target&&!(path.length===1&&path[0]==='opening'))fail('제품코드 참조 키를 안전하게 교정할 수 없습니다: '+[...path,key].join('.'));walk(v,[...path,key]);}
 }
 for(const [key,value] of Object.entries(state))if(!['audit','processed','migrations'].includes(key))walk(value,[key]);
}
export function bulkCreateProductBoms(state,payload,id,actor,now){
 shape(payload,['expectedVersion','requestId','materials','products','canonicalProductReplacements'],'일괄 등록');
 const {materials,products,canonicalProductReplacements:replacements}=payload;
 if(!Array.isArray(materials)||materials.length>5000||!Array.isArray(products)||!products.length||products.length>1000||!Array.isArray(replacements)||replacements.length>100)fail('materials·products·canonicalProductReplacements 배열을 확인하세요.');
 const existingMaterials=new Map();for(const m of state.materials){if(existingMaterials.has(m.code))fail('기존 자재 마스터에 코드 중복이 있습니다: '+m.code);existingMaterials.set(m.code,m);}
 const additions=[],reused=[];
 for(const m of materials){shape(m,['code','name','unit','spec','usageEra'],'자재');code(m.code,'자재코드');string(m.name,'자재명');string(m.unit,'자재 단위');if(m.spec!==undefined&&typeof m.spec!=='string')fail('자재 규격을 확인하세요.');era(m.usageEra);
  const old=existingMaterials.get(m.code);if(old){if(old.deleted||['name','unit','spec'].some(k=>(old[k]??'')!==(m[k]??'')))fail('기존 자재의 필수 정보가 충돌합니다: '+m.code);reused.push(m.code);}else additions.push({...structuredClone(m),spec:m.spec??'',usageEra:m.usageEra??'unmatched'});
 }
 unique(materials.map(m=>m.code),'자재');
 const materialSet=new Set([...state.materials.filter(m=>!m.deleted).map(m=>m.code),...additions.map(m=>m.code)]),existingCodes=new Set(state.products.map(p=>p.code));
 let bomLineCount=0;
 for(const p of products){shape(p,['code','name','spec','unit','version','approved','usageEra','bom'],'제품');code(p.code,'제품코드');string(p.name,'제품명');string(p.unit,'제품 단위');string(p.version,'BOM 버전');if(p.spec!==undefined&&typeof p.spec!=='string')fail('제품 규격을 확인하세요.');era(p.usageEra);if(p.approved!==true)fail('신규 제품 BOM은 approved=true여야 합니다: '+p.code);if(existingCodes.has(p.code))fail('기존 제품코드와 중복됩니다: '+p.code);
  if(!Array.isArray(p.bom)||!p.bom.length||p.bom.length>1000)fail('비어 있지 않은 BOM이 필요합니다: '+p.code);
  for(const line of p.bom){shape(line,['code','qty'],'BOM');code(line.code,'BOM 자재코드');if(typeof line.qty!=='number'||!Number.isFinite(line.qty)||line.qty<=0)fail('BOM qty는 유한한 양수여야 합니다: '+p.code+' / '+line.code);if(!materialSet.has(line.code))fail('미등록 또는 삭제된 BOM 자재입니다: '+line.code);}
  unique(p.bom.map(l=>l.code),'BOM '+p.code);bomLineCount+=p.bom.length;
 }
 unique(products.map(p=>p.code),'신규 제품');
 const targets=new Set(products.map(p=>p.code)),changes=[];
 for(const replacement of replacements){shape(replacement,['oldCode','newCode','ecountName'],'제품코드 교정');code(replacement.oldCode,'기존 제품코드');code(replacement.newCode,'정식 제품코드');if(replacement.ecountName!==undefined)string(replacement.ecountName,'정식 제품명');
  const found=state.products.filter(p=>p.code===replacement.oldCode);if(found.length!==1||found[0].deleted)fail('교정할 활성 제품을 유일하게 찾을 수 없습니다: '+replacement.oldCode);if(existingCodes.has(replacement.newCode)||targets.has(replacement.newCode))fail('정식 제품코드가 이미 사용 중입니다: '+replacement.newCode);targets.add(replacement.newCode);assertNoProductReferences(state,replacement.oldCode);changes.push(replacement);
 }
 unique(changes.map(r=>r.oldCode),'교정 대상');
 const corrections=new Map(changes.map(r=>[r.oldCode,r])),nextProducts=state.products.map(p=>{const r=corrections.get(p.code);return r?{...p,code:r.newCode,...(r.ecountName!==undefined?{name:r.ecountName}:{})}:p;}).concat(products.map(p=>({...structuredClone(p),usageEra:p.usageEra??'unmatched'})));
 // Verify referential integrity of all resulting BOMs, including the preserved existing ones.
 const allMaterials=new Set([...state.materials.map(m=>m.code),...additions.map(m=>m.code)]);
 for(const p of nextProducts)for(const line of p.bom||[])if(!allMaterials.has(line.code))fail('저장 후 BOM 자재 무결성을 확인할 수 없습니다: '+p.code+' / '+line.code);
 const summary={productsCreated:products.length,materialsCreated:additions.length,materialsReused:reused.length,bomLineCount,canonicalReplacementCount:changes.length,canonicalProductReplacements:structuredClone(changes)};
 Object.assign(state,{materials:state.materials.concat(additions),products:nextProducts,audit:[{id,at:now,actor,type:'bulkCreateProductBoms',description:'검증 제품·자재·BOM 일괄 등록',payload:summary},...state.audit],processed:[...state.processed,id]});return state;
}
