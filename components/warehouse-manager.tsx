'use client';

import {useRef,useState} from 'react';
import {Warehouse} from 'lucide-react';

type Action='warehouseCreate'|'warehouseRename'|'warehouseDelete';

export default function WarehouseManager({warehouses,version,onClose,onSaved,onConflict}:{
 warehouses:string[];
 version:number;
 onClose:()=>void;
 onSaved:(result:any)=>void;
 onConflict:()=>Promise<boolean>;
}){
 const [newName,setNewName]=useState('');
 const [renaming,setRenaming]=useState<string|null>(null);
 const [rename,setRename]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null);

 async function change(type:Action,payload:{warehouse?:string;name?:string}){
  if(busy)return;
  const key=JSON.stringify({type,payload});
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  setBusy(true);
  setError('');
  try{
   const response=await fetch('/api/state',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type,payload,expectedVersion:version,requestId:pending.current.id})
   });
   const result:any=await response.json();
   if(!response.ok){
    pending.current=null;
    if(response.status===409)await onConflict();
    throw Error(result.error||'창고 정보를 저장하지 못했습니다.');
   }
   pending.current=null;
   onSaved(result);
   setRenaming(null);
   if(type==='warehouseCreate')setNewName('');
  }catch(e){
   setError(e instanceof Error?e.message:'창고 정보를 저장하지 못했습니다.');
  }finally{
   setBusy(false);
  }
 }

 return <div className="overlay">
  <section className="modal warehouse-manager" role="dialog" aria-modal="true" aria-labelledby="warehouse-title" aria-describedby="warehouse-description">
   <div className="cardhead"><h2 id="warehouse-title">창고 관리</h2><button type="button" className="secondary" disabled={busy} onClick={onClose}>닫기</button></div>
   <div className="warehouse-body">
    <p className="help warehouse-description" id="warehouse-description">창고를 추가하거나 이름을 변경할 수 있습니다. 재고와 사용 기록이 없는 창고만 삭제할 수 있습니다.</p>
    <ul className="warehouse-list">
     {warehouses.map(warehouse=><li key={warehouse}>
      {renaming===warehouse?
       <form className="fields warehouse-form" onSubmit={e=>{e.preventDefault();void change('warehouseRename',{warehouse,name:rename.trim()});}}>
        <label>변경할 창고명<input required maxLength={100} value={rename} onChange={e=>setRename(e.target.value)}/></label>
        <div className="warehouse-actions">
         <button className="primary" disabled={busy||!rename.trim()||rename.trim()===warehouse}>저장</button>
         <button type="button" className="secondary" disabled={busy} onClick={()=>setRenaming(null)}>취소</button>
        </div>
       </form>:
       <><span className="warehouse-name"><Warehouse size={16} aria-hidden="true"/><span>{warehouse}</span></span><div className="warehouse-actions">
        <button className="secondary" disabled={busy} onClick={()=>{setRenaming(warehouse);setRename(warehouse);setError('');}}>이름 변경</button>
        <button className="secondary warehouse-delete" disabled={busy} onClick={()=>{if(confirm(`'${warehouse}' 창고를 삭제할까요?`))void change('warehouseDelete',{warehouse});}}>삭제</button>
       </div></>}
     </li>)}
    </ul>
    <section className="warehouse-create" aria-labelledby="warehouse-create-title">
     <h3 id="warehouse-create-title">새 창고 추가</h3>
     <form className="fields warehouse-form" onSubmit={e=>{e.preventDefault();void change('warehouseCreate',{name:newName.trim()});}}>
      <label>새 창고명<input required maxLength={100} aria-describedby="warehouse-create-help" value={newName} onChange={e=>setNewName(e.target.value)}/></label>
      <button className="primary" disabled={busy||!newName.trim()}>추가</button>
     </form>
     <p id="warehouse-create-help" className="help">새 창고의 모든 품목은 재고 0으로 시작합니다.</p>
    </section>
    {error&&<p className="alert error" role="alert">{error}</p>}
   </div>
  </section>
 </div>;
}
