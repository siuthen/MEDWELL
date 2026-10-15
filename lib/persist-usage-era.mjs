import {migrateUsageEra} from './usage-era.mjs';
export async function readClassifiedState(db){
 for(let attempt=0;attempt<8;attempt++){
  const row=await db.prepare('SELECT version,payload FROM workspace_state WHERE id=?').bind('team').first();
  if(!row)throw new Error('운영 데이터를 찾을 수 없습니다.');
  const state=JSON.parse(row.payload);migrateUsageEra(state);const payload=JSON.stringify(state);
  if(payload===row.payload)return row;
  const saved=await db.prepare('UPDATE workspace_state SET payload=?,version=version+1 WHERE id=? AND version=?').bind(payload,'team',row.version).run();
  if(saved.meta.changes)return {version:row.version+1,payload};
 }
 throw new Error('동시 수정이 발생했습니다. 잠시 후 다시 조회해주세요.');
}
