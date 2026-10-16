# 검증 제품·자재·BOM 일괄 등록 API

## 실행 전 확인

이 action은 배포만으로 실행되지 않는다. 원본 `bom_generation_payload.json`은 앱·Git·초기 데이터에 넣지 않는다. 사용자가 운영에 반영할 때만 아래 endpoint를 호출한다.

- 최신 버전 조회: `GET https://medwell-materials.sharpfir4.chatgpt.site/api/state`
- 일괄 등록: `POST https://medwell-materials.sharpfir4.chatgpt.site/api/product-boms/bulk`
- 헤더: `Content-Type: application/json`
- 본문: 첨부 JSON 전체 그대로. 최상위 키는 `expectedVersion`, `requestId`, `materials`, `products`, `canonicalProductReplacements`다.

첨부 파일의 expectedVersion은 145다. GET 응답의 version과 다르면 파일의 expectedVersion을 최신 값으로 수정하고 내용을 확인한다. 임의로 재시도하며 버전만 자동 갱신하지 않는다. requestId는 최초 요청과 네트워크 재시도에 같은 값을 사용한다. 성공한 requestId는 다시 실행되지 않는다.

```bash
curl --fail-with-body \
  -X POST 'https://medwell-materials.sharpfir4.chatgpt.site/api/product-boms/bulk' \
  -H 'Content-Type: application/json' \
  --data-binary @bom_generation_payload.json
```

유효한 최소 본문 예시(실제 운영에는 첨부 파일 전체 사용):

```json
{
  "expectedVersion": 145,
  "requestId": "example-verified-bom-import",
  "materials": [
    {"code": "EXAMPLE-M", "name": "검증 자재", "unit": "개", "spec": "30ml", "usageEra": "2023_plus"}
  ],
  "products": [
    {
      "code": "EXAMPLE-P", "name": "검증 제품30ml", "unit": "개",
      "version": "V1", "approved": true, "usageEra": "2023_plus",
      "bom": [{"code": "EXAMPLE-M", "qty": 1}]
    }
  ],
  "canonicalProductReplacements": []
}
```

교정 항목은 `{"oldCode":"PT-PR30-BK","newCode":"PT-PR30","ecountName":"T_프라임엑소앰플100ml"}` 형식이다. 기존 제품의 code와 명시된 ecountName만 교정하고 기존 BOM·단위·승인 상태 등은 유지한다. 동일 문자열의 부자재 코드나 BOM 자재코드는 변경하지 않는다.

## 처리 및 실패 조건

모든 제품·자재·BOM·교정을 검증하고 새 마스터 배열과 감사로그를 메모리에서 조립한 뒤 기존 DB version CAS UPDATE 한 번으로 저장한다. 성공 시 버전은 정확히 1 증가하며 감사로그도 1건이다. 신규 제품명·단위·BOM·버전·승인 값은 원문대로 저장한다. 신규 분류는 payload 값을 유지하며 누락 시 unmatched를 사용한다.

신규 제품 코드가 기존 제품(삭제 포함)과 겹치거나 요청 내부에서 중복되면 실패한다. 기존 자재는 활성 상태이고 code/name/unit/spec이 일치할 때만 기존 레코드를 그대로 재사용한다. 기존 자재의 분류 등 다른 메타데이터는 덮어쓰지 않는다. 모든 신규 BOM은 비어 있지 않고, 중복 자재 없이 유한한 숫자 양수 qty여야 하며 활성 자재를 참조해야 한다. 저장 후 기존 BOM을 포함한 모든 자재코드가 자재 마스터에 존재하는지도 검사한다.

제품 교정은 기존 코드가 유일한 활성 제품이고 새 코드가 비어 있을 때만 허용한다. 생산계획, 파일 배치 또는 그 외 현재 데이터에 제품코드 참조가 남아 있으면 전표를 재작성하지 않고 요청 전체를 400으로 거부한다. 알 수 없는 참조도 보수적으로 차단한다. 과거 감사로그는 이력으로 유지하고, 알려진 자재 코드 경로와 기초재고의 자재 키는 제품 참조로 취급하지 않는다.

`opening`, 발주, 입고, 생산계획, 파일 배치, 이동, 조정, 마감 등 운영 데이터는 성공·실패 모두 변경하지 않는다. 신규 자재에도 기초재고나 조정 전표를 만들지 않는다. import 경로에서는 사전 migration이나 seed를 저장하지 않는다.

- 200: 성공 또는 같은 requestId의 재시도. 응답은 기존 state API와 동일한 version/state/financeAuthorized 구조이며 요약은 해당 requestId 감사로그의 payload에 있다.
- 400: 검증 실패, 필수 정보 충돌, 참조가 있는 제품 교정 등. 저장 없음.
- 409: expectedVersion 불일치 또는 DB CAS 충돌. 저장 없음. 최신 내용을 확인한 다음 재요청한다.

기존 `/api/state`도 `type: bulkCreateProductBoms`와 같은 최상위 필드 형식 또는 기존 `{version, requestId, type, payload}` envelope를 지원한다. envelope와 payload에 version/requestId를 중복 지정하면 값이 같아야 한다.

테스트는 최소 fixture와 모의 DB만 사용한다. 배포·테스트 과정에서 첨부 payload를 운영 endpoint로 전송하지 않는다.
