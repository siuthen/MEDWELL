import {env} from 'cloudflare:workers';
import {passwordDigest,issueSession,matchesDigest} from '../../../lib/finance-auth.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const cookie=(value:string,age:number)=>`medwell_finance=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export async function DELETE(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'허용되지 않은 요청입니다.'},{status:403,headers});return Response.json({ok:true},{headers:{...headers,'Set-Cookie':cookie('',0)}});}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'허용되지 않은 요청입니다.'},{status:403,headers});
 try{
  if(!env.DB||!env.FINANCE_PASSWORD_HASH||!env.FINANCE_PASSWORD_SALT||!env.FINANCE_SESSION_SECRET)throw Error('비밀번호 설정을 확인해주세요.');
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS finance_login_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)').run();
  const ip=request.headers.get('cf-connecting-ip')||'unknown';const id=await passwordDigest(ip,env.FINANCE_PASSWORD_SALT);const now=Date.now();
  await env.DB.prepare('INSERT INTO finance_login_limits (id,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').bind(id,now+15*60*1000,now,now).run();
  const limit=await env.DB.prepare('SELECT attempts FROM finance_login_limits WHERE id=?').bind(id).first<{attempts:number}>();
  if(limit!.attempts>5)return Response.json({error:'입력 횟수를 초과했습니다. 15분 후 다시 시도해주세요.'},{status:429,headers});
  const body:any=await request.json();if(typeof body.password!=='string'||body.password.length>128)return Response.json({error:'비밀번호를 확인해주세요.'},{status:401,headers});
  if(!matchesDigest(await passwordDigest(body.password,env.FINANCE_PASSWORD_SALT),env.FINANCE_PASSWORD_HASH))return Response.json({error:'비밀번호가 일치하지 않습니다.'},{status:401,headers});
  await env.DB.prepare('DELETE FROM finance_login_limits WHERE id=?').bind(id).run();
  return Response.json({ok:true},{headers:{...headers,'Set-Cookie':cookie(await issueSession(env.FINANCE_SESSION_SECRET),1800)}});
 }catch(e:any){return Response.json({error:'비밀번호 인증을 처리할 수 없습니다.'},{status:503,headers});}
}
