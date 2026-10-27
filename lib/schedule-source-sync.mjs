import {isWeekdayDate} from './schedule-view.mjs';

export const MAX_SOURCE_SCHEDULES=1000;
const TOP_LEVEL_KEYS=new Set(['expectedVersion','requestId','syncedAt','schedules']);
const SCHEDULE_KEYS=new Set(['sourceType','sourceId','date','title','rawTitle','itemName','quantity','vendor','note']);
const SOURCE_TYPES=new Set(['qc','receipt']);
const SHA256_K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

function rotateRight(value,bits){return value>>>bits|value<<(32-bits);}
export function sha256Hex(value){
 const bytes=new TextEncoder().encode(value),size=Math.ceil((bytes.length+9)/64)*64,buffer=new Uint8Array(size);buffer.set(bytes);buffer[bytes.length]=0x80;
 const view=new DataView(buffer.buffer),bits=bytes.length*8;view.setUint32(size-8,Math.floor(bits/0x100000000));view.setUint32(size-4,bits>>>0);
 const hash=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],words=new Uint32Array(64);
 for(let offset=0;offset<size;offset+=64){
  for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
  for(let i=16;i<64;i++){const a=words[i-15],b=words[i-2],s0=rotateRight(a,7)^rotateRight(a,18)^a>>>3,s1=rotateRight(b,17)^rotateRight(b,19)^b>>>10;words[i]=(words[i-16]+s0+words[i-7]+s1)>>>0;}
  let [a,b,c,d,e,f,g,h]=hash;
  for(let i=0;i<64;i++){const s1=rotateRight(e,6)^rotateRight(e,11)^rotateRight(e,25),choice=e&f^~e&g,t1=(h+s1+choice+SHA256_K[i]+words[i])>>>0,s0=rotateRight(a,2)^rotateRight(a,13)^rotateRight(a,22),majority=a&b^a&c^b&c,t2=(s0+majority)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  for(const [i,value] of [a,b,c,d,e,f,g,h].entries())hash[i]=(hash[i]+value)>>>0;
 }
 return hash.map(value=>value.toString(16).padStart(8,'0')).join('');
}
export function opaqueSourceScheduleId(sourceId){return 'source-sync:'+sha256Hex(sourceId).slice(0,40);}

function plainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function exactKeys(value,allowed,label){for(const key of Object.keys(value))if(!allowed.has(key))throw Error(label+'에 허용되지 않은 필드가 있습니다: '+key);}
function limitedString(value,name,max,{required=false,multiline=false}={}){
 if(value===undefined)return '';
 if(typeof value!=='string')throw Error(name+'은 문자열이어야 합니다.');
 if(value.length>max||(!multiline&&/[\r\n]/.test(value)))throw Error(name+' 길이 또는 형식을 확인하세요.');
 if(required&&!value.trim())throw Error(name+'을 입력하세요.');
 return value;
}
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('일정 날짜를 확인하세요.');
 if(!isWeekdayDate(value))throw Error('토·일 일정은 동기화할 수 없습니다.');
 return value;
}
function normalizeQuantity(value){
 if(value===undefined)return '';
 if(typeof value==='number'){if(!Number.isFinite(value)||value<0)throw Error('수량을 확인하세요.');return value;}
 return limitedString(value,'수량',100);
}
function normalizeSchedule(row,index){
 if(!plainObject(row))throw Error(`${index+1}번째 일정 형식을 확인하세요.`);
 exactKeys(row,SCHEDULE_KEYS,`${index+1}번째 일정`);
 if(!SOURCE_TYPES.has(row.sourceType))throw Error(`${index+1}번째 sourceType을 확인하세요.`);
 const sourceId=limitedString(row.sourceId,`${index+1}번째 sourceId`,250,{required:true});
 if(sourceId!==sourceId.trim()||!sourceId.startsWith(row.sourceType+':')||/[\u0000-\u001f\u007f]/.test(sourceId))throw Error(`${index+1}번째 sourceId prefix 또는 형식을 확인하세요.`);
 const title=limitedString(row.title,`${index+1}번째 title`,2000);
 const rawTitle=limitedString(row.rawTitle,`${index+1}번째 rawTitle`,2000);
 const itemName=limitedString(row.itemName,`${index+1}번째 itemName`,2000);
 if(!title.trim()&&!rawTitle.trim()&&!itemName.trim())throw Error(`${index+1}번째 일정 제목을 확인하세요.`);
 const normalized={id:opaqueSourceScheduleId(sourceId),sourceType:row.sourceType,sourceId,date:validDate(row.date)};
 if(row.title!==undefined)normalized.title=title;
 if(row.rawTitle!==undefined)normalized.rawTitle=rawTitle;
 if(row.itemName!==undefined)normalized.itemName=itemName;
 if(row.quantity!==undefined)normalized.quantity=normalizeQuantity(row.quantity);
 if(row.vendor!==undefined)normalized.vendor=limitedString(row.vendor,`${index+1}번째 vendor`,500);
 if(row.note!==undefined)normalized.note=limitedString(row.note,`${index+1}번째 note`,5000,{multiline:true});
 return normalized;
}
function normalizedComparable(row){
 const out={id:row.id,sourceType:row.sourceType,sourceId:row.sourceId,date:row.date};
 for(const key of ['title','rawTitle','itemName','quantity','vendor','note'])if(Object.hasOwn(row,key))out[key]=row[key];
 return out;
}
function isLegacyManaged(row){return typeof row?.id==='string'&&(row.id.startsWith('qc-')||row.id.startsWith('po-calendar-'));}
export function isSourceManagedSchedule(row){return (SOURCE_TYPES.has(row?.sourceType)&&typeof row.sourceId==='string'&&row.sourceId.startsWith(row.sourceType+':'))||isLegacyManaged(row);}

export function validateSourceSyncBody(body){
 if(!plainObject(body))throw Error('요청 본문을 확인하세요.');
 exactKeys(body,TOP_LEVEL_KEYS,'요청 본문');
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw Error('expectedVersion을 확인하세요.');
 limitedString(body.requestId,'requestId',200,{required:true});
 const syncedAt=limitedString(body.syncedAt,'syncedAt',50,{required:true});
 if(!Number.isFinite(Date.parse(syncedAt)))throw Error('syncedAt을 확인하세요.');
 if(!Array.isArray(body.schedules)||body.schedules.length>MAX_SOURCE_SCHEDULES)throw Error(`schedules는 최대 ${MAX_SOURCE_SCHEDULES}건까지 허용됩니다.`);
 const schedules=body.schedules.map(normalizeSchedule).sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'ko'));
 const ids=new Set();for(const row of schedules){if(ids.has(row.sourceId))throw Error('같은 sourceId가 중복되었습니다: '+row.sourceId);ids.add(row.sourceId);}
 return {expectedVersion:body.expectedVersion,requestId:body.requestId,syncedAt,schedules};
}

export function sourceSyncCounts(current,next){
 const before=new Map(current.map(row=>[row.sourceId||row.id,normalizedComparable(row)])),after=new Map(next.map(row=>[row.sourceId,normalizedComparable(row)]));
 let added=0,updated=0,removed=0;
 for(const [id,row] of after){if(!before.has(id))added++;else if(JSON.stringify(before.get(id))!==JSON.stringify(row))updated++;}
 for(const id of before.keys())if(!after.has(id))removed++;
 return {managed:next.length,added,updated,removed};
}

export function applySourceSync(state,input,actor='Aside 일정 동기화',now=new Date().toISOString()){
 const all=Array.isArray(state.schedules)?state.schedules:[],current=all.filter(isSourceManagedSchedule),manual=all.filter(row=>!isSourceManagedSchedule(row));
 const same=current.length===input.schedules.length&&!current.some(isLegacyManaged)&&JSON.stringify(current.map(normalizedComparable).sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'ko')))===JSON.stringify(input.schedules.map(normalizedComparable));
 const counts={...sourceSyncCounts(current,input.schedules),preserved:manual.length};
 if(same)return {changed:false,counts};
 const audit={id:input.requestId,at:now,actor,type:'scheduleSourceSync',description:'공유시트 일정 동기화',payload:{syncedAt:input.syncedAt,counts}};
 Object.assign(state,{schedules:manual.concat(input.schedules),audit:[audit,...(state.audit||[])],processed:[...(state.processed||[]),input.requestId]});
 return {changed:true,counts};
}
