import {POST as mutate} from '../../state/route';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  const body:any=await request.json();
  if(!body||typeof body!=='object'||Array.isArray(body)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||typeof body.requestId!=='string'||!body.requestId.trim())return Response.json({error:'expectedVersion과 requestId를 확인하세요.'},{status:400,headers:{'Cache-Control':'no-store'}});
  const headers=new Headers(request.headers);headers.delete('content-length');headers.set('Content-Type','application/json');
  return await mutate(new Request(request.url,{method:'POST',headers,body:JSON.stringify({type:'bulkCreateProductBoms',version:body.expectedVersion,requestId:body.requestId,payload:body})}));
 }catch(e:any){return Response.json({error:e.message},{status:400,headers:{'Cache-Control':'no-store'}});}
}
