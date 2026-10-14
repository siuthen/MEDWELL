import { env } from 'cloudflare:workers';
import raw from '../../../data/raw.json';
import review from '../../../data/inventory-review.json';
import {seed,apply,migrate} from '../../../lib/core.mjs';
export const dynamic='force-dynamic';
const response=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function read(){
 if(!env.DB)throw new Error('서버 데이터베이스 연결이 필요합니다.');
 await env.DB.prepare('INSERT OR IGNORE INTO workspace_state (id,version,payload) VALUES (?,0,?)').bind('team',JSON.stringify(seed(raw,review))).run();
 return await env.DB.prepare('SELECT version,payload FROM workspace_state WHERE id=?').bind('team').first<{version:number,payload:string}>();
}
export async function GET(request:Request){
 try{const r=await read();return response({version:r!.version,state:migrate(JSON.parse(r!.payload)),actor:'공용 접속'});}catch(e:any){return response({error:e.message},500);}
}
export async function POST(request:Request){
 const actor='공용 접속';
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'허용되지 않은 요청입니다.'},403);
 try{
  const body=await request.json();const r=await read();const state=JSON.parse(r!.payload);
  if(state.processed.includes(body.requestId))return response({version:r!.version,state});
  if(body.version!==r!.version)return response({error:'다른 직원이 먼저 저장했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);
  apply(state,body,actor);const payload=JSON.stringify(state);if(payload.length>4000000)return response({error:'데이터 용량이 커졌습니다. 운영 DB 구조 확장이 필요합니다.'},400);
  const saved=await env.DB.prepare('UPDATE workspace_state SET payload=?,version=version+1 WHERE id=? AND version=?').bind(payload,'team',r!.version).run();
  if(!saved.meta.changes)return response({error:'동시 수정이 발생했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);
  return response({version:r!.version+1,state});
 }catch(e:any){return response({error:e.message},400);}
}
