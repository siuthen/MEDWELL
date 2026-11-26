import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {calendarSchedulesForDate,compareScheduleListRows,isWeekdayDate,nextWeekdayDate,scheduleDisplayFields,scheduleDates,scheduleKindLabel,scheduleLabel,scheduleOverlapsMonth,scheduleType,showOnCalendar,weekdayCalendar} from '../lib/schedule-view.mjs';
test('기존 QC·입고 데이터는 호환되고 구분 문구는 별도 작은 배지로 분리',()=>{const records=JSON.parse(readFileSync(new URL('../data/purchase-calendar-records.json',import.meta.url)));assert.equal(records.length,38);for(const r of records){assert.equal(scheduleType(r),'receipt');assert.equal(scheduleKindLabel(r),'입고');assert.doesNotMatch(scheduleLabel(r),/^입고:/);assert.equal(showOnCalendar(r),true);assert.equal(isWeekdayDate(r.date),true)}});
test('기간 일정은 주말을 건너뛰고 월 경계를 포함',()=>{const r={date:'2026-11-27',endDate:'2026-12-02',scheduleKind:'manufacturing',title:'제조'};assert.deepEqual(scheduleDates(r),['2026-11-27','2026-11-30','2026-12-01','2026-12-02']);assert.equal(scheduleOverlapsMonth(r,'2026-11'),true);assert.equal(scheduleOverlapsMonth(r,'2026-12'),true);assert.equal(scheduleType(r),'manufacturing');assert.equal(scheduleKindLabel(r),'제조')});
test('월~금 5열과 기간·색상·3종 배지 UI를 제공',()=>{const calendar=weekdayCalendar('2026-10'),ui=readFileSync(new URL('../components/schedule-manager.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');assert.equal(calendar.dates.length,22);assert.equal(nextWeekdayDate('2026-10-24'),'2026-10-26');assert.match(ui,/\['월','화','수','목','금'\]/);for(const text of ['시작일','종료일','입고','QC','제조','schedule-color-palette'])assert.match(ui,new RegExp(text));assert.match(css,/schedule-kind-badge\.receipt/);assert.match(css,/schedule-kind-badge\.qc/);assert.match(css,/schedule-kind-badge\.manufacturing/);assert.match(css,/schedule-calendar\{[^}]*repeat\(5/)});
test('등록된 일정은 원본 여부와 관계없이 종류 선택을 잠금',()=>{const ui=readFileSync(new URL('../components/schedule-manager.tsx',import.meta.url),'utf8');assert.match(ui,/disabled=\{!!edit\.id\}/);});

test('입고와 QC 본문에는 수량·업체·여러 줄 비고가 유지되고 배지만 색으로 구분',()=>{
 for(const scheduleKind of ['receipt','qc']){
  assert.equal(scheduleLabel({scheduleKind,itemName:'자재',quantity:0,vendor:'공급 업체',note:'첫 줄\n다음 줄'}),'자재 0 [공급 업체] 첫 줄\n다음 줄');
 }
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(css,/\.schedule-range-item\{[^}]*background:transparent/);
 assert.match(css,/\.schedule-range-item>span:last-child\{[^}]*white-space:pre-wrap;overflow-wrap:anywhere;color:#000/);
 assert.doesNotMatch(css,/\.schedule-range-item\.(?:receipt|qc)\{[^}]*background:/);
});

test('리스트에서 시작일, 입고·QC·제조, 같은 종류의 기존 ID 순으로 정렬',()=>{
 const date='2026-11-02';
 const rows=[
  {id:'a-manufacturing',date,scheduleKind:'manufacturing'},
  {id:'z-receipt',date,sourceType:'receipt'},
  {id:'b-qc',date,sourceType:'qc'},
  {id:'c-receipt',date,scheduleKind:'receipt'},
  {id:'a-qc',date,scheduleKind:'qc'},
  {id:'earlier',date:'2026-10-30',scheduleKind:'manufacturing'}
 ];
 assert.deepEqual(rows.toSorted(compareScheduleListRows).map(row=>row.id),[
  'earlier','c-receipt','z-receipt','a-qc','b-qc','a-manufacturing'
 ]);
});

test('달력에서 여러 날짜의 제조 일정은 매일 입고·QC 뒤에 표시되고 종류 안에서 기존 순서를 유지',()=>{
 const records=[
  {id:'z-range',date:'2026-10-30',endDate:'2026-11-03',scheduleKind:'manufacturing'},
  {id:'a-range',date:'2026-11-02',endDate:'2026-11-03',scheduleKind:'manufacturing'},
  ...['2026-11-02','2026-11-03'].flatMap(date=>[
   {id:'a-qc:'+date,date,sourceType:'qc'},
   {id:'z-receipt:'+date,date,sourceType:'receipt'}
  ])
 ].sort(compareScheduleListRows);
 const before=structuredClone(records);
 for(const date of ['2026-11-02','2026-11-03']){
  assert.deepEqual(calendarSchedulesForDate(records,date).map(row=>row.id),[
   'z-receipt:'+date,'a-qc:'+date,'z-range','a-range'
  ]);
 }
 assert.deepEqual(records,before);
});

test('제조 표시용 formatter는 수량을 숨기고 제품명·비고와 원본 데이터를 보존',()=>{
 const row={scheduleKind:'manufacturing',title:'리젠 크림 50ml',quantity:12345,plannedQty:12345,vendor:'공급 업체',note:'포장 전 QC\n별도 확인'};
 const before=structuredClone(row);
 assert.deepEqual(scheduleDisplayFields(row),{name:'리젠 크림 50ml',quantity:'',vendor:'',note:'포장 전 QC\n별도 확인'});
 assert.equal(scheduleLabel(row),'리젠 크림 50ml 포장 전 QC\n별도 확인');
 assert.deepEqual(row,before);
 assert.equal(scheduleDisplayFields({...row,scheduleKind:'receipt'}).quantity,'12345');
});

test('달력 본문·툴팁·접근성 이름과 리스트가 공통 formatter를 사용하고 왼쪽으로 줄맞춤',()=>{
 const ui=readFileSync(new URL('../components/schedule-manager.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(ui,/scheduleDisplayFields\(r\);return \[/);
 assert.match(ui,/aria-label=\{scheduleKindLabel\(r\)\+' '\+scheduleLabel\(r\)\} title=\{scheduleLabel\(r\)\}/);
 assert.match(ui,/<span>\{scheduleLabel\(r\)\}<\/span>/);
 assert.match(ui,/계획수량<input[^>]+value=\{edit.qty\}/);
 assert.match(css,/\.schedule-range-item\{[^}]*justify-content:flex-start[^}]*text-align:left/);
 assert.match(css,/\.schedule-range-item>span:last-child\{[^}]*white-space:pre-wrap[^}]*font-size:\.75rem/);
 assert.match(css,/\.schedule-range-item \.schedule-kind-badge\{[^}]*font-size:\.625rem[^}]*text-align:left/);
});
