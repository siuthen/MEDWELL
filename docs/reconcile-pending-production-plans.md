# 미반영 생산계획 재연결

배포는 운영 state를 변경하지 않습니다. `GET /api/state`도 재연결을 수행하지 않습니다.
제품/BOM 저장(`productSave`), 승인(`approveBom`), 일괄 등록(`bulkCreateProductBoms`)은
승인·유효 BOM과 연결 가능한 미반영 계획을 같은 CAS 저장 안에서 처리합니다.

기존 미반영 계획은 아래 명령으로 처리합니다.

- POST URL: `https://medwell-materials.siuthen.chatgpt.site/api/state`
- Content-Type: `application/json`
- 요청 예시(실행 직전 GET에서 확인한 version을 사용):

```json
{
  "type": "reconcilePendingProductionPlans",
  "expectedVersion": 397,
  "requestId": "medwell-reconcile-pending-20261112-01",
  "payload": {}
}
```

같은 요청번호로 재시도하면 버전이 바뀌어도 중복 반영하지 않습니다.
다른 직원의 저장으로 409가 반환되면 최신 상태를 읽고 검토한 뒤 동일 요청번호와 최신 버전으로 재시도합니다.
응답 형식은 기존과 동일한 `{version,state,...}`입니다.

검증할 값:

- `state.audit`에서 해당 requestId의 `payload.plans`, `payload.skipped`
- 연결 계획의 `product`, `lines`, `lines[].warehouseAllocations`, `reconciliation`, `note`
- 계획 ID·입력 순서·계획일·계획수량 보존 및 미매칭 계획의 빈 lines 유지
- 소요량 합산과 재고 차감, 다른 업무 컬렉션 불변

명시적 명령은 `productions`, 요약 `audit` 1건, `processed` 요청번호만 변경합니다.
매칭되지 않거나 BOM이 미승인/무효인 계획, 마감월, 취소/삭제/교체 계획은 제외됩니다.
이미 lines가 저장된 계획은 다시 계산하지 않습니다.
