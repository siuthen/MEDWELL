// Synthetic minimal layout, not a copy of the uploaded workbook.
export function minimalPlanReport(){
 const rows=[];
 rows[0]=[];rows[0][4]='제품생산계획수량';
 rows[5]=[];Object.assign(rows[5],{1:'순번',2:'품명',3:'용량',9:'제품 계획 보고란'});
 rows[6]=[];rows[6][9]='계획수량';
 const locations=[8,14,18,21,24,27,30,33,36,41,44,47,50,53,57,61,66,71,75,78,81,84,87,91,95,99,102,106,110,116,120];
 locations.forEach((at,i)=>{rows[at-1]=[];Object.assign(rows[at-1],{1:`${i+1}-10월\n(추가)`,2:'테스트 제품 '+i,3:'50',9:100});});
 rows[32][2]='프라임 클린징 마스크';rows[32][3]='1000';
 rows[35][9]='1500개';rows[40][9]='2000박스';rows[119][9]='500박스';
 rows[74][2]='프라임 클린징 마스크';rows[74][3]='7';
 rows[77][2]='디악 아키덤 크림';rows[77][3]='5';
 rows[115][2]='프라임 클린징 마스크';rows[115][3]='100';
 rows[8]=[];rows[8][15]='부자재 세부 행';rows[8][17]='5000개';
 rows[120]=[];Object.assign(rows[120],{1:'합계',2:'보고 합계',3:'50',9:500});
 return {format:'xlsx',name:'26.10-11월계획',rows:Array.from(rows,r=>r||[])};
}
