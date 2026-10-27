import {RELEASE} from '../../../lib/release-data.mjs';
import { env } from 'cloudflare:workers';
import raw from '../../../data/raw.json';
import review from '../../../data/inventory-review.json';
import {seed,apply,migrate} from '../../../lib/core.mjs';
import {readClassifiedState} from '../../../lib/persist-usage-era.mjs';
import {financeAllowed,publicState} from '../../../lib/finance-auth.mjs';
export const dynamic='force-dynamic';
// Final serialization boundary: /api/state never returns financial fields, even to a valid finance session.
const response=(body:any,status=200)=>Response.json(body?.state?{...body,state:publicState(body.state)}:body,{status,headers:{'Cache-Control':'no-store'}});
async function read(){
 if(!env.DB)throw new Error('서버 데이터베이스 연결이 필요합니다.');
 await env.DB.prepare('INSERT OR IGNORE INTO workspace_state (id,version,payload) VALUES (?,0,?)').bind('team',JSON.stringify(seed(raw,review))).run();
 return await readClassifiedState(env.DB);
}
export async function GET(request:Request){
 try{if(!env.DB)throw Error('서버 데이터베이스 연결이 필요합니다.');const r=await env.DB.prepare('SELECT version,payload FROM workspace_state WHERE id=?').bind('team').first<{version:number,payload:string}>();if(!r)throw Error('운영 데이터를 찾을 수 없습니다.');const authorized=await financeAllowed(request,env.FINANCE_SESSION_SECRET),stored=JSON.parse(r.payload),releasePending=stored.migrations?.scheduleBom!==RELEASE,state=migrate(stored);return response({version:r.version,state,releasePending,financeAuthorized:authorized,actor:'공용 접속'});}catch(e:any){return response({error:e.message},500);}
}
export async function POST(request:Request){
 const actor='공용 접속';
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'허용되지 않은 요청입니다.'},403);
 try{
  const body:any=await request.json();
  if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'요청 본문을 확인하세요.'},400);
  const bulk=body.type==='bulkCreateProductBoms',atomic=bulk||['receipt','receiptEdit','orderEdit','deleteOrder','deleteReceipt','createDirectProductionPlans','replaceProductionPlanBatch','scheduleCreate','scheduleEdit','scheduleDelete','releaseMigration'].includes(body.type);
  if(Object.hasOwn(body,'expectedVersion')){if(body.version!==undefined&&body.version!==body.expectedVersion)return response({error:'version과 expectedVersion이 다릅니다.'},400);body.version=body.expectedVersion;}
  if(bulk&&Object.hasOwn(body,'expectedVersion')){if(body.version!==undefined&&body.version!==body.expectedVersion)return response({error:'version과 expectedVersion이 다릅니다.'},400);body.version=body.expectedVersion;body.payload??={materials:body.materials,products:body.products,canonicalProductReplacements:body.canonicalProductReplacements};}
  if(atomic&&(!Number.isSafeInteger(body.version)||body.version<0||typeof body.requestId!=='string'||!body.requestId.trim()))return response({error:'expectedVersion/version과 requestId를 확인하세요.'},400);
  if(bulk&&body.payload&&((body.payload.expectedVersion!==undefined&&body.payload.expectedVersion!==body.version)||(body.payload.requestId!==undefined&&body.payload.requestId!==body.requestId)))return response({error:'요청 본문과 envelope의 version/requestId가 다릅니다.'},400);
  // Master import must not seed or persist a migration before it has been fully validated.
  if(atomic&&!env.DB)throw new Error('서버 데이터베이스 연결이 필요합니다.');
  const r=atomic?await env.DB!.prepare('SELECT version,payload FROM workspace_state WHERE id=?').bind('team').first():await read();
  if(!r)throw new Error('운영 데이터를 찾을 수 없습니다.');const state=JSON.parse(r.payload);
  const authorized=await financeAllowed(request,env.FINANCE_SESSION_SECRET);
  const visible=(state:any)=>authorized?state:publicState(state);
  if(!authorized&&['close','reopen'].includes(body.type))return response({error:'월 마감 비밀번호를 입력해주세요.'},403);
  if(!authorized&&['receipt','receiptEdit','order'].includes(body.type)){
   if(!body.payload||typeof body.payload!=='object')return response({error:'입력값이 없습니다.'},400);
   body.payload.price=body.type==='receiptEdit'?(state.receipts.find((x:any)=>x.id===body.payload.id)?.price??0):0;
  }
  if(state.processed.includes(body.requestId))return response({version:r!.version,state:visible(state),financeAuthorized:authorized});
  if(body.version!==r!.version)return response({error:'다른 직원이 먼저 저장했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);
  apply(state,body,actor);const payload=JSON.stringify(state);if(payload.length>4000000)return response({error:'데이터 용량이 커졌습니다. 운영 DB 구조 확장이 필요합니다.'},400);
  const saved=await env.DB!.prepare('UPDATE workspace_state SET payload=?,version=version+1 WHERE id=? AND version=?').bind(payload,'team',r!.version).run();
  if(!saved.meta.changes)return response({error:'동시 수정이 발생했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);
  return response({version:r!.version+1,state:visible(state),financeAuthorized:authorized});
 }catch(e:any){return response({error:e.message},400);}
}
