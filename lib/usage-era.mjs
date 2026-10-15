import mapping from '../data/usage-era-classification.json' with {type:'json'};
export const USAGE_ERAS=['2023_plus','pre_2023_only','unmatched'];
export const ERA_LABELS={all:'전체','2023_plus':'2023년 이후','pre_2023_only':'2023년 이전 전용',unmatched:'구매이력 없음'};
export const ERA_TABS=[['all','전체'],['pre_2023_only','2023년 이전']];
export const ERA_MIGRATION='usage-era:2023-01-01:v1';
export const usageEra=record=>USAGE_ERAS.includes(record?.usageEra)?record.usageEra:'unmatched';
export const canProduce=product=>!!product&&(!!product.approved||usageEra(product)==='pre_2023_only');
export function eraCounts(records){const counts={all:records.length,'2023_plus':0,'pre_2023_only':0,'unmatched':0};for(const record of records)counts[usageEra(record)]++;return counts;}
export const filterEra=(records,era)=>records.filter(record=>era==='all'||usageEra(record)===era);
export const productStatus=product=>usageEra(product)==='pre_2023_only'?'2023년 이전 · 확정 불필요':usageEra(product)==='unmatched'?'이력 확인 필요':product.approved?'확인완료':'확인 필요';
export function migrateUsageEra(state){
 const initial=state.migrations?.usageEra!==ERA_MIGRATION;
 for(const key of ['materials','products'])for(const record of state[key]||[]){const mapped=Object.hasOwn(mapping[key],record.code)?mapping[key][record.code]:'unmatched';record.usageEra=initial?(USAGE_ERAS.includes(mapped)?mapped:'unmatched'):usageEra(record);}
 if(initial){state.migrations={...state.migrations,usageEra:ERA_MIGRATION};state.audit??=[];if(!state.audit.some(a=>a.id===ERA_MIGRATION))state.audit.unshift({id:ERA_MIGRATION,at:new Date().toISOString(),actor:'system',type:'usageEraMigration',description:'2023-01-01 구매이력 기준 사용구분 분류 적용',payload:{cutoff:mapping.basis.cutoff,source:mapping.basis.source,materials:eraCounts((state.materials||[]).filter(m=>!m.deleted)),products:eraCounts(state.products||[])}});}
 return state;
}
export function inventoryCsvRows(items,balance,note){return [['품목코드','품목명','규격','김포창고','오류창고','사용구분','비고'],...items.map(m=>{const b=balance(m.code);return [m.code,m.name,m.spec,...['김포창고','오류창고'].map(w=>b.known.length?b[w]:'미확정'),ERA_LABELS[usageEra(m)],note(m.code)];})];}
