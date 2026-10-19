export async function readClosingOverrides(db,month){
 const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='closing_price_overrides'").first();
 if(!table)return {};
 const result=await db.prepare('SELECT receipt_id,code,unit_price,revision FROM closing_price_overrides').all();
 return Object.fromEntries(result.results.map(r=>[r.receipt_id,{code:r.code,price:r.unit_price,revision:r.revision}]));
}
export async function saveClosingPrice(db,p,now=new Date().toISOString()){
 if(!p||typeof p.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)||typeof p.receiptId!=='string'||!p.receiptId.trim()||typeof p.code!=='string'||p.code!==p.code.trim()||!['number','string'].includes(typeof p.price)||!String(p.price).trim()||!Number.isFinite(Number(p.price))||Number(p.price)<0||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||typeof p.requestId!=='string'||!p.requestId.trim())throw Error('품목코드·단가·수정 버전·요청번호를 확인하세요.');
 const code=p.code,price=Number(p.price);
 const state=await db.prepare('SELECT payload FROM workspace_state WHERE id=?').bind('team').first();
 if(state&&JSON.parse(state.payload).closes?.[p.month])throw Error('확정된 마감월입니다. 먼저 마감을 해제하세요.');
 const receipt=state&&JSON.parse(state.payload).receipts.find(r=>r.id===p.receiptId&&!r.cancelled&&!r.deleted);
 if(!receipt||receipt.code!==code||!receipt.date.startsWith(p.month+'-'))throw Error('해당 마감월의 입고 내역을 확인하세요.');
 await db.prepare('CREATE TABLE IF NOT EXISTS closing_price_overrides (receipt_id TEXT PRIMARY KEY, month TEXT NOT NULL, code TEXT NOT NULL, unit_price REAL NOT NULL CHECK(unit_price>=0), revision INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL)').run();
 const prior=await db.prepare('SELECT receipt_id,month,code,unit_price,revision,request_id FROM closing_price_overrides WHERE request_id=?').bind(p.requestId).first();
 if(prior){if(prior.receipt_id!==p.receiptId||prior.month!==p.month||prior.code!==code||prior.unit_price!==price)throw Error('같은 요청번호의 내용이 다릅니다.');return {code,price,revision:prior.revision};}
 const row=await db.prepare('INSERT INTO closing_price_overrides (receipt_id,month,code,unit_price,revision,request_id,updated_at) SELECT ?,?,?,?,1,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM closing_price_overrides WHERE receipt_id=? AND revision=?) ON CONFLICT(receipt_id) DO UPDATE SET month=excluded.month,code=excluded.code,unit_price=excluded.unit_price, revision=closing_price_overrides.revision+1, request_id=excluded.request_id, updated_at=excluded.updated_at WHERE closing_price_overrides.revision=? RETURNING code,unit_price,revision').bind(p.receiptId,p.month,code,price,p.requestId,now,p.expectedRevision,p.receiptId,p.expectedRevision,p.expectedRevision).first();
 if(!row)throw Error('다른 사용자가 단가를 수정했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.');
 return {code:row.code,price:row.unit_price,revision:row.revision};
}
