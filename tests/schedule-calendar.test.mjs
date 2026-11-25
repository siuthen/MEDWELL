import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {isWeekdayDate,nextWeekdayDate,scheduleDates,scheduleKindLabel,scheduleLabel,scheduleOverlapsMonth,scheduleType,showOnCalendar,weekdayCalendar} from '../lib/schedule-view.mjs';
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
