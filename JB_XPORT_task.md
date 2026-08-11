# JB-XPORT 개발 Task List

> 기준 문서: `JB-XPORT_PRD.docx` (v0.1) + UI design 10건
> 우선순위 기준: PRD 11.2 구현 우선순위(문서자동화→RAG→마케팅→부가기능) × 기능별 P0/P1 등급
> 상태: 초안 — 2차 팀 논의를 통해 범위·순서 확정 예정

---

## Phase 0. 프로젝트 기반 설정

- [ ] Git 저장소 초기화 및 원격 저장소(GitHub 등) 연결
- [ ] 프런트엔드/백엔드 프로젝트 스캐폴딩 (웹 UI 반응형 기준)
- [ ] 시스템 아키텍처 4계층 구성: 프런트엔드 - 백엔드 API(Cloud Run) - Gemini 생성 모듈 - RAG 지식베이스 (PRD 9)
- [ ] 원본 문서 저장소(Cloud Storage) 연동 (원산지증명서, 쇼피 정책 PDF 등)
- [ ] 인증 데이터·거래 데이터 암호화 설계 (전송 구간 TLS, 저장 구간 암호화) (PRD 6 보안)
- [ ] 디자인 시스템 정의: 컬러(Primary Blue), 타이포, 컴포넌트 라이브러리 — UI design 10건 스타일 기준 통일
- [ ] 공통 레이아웃 컴포넌트: 좌측 사이드바(Dashboard/Analysis/Projects/Documents/Marketing), 상단 GNB(Market Analysis/Gov Support/Docs/Tools), 우하단 플로팅 챗봇 아이콘

---

## Phase 1. 문서 자동화 핵심 플로우 — F-01, F-02 [P0] (최우선)

### F-01. 온보딩 및 제품 정보 입력
> 참고 화면: `1_first page.png`(대시보드 검색 진입), `6_input_detail.png`(Export Document Information 입력 폼)

- [ ] 대시보드 진입 화면 UI 구현 — "무엇을 팔고 싶나요?" 검색창, 최근 검색/인기 키워드 칩, 이미지 검색 아이콘
- [ ] 목표 선택 플로우: 수출 서류 작성 / 마케팅 콘텐츠 제작 목표 분기
- [ ] Export Document Information 폼 구현: Exporter Information(회사명, Tax ID, 주소), Consignee Information(수하인명, 목적국), Item Details(품목 설명, HS코드, 수량)
- [ ] 복수 품목 등록 기능 (Add Item / Remove)
- [ ] 필수 입력 항목 유효성 검사 로직 (사업자등록번호, 주소 등)
- [ ] '이전 정보 불러오기' 기능 — 직전 입력값 재사용
- [ ] 필수값 누락 시 '서류 생성하기' 버튼 비활성화/오류 안내
- [ ] '서류 양식 보기' 미리보기 기능

### F-02. 수출 통관·계약 서류 자동 생성
> 참고 화면: `7_document_detail.png`(Document Preview — AI Filled)

- [ ] 서류 템플릿 DB 구축: 상업송장(Commercial Invoice), 포장명세서(Packing List), 원산지증명서(C/O)
- [ ] 백엔드: 입력 정보 → 서류 템플릿 자동 채움 API
- [ ] HS코드 추천 로직 (품목 설명 기반 Gemini 프롬프트 설계)
- [ ] Incoterms(DDP 등) 자동 반영 로직
- [ ] Document Preview 화면 구현: AI 자동 채움 필드 하이라이트(노란색) 표시
- [ ] "AI Filling Complete" 검수 체크리스트 UI (Consignee Address verified / HS Codes suggested / Incoterms applied)
- [ ] '수정하기(Edit)' 경로 — 모든 필드 편집 가능
- [ ] '제출하기(Submit)' 액션 및 상태 처리
- [ ] PDF 등 다운로드 가능한 형식으로 내보내기
- [ ] 문서 하단 면책 문구 자동 삽입("AI가 생성한 초안이며 전문가 검토 필요")
- [ ] 서류 생성 소요 시간 1분 이내 성능 목표 검증

---

## Phase 2. RAG 연동 — F-05 [P0]

### F-05. 지원사업 매칭 및 근거 조회(RAG)
> 참고 화면: `4_government_support.png`

- [ ] RAG 지식베이스 구축 (Vertex AI RAG Engine 등) — 지원사업 공고 데이터 청크 분할·임베딩
- [ ] 데이터 수집: 기업마당, KOTRA 무역투자24, 수출바우처 포털 공고 정기 수집 파이프라인
- [ ] Government Support Projects 목록 화면 구현: 카드형 UI(예산 한도, 마감일 D-day, 카테고리 배지)
- [ ] High Match 배지 로직 — 적합도 기반 정렬/강조
- [ ] 마감 임박(D-7 이내) 사업 별도 색상 강조 표시
- [ ] '내가 선택할 수 있는 지원사업 보기' — AI 개인화 추천 재계산 버튼
- [ ] 검색창: 키워드/산업/지역 기준 직접 탐색 기능
- [ ] Filters 패널 구현
- [ ] 지원사업 데이터 출처 표기(공공데이터포털, 기업마당, KOTRA 등)
- [ ] 공공데이터포털 API 신청 및 연동 가능성 확인 (리스크 대응: 대체 출처/샘플 데이터 우선 개발)

---

## Phase 3. 마케팅 기획안 생성 — F-08 [P0]

### F-08. 카드뉴스형 상세페이지 생성
> 참고 화면: `8_marketing.png`(Marketing Material Creator)

- [ ] 상품 사진 업로드 컴포넌트 (드래그앤드롭, SVG/PNG/JPG/GIF 지원)
- [ ] 템플릿 선택 UI: Modern Minimal / B2B Spec Sheet / Promo Banner 등 (카테고리 필터: All/Social Media/B2B Catalog/Banners)
- [ ] '기존 서류 정보 불러오기' — F-01/F-02 제품 정보(제품명, 설명, 스펙, 가격) 자동 반영
- [ ] 실시간 미리보기 화면: 자동 채움 항목 표시 + 출처(Doc #) 배지("Auto-filled from Doc #892")
- [ ] 미리보기에서 문구·이미지 직접 수정 기능
- [ ] 멀티 카드(슬라이드) 추가/순서 변경 기능
- [ ] '이미지 저장' — 완성 카드뉴스 다운로드 기능
- [ ] Gemini 기반 문구 자동 생성 프롬프트 설계 (제품 스펙 → 마케팅 카피)

---

## Phase 4. 다국어 문서 번역/현지화 — F-03 [P0]

> 참고 화면: `10_translate.png`(Docs — Commercial Invoice EN→KO 번역 편집기)

- [ ] 2단 대조 번역 편집기 UI: Source(원문) / Target(번역) 좌우 뷰
- [ ] 언어쌍 선택 컴포넌트 (EN → KO 등, MVP는 1~2개 목표 언어)
- [ ] '번역(원문 변환)' 버튼 — 전체 문서 일괄 번역 API 연동
- [ ] 'AI 채우기' 버튼 — 비어 있는 대상 언어 필드 채우기
- [ ] AI 번역 영역 하이라이트 + 'AI Translated' / 'AI Suggestions applied' 배지 표시
- [ ] 필드/문단 단위 개별 수정 기능
- [ ] Undo/Redo 아이콘 및 로직
- [ ] 'Export PDF' / 'Save Changes' 기능

---

## Phase 5. UI 고도화 및 부가 기능 [P1]

### F-06. 필수 제출서류 체크리스트
> 참고 화면: `5_document.png`

- [ ] 목적국·품목 기반 필수 서류 목록 로직 (상업송장/포장명세서/원산지증명서 등)
- [ ] 체크리스트 UI: 업로드 완료/대기 상태 표시
- [ ] AI 작성 지원 가능 서류 배지 표시 (예: 원산지증명서)
- [ ] '추가 제출 서류 입력하기' — 목적국별 특수 서류 추가 기능
- [ ] 서류별 용도 설명 텍스트 표시

### F-07. 시장 분석 및 수요 인사이트
> 참고 화면: `2_analysis.png`(Market Analysis)

- [ ] AI Executive Summary 카드 UI + 핵심 키워드 하이라이트
- [ ] Analysis Parameters 필터: Category(HS Code) / Target Market / Peak Seasonality 체크박스 그룹
- [ ] 'Update Analysis' 버튼 — 필터 조합 기반 재분석
- [ ] Seasonal Export Volume 막대 차트 (피크 구간 강조)
- [ ] Key Market Drivers 카드 리스트 (기후/소비자 선호/성장률 등 근거 표시)
- [ ] 관세청 수출 데이터·이커머스 트렌드 데이터 소스 연동

### F-04 / F-09. 고객지원 — 1:1 지자체 문의 + AI 챗봇
> 참고 화면: `9_chatbot.png`(Help & FAQ)

- [ ] 전 화면 공통 플로팅 챗봇 아이콘 구현 (우하단 고정)
- [ ] "How can we help you?" 헬프 센터 메인 화면
- [ ] 1:1 AI 챗봇 상담 배너 + 'Start Chat Now' 진입
- [ ] 카테고리 바로가기: Market Entry / Documentation / Tariffs & Taxes / Logistics
- [ ] FAQ 아코디언 컴포넌트 (클릭 시 펼침)
- [ ] 챗봇 답변에 근거 자료(지원사업/서식 데이터) 인용 기능
- [ ] F-04: 지자체 담당자 1:1 문의 채널 — 서류 첨부/링크 연결 기능
- [ ] F-04: 문의 유형 템플릿(서류 적합성/지원사업 자격/서식 오류) 선택 기능
- [ ] F-04: AI 1차 검토 코멘트 자동 생성 (누락 항목, 참고 규정)
- [ ] F-04: 담당자용 문의 목록·답변 관리 화면
- [ ] F-04: 답변 상태(대기/답변완료) 표시 및 알림
- [ ] F-04: 문의·답변 이력 저장 및 조회

### F-10. 인증 및 계정 관리
> 참고 화면: `3_login.png`

- [ ] 로그인 화면 UI: ID/PW 입력, Remember me, Forgot Password
- [ ] Google 소셜 로그인 연동
- [ ] Enterprise SSO 연동 (기관용)
- [ ] Sign up(회원가입) 플로우
- [ ] 비로그인 상태 체험 가능 범위 정의 (시장 분석 조회 등) vs 로그인 필요 기능(서류 생성·저장) 분리
- [ ] 비로그인 상태에서 서류 생성 시도 시 로그인 화면 리다이렉트
- [ ] 지자체 라이선스 계정용 다건 기업 관리 대시보드 권한 설계 (B2G 모델 연계)

---

## Phase 6. 비기능 요구사항 반영

- [ ] 성능: 페이지 최초 로딩 3초 이내, 서류 생성 평균 1분 이내 목표 검증
- [ ] 가용성: MVP 파일럿 기준 가동률 99% 목표, 장애 안내 UI
- [ ] 다국어 확장 가능 구조 설계 (MVP 1~2개 언어 → 확장 대비)
- [ ] RAG 지식베이스 무중단 갱신 구조 (신규 지원사업/서식 재학습 없이 반영)
- [ ] 감사·추적: AI 생성물 수정 이력, 서류 제출 이력 로그 저장
- [ ] 전 서류·번역 결과에 면책 문구("AI 생성 초안, 전문가 검토 필요") 공통 삽입 로직
- [ ] SNS 레퍼런스 등 외부 수집 데이터 비식별 처리·저작권 검토

---

## Phase 7. 검증 및 출시 준비

- [ ] KPI 계측 연동: 입력→초안 생성 완료율, 생성 소요 시간, 수정 비율, 재방문율 이벤트 로깅
- [ ] 인앱 만족도 설문(5점 척도) 컴포넌트
- [ ] 최소 1건 이상 이해관계자(지자체 또는 소상공인) 파일럿 테스트 진행
- [ ] 전체 6단계 사용자 흐름 통합 테스트: 로그인 → 제품정보입력 → RAG조회 → 서류/콘텐츠 생성 → 검토·수정 → 다운로드/지원사업 확인
- [ ] 반응형 웹 UI 크로스 브라우저/디바이스 QA
- [ ] B2G/B2B Freemium 요금제 구조에 따른 기능 접근 제어(플랜별 월 생성 건수 제한 등) 구현

---

## 참고: 화면 ↔ 기능 매핑 요약

| UI 파일 | 화면명 | 매핑 기능 |
|---|---|---|
| `1_first page.png` | 대시보드 진입 | F-01 |
| `2_analysis.png` | Market Analysis | F-07 |
| `3_login.png` | 로그인 | F-10 |
| `4_government_support.png` | Gov Support | F-05 |
| `5_document.png` | 필수 수출서류 체크리스트 | F-06 |
| `6_input_detail.png` | Export Document Information | F-01, F-02 |
| `7_document_detail.png` | Document Preview (AI Filled) | F-02 |
| `8_marketing.png` | Marketing Material Creator | F-08 |
| `9_chatbot.png` | Help & FAQ / 챗봇 | F-04, F-09 |
| `10_translate.png` | 번역 편집기 | F-03 |
