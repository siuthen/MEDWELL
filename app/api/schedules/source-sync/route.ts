import {env} from 'cloudflare:workers';
import {applySourceSync,isSourceManagedSchedule,validateSourceSyncBody,sha256Hex} from '../../../../lib/schedule-source-sync.mjs';
import {latestSyncReceipt,findSyncReceipt,ensureSyncReceipts,changedReceiptStatement,recordNoChange} from '../../../../lib/schedule-sync-status.mjs';
export const dynamic='force-dynamic';
const response=(body:any,status=200)=>Response.json(body?.lastSuccess?{...body,lastSuccess:{...body.lastSuccess,requestId:'sync:'+sha256Hex(body.lastSuccess.requestId).slice(0,40)}}:body,{status,headers:{'Cache-Control':'no-store'}});
const counts=(state:any)=>({managed:(state.schedules||[]).filter(isSourceManagedSchedule).length,added:0,updated:0,removed:0,preserved:(state.schedules||[]).filter((row:any)=>!isSourceManagedSchedule(row)).length});
export async function GET(){try{if(!env.DB)throw Error('서버 데이터베이스 연결이 필요합니다.');return response({lastSuccess:await latestSyncReceipt(env.DB),checkedAt:new Date().toISOString()});}catch{return response({error:'동기화 완료 기록을 확인하지 못했습니다.'},503);}}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'허용되지 않은 요청입니다.'},403);
 try{
  if(!env.DB)throw Error('서버 데이터베이스 연결이 필요합니다.');const input=validateSourceSyncBody(await request.json());
  const row=await env.DB.prepare('SELECT version,payload FROM workspace_state WHERE id=?').bind('team').first<{version:number,payload:string}>();if(!row)throw Error('운영 데이터를 찾을 수 없습니다.');
  const state=JSON.parse(row.payload),known=await findSyncReceipt(env.DB,input.requestId);
  if(known)return response({changed:false,counts:known.counts,version:row.version,syncedAt:input.syncedAt,lastSuccess:known});
  if((state.processed||[]).includes(input.requestId)){const audit=state.audit?.find((a:any)=>a.id===input.requestId&&a.type==='scheduleSourceSync');return response({changed:false,counts:counts(state),version:row.version,syncedAt:input.syncedAt,lastSuccess:audit?{requestId:audit.id,confirmedAt:audit.at,changed:true,version:null,counts:audit.payload?.counts}:null});}
  if(input.expectedVersion!==row.version)return response({error:'다른 직원이 먼저 저장했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);
  const result=applySourceSync(state,input),now=new Date().toISOString();const payload=JSON.stringify(state);if(payload.length>4000000)return response({error:'데이터 용량이 커졌습니다. 운영 DB 구조 확장이 필요합니다.'},400);
  await ensureSyncReceipts(env.DB);
  if(result.changed){
   const update=env.DB.prepare('UPDATE workspace_state SET payload=?,version=version+1 WHERE id=? AND version=?').bind(payload,'team',row.version);
   const saved=await env.DB.batch([update,changedReceiptStatement(env.DB,input,result,row.version+1,now)]);
   if(!saved[0].meta.changes){const replay=await findSyncReceipt(env.DB,input.requestId);if(replay)return response({changed:false,counts:replay.counts,version:replay.version,syncedAt:input.syncedAt,lastSuccess:replay});return response({error:'동시 수정이 발생했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);}
  }else{const saved=await recordNoChange(env.DB,input,result,row.version,now);if(!saved){const replay=await findSyncReceipt(env.DB,input.requestId);if(replay)return response({changed:false,counts:replay.counts,version:replay.version,syncedAt:input.syncedAt,lastSuccess:replay});return response({error:'동시 수정이 발생했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.'},409);}}
  return response({...result,version:row.version+(result.changed?1:0),syncedAt:input.syncedAt,lastSuccess:{requestId:input.requestId,confirmedAt:now,version:row.version+(result.changed?1:0),changed:result.changed,counts:result.counts}});
 }catch(error:any){return response({error:error.message},400);}
}
