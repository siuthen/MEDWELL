'use client';

import {useRef,useState} from 'react';

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
  <section className="modal" role="dialog" aria-modal="true" aria-labelledby="warehouse-title">
   <div className="cardhead"><h2 id="warehouse-title">창고 관리</h2><button type="button" className="secondary" disabled={busy} onClick={onClose}>닫기</button></div>
   <ul className="warehouse-list">
    {warehouses.map(warehouse=><li key={warehouse}>
     {renaming===warehouse?
      <form onSubmit={e=>{e.preventDefault();void change('warehouseRename',{warehouse,name:rename.trim()});}}>
       <label>변경할 창고명<input required maxLength={100} value={rename} onChange={e=>setRename(e.target.value)}/></label>
       <div className="rowactions">
        <button className="primary" disabled={busy||!rename.trim()||rename.trim()===warehouse}>저장</button>
        <button type="button" className="secondary" disabled={busy} onClick={()=>setRenaming(null)}>취소</button>
       </div>
      </form>:
      <><span>{warehouse}</span><div className="rowactions">
       <button className="secondary" disabled={busy} onClick={()=>{setRenaming(warehouse);setRename(warehouse);setError('');}}>이름 변경</button>
       <button className="secondary negative" disabled={busy} onClick={()=>{if(confirm(`'${warehouse}' 창고를 삭제할까요?`))void change('warehouseDelete',{warehouse});}}>삭제</button>
      </div></>}
    </li>)}
   </ul>
   <form onSubmit={e=>{e.preventDefault();void change('warehouseCreate',{name:newName.trim()});}}>
    <label>새 창고명<input required maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)}/></label>
    <div className="modalfoot"><button className="primary" disabled={busy||!newName.trim()}>추가</button></div>
   </form>
   {error&&<p className="alert error" role="alert">{error}</p>}
  </section>
 </div>;
}
