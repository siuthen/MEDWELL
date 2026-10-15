import { env } from 'cloudflare:workers';
import raw from '../../../data/raw.json';
import review from '../../../data/inventory-review.json';
import {seed,apply,migrate} from '../../../lib/core.mjs';
import {readClassifiedState} from '../../../lib/persist-usage-era.mjs';
import {financeAllowed,publicState} from '../../../lib/finance-auth.mjs';
export const dynamic='force-dynamic';
const response=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function read(){
 if(!env.DB)throw new Error('서버 데이터베이스 연결이 필요합니다.');
 await env.DB.prepare('INSERT OR IGNORE INTO workspace_state (id,version,payload) VALUES (?,0,?)').bind('team',JSON.stringify(seed(raw,review))).run();
 return await readClassifiedState(env.DB);
}
export async function GET(request:Request){
 try{const r=await read(),authorized=await financeAllowed(request,env.FINANCE_SESSION_SECRET),state=migrate(JSON.parse(r!.payload));return response({version:r!.version,state:authorized?state:publicState(state),financeAuthorized:authorized,actor:'공용 접속'});}catch(e:any){return response({error:e.message},500);}
}
export async function POST(request:Request){
 const actor='공용 접속';
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'허용되지 않은 요청입니다.'},403);
 try{
  const body:any=await request.json();const r=await read();const state=JSON.parse(r!.payload);
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
