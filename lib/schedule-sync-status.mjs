const TABLE='schedule_sync_receipts';
const decode=row=>row?{requestId:row.request_id,confirmedAt:row.confirmed_at,version:row.workspace_version,changed:!!row.changed,counts:JSON.parse(row.counts_json)}:null;
export async function hasSyncReceipts(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(TABLE).first();}
export async function findSyncReceipt(db,id){if(!await hasSyncReceipts(db))return null;return decode(await db.prepare('SELECT * FROM schedule_sync_receipts WHERE request_id=?').bind(id).first());}
export async function latestSyncReceipt(db){
 if(await hasSyncReceipts(db)){const row=await db.prepare('SELECT * FROM schedule_sync_receipts ORDER BY confirmed_at DESC,rowid DESC LIMIT 1').first();if(row)return decode(row);}
 const row=await db.prepare('SELECT payload FROM workspace_state WHERE id=?').bind('team').first();if(!row)return null;
 const audit=(JSON.parse(row.payload).audit||[]).filter(a=>a.type==='scheduleSourceSync'&&Number.isFinite(Date.parse(a.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
 return audit?{requestId:audit.id,confirmedAt:audit.at,version:null,changed:true,counts:audit.payload?.counts||null}:null;
}
export async function ensureSyncReceipts(db){await db.prepare('CREATE TABLE IF NOT EXISTS schedule_sync_receipts (request_id TEXT PRIMARY KEY,confirmed_at TEXT NOT NULL,workspace_version INTEGER NOT NULL,changed INTEGER NOT NULL,counts_json TEXT NOT NULL)').run();}
export function changedReceiptStatement(db,input,result,version,now){return db.prepare('INSERT OR IGNORE INTO schedule_sync_receipts (request_id,confirmed_at,workspace_version,changed,counts_json) SELECT ?,?,?,1,? WHERE changes()=1').bind(input.requestId,now,version,JSON.stringify(result.counts));}
export async function recordNoChange(db,input,result,version,now){return await db.prepare('INSERT OR IGNORE INTO schedule_sync_receipts (request_id,confirmed_at,workspace_version,changed,counts_json) SELECT ?,?,?,0,? WHERE EXISTS (SELECT 1 FROM workspace_state WHERE id=? AND version=?) RETURNING request_id').bind(input.requestId,now,version,JSON.stringify(result.counts),'team',version).first();}
export function formatSyncTime(value){if(!value||!Number.isFinite(Date.parse(value)))return '';return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));}
