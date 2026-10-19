import {env} from 'cloudflare:workers';
import {financeAllowed} from '../../../lib/finance-auth.mjs';
import {closingReport} from '../../../server/closing-report.mjs';
import {readClosingOverrides,saveClosingPrice} from '../../../server/closing-price-overrides.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 if(!await financeAllowed(request,env.FINANCE_SESSION_SECRET))return Response.json({error:'월 마감 비밀번호를 입력해주세요.'},{status:403,headers});
 try{
  const month=new URL(request.url).searchParams.get('month');
  if(!month||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:'마감월을 확인하세요.'},{status:400,headers});
  if(!env.DB)throw Error('서버 데이터베이스 연결이 필요합니다.');
  const row=await env.DB.prepare('SELECT version,payload FROM workspace_state WHERE id=?').bind('team').first<{version:number,payload:string}>();
  if(!row)throw Error('운영 데이터를 찾을 수 없습니다.');
  return Response.json({...closingReport(JSON.parse(row.payload),month,await readClosingOverrides(env.DB,month)),version:row.version},{headers});
 }catch(e:any){return Response.json({error:e.message},{status:400,headers});}
}

export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'허용되지 않은 요청입니다.'},{status:403,headers});
 if(!await financeAllowed(request,env.FINANCE_SESSION_SECRET))return Response.json({error:'월 마감 비밀번호를 입력해주세요.'},{status:403,headers});
 try{if(!env.DB)throw Error('서버 데이터베이스 연결이 필요합니다.');return Response.json(await saveClosingPrice(env.DB,await request.json()),{headers});}
 catch(e:any){return Response.json({error:e.message},{status:e.message.includes('다른 사용자')?409:400,headers});}
}
