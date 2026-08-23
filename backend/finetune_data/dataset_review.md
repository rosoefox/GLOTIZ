# 파인튜닝 데이터셋 검토용 요약

학습 문서 20개, 검증 문서 5개.

## 표준 필드 목록 (객관적, 검토 거의 불필요)
- company_name (기업명, text)
- ceo_name (대표자명, text)
- business_reg_number (사업자등록번호, text)
- founded_date (설립일, date)
- phone_number (연락처, text)
- email (이메일, text)
- company_address (소재지, text)
- website (홈페이지, text)
- main_product (주요제품, text)
- employee_count (종업원수, number)
- annual_revenue (전년도 매출액, number)
- export_performance (수출실적, number)
- bank_name (은행명, text)
- account_number (계좌번호, text)
- account_holder (예금주, text)
- fax_number (팩스번호, text)
- application_date (신청일자, date)
- contact_person (담당자명, text)
- department (부서명, text)
- target_country (희망 참가국가, text)
- business_category (업종, checkbox)
- entity_type (사업자 구분, checkbox)
- company_intro (회사 소개, long_text)

## 장식용/skip 처리 케이스 (실제로 애매할 수 있는 부분 - 확인 부탁)
- "- 1 -" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.
- "신청서 작성 안내 [[빈칸]]" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.
- "※ 아래 내용을 참고하시기 바랍니다 [[빈칸]]" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.
- "(서명 또는 인)" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.
- "붙임 > [[빈칸]]" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.
- "※ [[빈칸]]" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.
- "구분 > [[빈칸]]" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.

## 참고
실제 업로드된 서식(전북소상공인 해외수출지원사업 신청서 등)의 진짜 필드는 아직 포함 안 됨 - 파일을 프로젝트 폴더 안으로 옮겨주시거나 내용을 붙여넣어주시면 이 표준 패턴 위에 실제 서식 기반 예시를 추가할 수 있음.
