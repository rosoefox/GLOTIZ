const logoUrl = new URL("../../로고최종1.png", import.meta.url).href;
const profileGreenLiving = new URL("../../profile/그린리빙.png", import.meta.url).href;
const profileMisoFood = new URL("../../profile/미소식품.png", import.meta.url).href;
const profileOurHangwa = new URL("../../profile/우리한과.png", import.meta.url).href;
const profileCosmoTrade = new URL("../../profile/코스모트레이드.png", import.meta.url).href;
const profileTechGlobal = new URL("../../profile/테크글로벌무역.png", import.meta.url).href;
const profileHappyCosmetic = new URL("../../profile/해피코스메틱.png", import.meta.url).href;

// UI 전용 더미 데이터 (백엔드/AI 연동 없음)
export const brand = {
  name: "GLOTIZ",
  tagline: "GLOBAL BUSINESS SOLUTION",
  logo: logoUrl,
};

export const user = {
  name: "김해피",
  role: "대표",
  company: "해피코스메틱",
  avatarUrl: "",
  loginId: "haepy2024",
  email: "haepy@happycosmetic.co.kr",
  phone: "010-1234-5678",
};

export const nav = {
  top: [
    { path: "/gov-support", label: "수출지원사업" },
    { path: "/marketing", label: "AI 이미지 생성", requiresAuth: true },
    { path: "/shopee", label: "해외 수출 플랫폼 입점 가이드", requiresAuth: true },
    { path: "/help", label: "고객지원" },
  ],
};

export const myPage = {
  title: "마이페이지",
  subtitle: "계정 정보를 확인하고 관리하세요.",
  sectionTitle: "기본 정보",
  fields: {
    loginId: "아이디",
    name: "이름",
    email: "이메일",
    phone: "전화번호",
    company: "회사명",
  },
  editButtonLabel: "정보 수정",
  saveButtonLabel: "저장",
  cancelButtonLabel: "취소",
  dangerZone: {
    title: "회원 탈퇴",
    description: "탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.",
    buttonLabel: "회원 탈퇴",
    confirmMessage: "정말로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
  },
  exportItemsTitle: "나의 수출품목",
  exportItemsSubtitle: "수출 진행 현황과 서류 제출 현황을 확인하세요.",
  viewAllLabel: "전체 보기",
  docStatusLabel: "서류 제출 현황",
  docsCardTitle: "사업 서류",
  docsCardSubtitle: "사업자 등록증과 상품 상세설명서를 등록해두면 서류 작성 시 활용할 수 있어요.",
};

export const myApplicationStatus = {
  title: "나의 지원사업 현황",
  subtitle: "제출한 서류의 심사 진행 상황을 확인하세요.",
  needsRevisionAlert: "보완이 필요한 서류가 {count}건 있어요. 아래에서 확인해주세요.",
  emptyMessage: "아직 서류를 제출한 지원사업이 없습니다.",
  documentsEmptyMessage: "제출한 서류가 없습니다.",
  statusLabels: {
    reviewing: "심사진행중",
    needsRevision: "서류보완필요",
    approved: "심사완료",
  },
  statusDotClasses: {
    reviewing: "bg-blue-400",
    needsRevision: "bg-red-500",
    approved: "bg-emerald-500",
  },
};

export const submissionReview = {
  checkingLabel: "제출 내용 AI 검토 중...",
  approvedMessage: "제출 내용이 AI 검토를 통과했습니다.",
  needsRevisionPrefix: "보완이 필요합니다",
};

export const myExportItems = {
  title: "나의 수출품목",
  subtitle: "등록한 수출 품목과 진행 상태를 한눈에 확인하세요.",
  addButtonLabel: "새 품목 등록",
  categoryOptions: ["생활용품", "화장품", "식품", "패션잡화", "전자기기", "기타"],
  tableHeaders: {
    name: "품목명",
    basicInfo: "기본 정보 수정",
    category: "카테고리",
    destination: "목적국",
    status: "진행 상태",
    govPrograms: "진행 지원사업",
    updatedAt: "최근 업데이트",
    action: "액션",
  },
  statusLabels: {
    inProgress: "서류 준비중",
    ready: "제출 준비 완료",
    submitted: "제출 완료",
  },
  statusTone: {
    inProgress: "neutral",
    ready: "warning",
    submitted: "success",
  },
  basicInfoButtonLabel: "기본 정보 수정",
  basicInfoDoneLabel: "완성",
  basicInfoPendingLabel: "미완성",
  actionLabel: "진행 현황 확인",
  programsLabel: "신청한 지원사업 공고",
  noProgramsMessage: "아직 신청한 지원사업이 없습니다. 수출지원사업 페이지에서 신청해보세요.",
  progressTitle: "제출 서류 진행률",
  progressEmptyMessage: "등록된 제출 서류가 없습니다.",
  progressStatusLabels: {
    not_submitted: "미제출",
    pending: "검토 중",
    approved: "제출 완료",
    needs_revision: "보완 필요",
  },
  revisionBannerLabel: "건의 서류에 보완이 필요합니다. 아래에서 확인해주세요.",
  items: [
    {
      id: "item-001",
      name: "AeroTherm Pro 스마트 보틀",
      category: "생활용품",
      destination: "미국",
      status: "submitted",
      basicInfoDone: true,
      govPrograms: [],
      updatedAt: "2024. 10. 20",
    },
    {
      id: "item-002",
      name: "워터젤 선크림 SPF50+",
      category: "화장품",
      destination: "베트남",
      status: "ready",
      basicInfoDone: true,
      govPrograms: [],
      updatedAt: "2024. 10. 18",
    },
    {
      id: "item-003",
      name: "전통 발효 고추장 세트",
      category: "식품",
      destination: "태국",
      status: "inProgress",
      basicInfoDone: false,
      govPrograms: [],
      updatedAt: "2024. 10. 12",
    },
  ],
};

export const dashboard = {
  heroLines: [
    "수출 지원사업 신청부터",
    "해외 판매·마케팅까지,",
    "GLOTIZ가",
    "글로벌 비즈니스의 시작을 함께합니다.",
  ],
  availablePrograms: 128,
  announcementsLabel: "지원사업공고",
  programStats: [
    { label: "최신공고", count: 12 },
    { label: "마감임박", count: 5 },
    { label: "인기공고", count: 8 },
  ],
  cardNewsLabel: "지원사업 카드뉴스",

  statsHeadline: "전북 수출기업이 가장 많이 찾는 파트너, GLOTIZ",
  stats: [
    { label: "총 진행건수", value: 1842, suffix: "건" },
    { label: "매칭기업수", value: 356, suffix: "개사" },
    { label: "매칭사업건수", value: 128, suffix: "건" },
    { label: "기업만족비율", value: 98.7, suffix: "%", decimals: 1 },
  ],

  ongoingProgramsTitle: "진행 중인 지원사업",
  ongoingProgramsMoreLabel: "진행중인 지원사업 더보기",

  featuresTitle: "GLOTIZ로 서류 작성/디자인 고민을 해결해보세요!",
  features: [
    {
      icon: "projects",
      tone: "blue",
      title: "수출지원사업",
      description: "지금 신청 가능한 정부 수출지원사업을 찾아보고 필요한 서류까지 한 곳에서 준비하세요.",
      linkLabel: "지원사업 보기",
      to: "/gov-support",
    },
    {
      icon: "imageGenerate",
      tone: "cream",
      title: "AI 이미지 생성",
      description: "상품 사진 한 장으로 마케팅에 바로 쓸 수 있는 이미지를 AI가 만들어드려요.",
      linkLabel: "이미지 생성하러 가기",
      to: "/marketing",
    },
    {
      icon: "globe",
      tone: "mint",
      title: "해외 수출 플랫폼 입점 가이드",
      description: "쇼피 등 해외 판매 플랫폼 입점에 필요한 정보를 정리해서 안내해드려요.",
      linkLabel: "입점 가이드 보기",
      to: "/shopee",
    },
  ],

  caseStudiesTitle: "AI · 디자인 진행 사례",
  caseStudiesDescription: "GLOTIZ AI가 함께 완성한 서류와 디자인 결과물을 만나보세요.",
  caseStudies: [
    { id: "case-01", title: "워터 에센스 세럼 디자인 포스터", tag: "패키지 디자인", tone: "sunrise", icon: "sparkle", image: "/case-studies/case-01.jpg" },
    { id: "case-02", title: "전통 발효 고추장 세트 브랜드 포스터", tag: "브랜드 무드보드", tone: "forest", icon: "formulation", image: "/case-studies/case-02.jpg" },
    { id: "case-03", title: "글로벌 마켓 플랫폼 앱 상세페이지", tag: "상세페이지", tone: "ocean", icon: "electronics", image: "/case-studies/case-03.jpg" },
    { id: "case-04", title: "워터젤 선크림 SPF50+ 포스터", tag: "배너 디자인", tone: "grape", icon: "sparkle", image: "/case-studies/case-04.jpg" },
    { id: "case-05", title: "글로우 메이크업 베이스 상세페이지", tag: "SNS 콘텐츠", tone: "sunrise", icon: "sparkle", image: "/case-studies/case-05.jpg" },
    { id: "case-06", title: "스마트 블루투스 헤드셋 상세페이지", tag: "상세페이지", tone: "ocean", icon: "electronics", image: "/case-studies/case-06.jpg" },
    { id: "case-07", title: "당근 비타민 주스 브랜드 포스터", tag: "브랜드 로고", tone: "forest", icon: "food", image: "/case-studies/case-07.jpg" },
    { id: "case-08", title: "오렌지 주스 자동 실링캔 상세페이지", tag: "라벨 디자인", tone: "grape", icon: "food", image: "/case-studies/case-08.jpg" },
    { id: "case-09", title: "디카페인 원두 커피 상세페이지", tag: "메뉴 디자인", tone: "ocean", icon: "food", image: "/case-studies/case-09.jpg" },
    { id: "case-10", title: "어성초 스킨케어 컬렉션 포스터", tag: "브랜드 무드보드", tone: "sunrise", icon: "sparkle", image: "/case-studies/case-10.jpg" },
  ],

  satisfactionTitle: "소상공인 · 공공기관의 이유있는 선택",
  satisfactionRate: 98.7,
  satisfactionSubtitle: "고객 만족도",
  reviews: [
    {
      name: "김해피",
      company: "해피코스메틱",
      rating: 5,
      segment: "소상공인",
      avatar: profileHappyCosmetic,
      text: "AI가 서류 초안을 잡아줘서 신청서 작성 시간이 절반으로 줄었어요. 담당자 확인만 하면 돼서 정말 편해요.",
    },
    {
      name: "박수출",
      company: "미소식품",
      rating: 5,
      segment: "소상공인",
      avatar: profileMisoFood,
      text: "지원사업 매칭이 정확해서 놓칠 뻔한 마감임박 공고까지 챙길 수 있었습니다.",
    },
    {
      name: "이대표",
      company: "그린리빙",
      rating: 5,
      segment: "소상공인",
      avatar: profileGreenLiving,
      text: "디자인 시안을 여러 개 받아보고 고르기만 하면 돼서 외주 맡기는 것보다 훨씬 빨랐어요.",
    },
    {
      name: "최무역",
      company: "코스모트레이드",
      rating: 5,
      segment: "기업",
      avatar: profileCosmoTrade,
      text: "수출 서류를 하나하나 준비할 필요 없이 AI가 자동으로 채워줘서 실수도 줄었습니다.",
    },
    {
      name: "정소상",
      company: "우리한과",
      rating: 5,
      segment: "소상공인",
      avatar: profileOurHangwa,
      text: "수출지원사업 정보를 한곳에서 볼 수 있어서 정보 찾는 시간이 크게 줄었어요.",
    },
    {
      name: "한바이어",
      company: "테크글로벌무역",
      rating: 5,
      segment: "기업",
      avatar: profileTechGlobal,
      text: "필수 서류 체크리스트 덕분에 빠뜨리는 서류 없이 준비할 수 있었습니다.",
    },
  ],

  itemCategoriesTitle: "품목별 지원사업 공고",
  itemCategories: [
    { id: "cosmetics", label: "화장품", icon: "sparkle", keywords: ["화장품", "뷰티", "코스메틱", "스킨케어"] },
    { id: "food", label: "식품", icon: "food", keywords: ["식품", "푸드", "농산물", "가공식품", "음료"] },
    { id: "ai-tech", label: "AI·Tech", icon: "electronics", keywords: ["AI", "IT", "스마트", "기술", "디지털", "전자"] },
    { id: "lifestyle", label: "Life style", icon: "box", keywords: ["생활", "리빙", "패션", "잡화", "인테리어"] },
    { id: "etc", label: "기타", icon: "grid", keywords: [] },
  ],

  myApplicationStatusTitle: "내가 지원한 공고 현황",
  myApplicationLoginGateLabel: "로그인을 통해 확인하세요",
  myApplicationStats: [
    { key: "total", label: "전체건수" },
    { key: "drafting", label: "서류작성중" },
    { key: "reviewing", label: "심사진행중" },
    { key: "reviewed", label: "심사완료" },
    { key: "closed", label: "마감건수" },
  ],
};

export const login = {
  tagline: "안전한 본인 확인",
  requiredMessage: "로그인이 필요한 기능입니다.",
  backLabel: "뒤로가기",
  accountTypeLabel: "계정 유형",
  accountTypes: [
    { id: "user", label: "사용자" },
    { id: "admin", label: "관리자" },
  ],
  fields: {
    idPlaceholder: "이메일을 입력하세요",
    passwordPlaceholder: "비밀번호를 입력하세요",
  },
  options: ["로그인 상태 유지", "비밀번호를 잊으셨나요?"],
  socialLogins: ["Google로 로그인", "기업/기관 SSO 로그인"],
  socialLoginUrls: {
    google: "https://accounts.google.com/signin",
    enterprise: "https://www.bizinfo.go.kr",
  },
  signupPrompt: { text: "아직 계정이 없으신가요?", cta: "회원가입" },
  submitLabel: "로그인",
  dividerLabel: "또는 다른 방법으로 계속하기",
};

export const signup = {
  title: "회원가입",
  subtitle: "간단한 정보 입력 후 바로 이용할 수 있어요.",
  fields: {
    idLabel: "이메일",
    idPlaceholder: "이메일을 입력하세요",
    loginIdLabel: "아이디",
    loginIdPlaceholder: "사용할 아이디를 입력하세요",
    nameLabel: "이름",
    namePlaceholder: "이름을 입력하세요",
    phoneLabel: "전화번호",
    phonePlaceholder: "전화번호를 입력하세요",
    passwordLabel: "비밀번호",
    passwordPlaceholder: "비밀번호를 입력하세요",
    passwordConfirmLabel: "비밀번호 확인",
    passwordConfirmPlaceholder: "비밀번호를 다시 입력하세요",
    companyLabel: "회사명",
    companyPlaceholder: "회사명을 입력하세요",
    categoryLabel: "대표 수출 품목 카테고리",
    countryLabel: "주요 수출 희망 국가",
  },
  mismatchError: "비밀번호가 일치하지 않습니다.",
  submitLabel: "회원가입하고 시작하기",
  loginPrompt: { text: "이미 계정이 있으신가요?", cta: "로그인" },
};

export const resetPassword = {
  title: "비밀번호 재설정",
  subtitle: "가입한 이메일로 재설정 링크를 보내드립니다.",
  fields: {
    idLabel: "이메일",
    idPlaceholder: "가입 시 사용한 이메일을 입력하세요",
    newPasswordLabel: "새 비밀번호",
    newPasswordPlaceholder: "새 비밀번호를 입력하세요",
    newPasswordConfirmLabel: "새 비밀번호 확인",
    newPasswordConfirmPlaceholder: "새 비밀번호를 다시 입력하세요",
  },
  mismatchError: "비밀번호가 일치하지 않습니다.",
  submitLabel: "재설정 링크 보내기",
  updateTitle: "새 비밀번호 설정",
  updateSubtitle: "새로 사용할 비밀번호를 입력하세요.",
  updateSubmitLabel: "비밀번호 변경",
  requestSuccessTitle: "이메일을 확인해주세요",
  requestSuccessMessage: "입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다.",
  successTitle: "비밀번호가 변경되었습니다",
  successMessage: "새 비밀번호로 다시 로그인해주세요.",
  backToLoginLabel: "로그인으로 돌아가기",
};

export const govSupport = {
  title: "수출지원사업",
  subtitle: "수출 기업을 위한 보조금·지원금·지원 프로그램을 살펴보세요.",
  allProgramsHeading: "수출지원사업",
  filters: {
    regionLabel: "지역",
    categoryLabel: "품목",
    statusLabel: "진행상황",
    regions: [
      "전주시", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군",
      "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군",
    ],
    statusOptions: [
      { id: "ongoing", label: "진행중" },
      { id: "deadline", label: "마감일 빠른순" },
      { id: "closed", label: "마감" },
    ],
  },
  detailPageTitle: "공고 확인",
  basicInfoTitle: "기본 정보",
  basicInfoLabels: { org: "주관기관", period: "접수기간", target: "지원대상", support: "지원내용", contact: "문의처" },
  previewSectionTitle: "공고 서식 미리보기",
  previewUnavailable: "아직 등록된 신청 서식이 없습니다.",
  applyButtonLabel: "AI 간편신청하기",
  loginPopup: {
    title: "로그인이 필요해요",
    description: "AI 간편신청을 이용하려면 먼저 로그인해주세요.",
  },
  projects: [
    {
      id: "gov-001",
      title: "2024년 글로벌 시장 확대 바우처 사업",
      category: "적합도 높음",
      highMatch: true,
      dday: "D-14",
      budgetLimit: "₩50,000,000",
      deadline: "2024. 10. 31",
      source: "기업마당",
      matchCategories: ["cosmetics", "food"],
      matchCountries: ["베트남", "태국"],
    },
    {
      id: "gov-002",
      title: "소상공인 수출 물류비 지원사업",
      category: "수출 물류",
      highMatch: false,
      dday: "D-5",
      budgetLimit: "₩15,000,000",
      deadline: "2024. 10. 22",
      source: "KOTRA 무역투자24",
      matchCategories: ["food", "household"],
      matchCountries: ["태국", "인도네시아"],
    },
    {
      id: "gov-003",
      title: "해외 인증 획득 지원사업",
      category: "인증",
      highMatch: false,
      dday: "D-30",
      budgetLimit: "₩30,000,000",
      deadline: "2024. 11. 15",
      source: "공공데이터포털",
      matchCategories: ["cosmetics"],
      matchCountries: ["베트남"],
    },
    {
      id: "gov-004",
      title: "해외 전시회 참가 지원금",
      category: "마케팅",
      highMatch: false,
      dday: "D-1",
      urgent: true,
      budgetLimit: "₩20,000,000",
      deadline: "2024. 10. 18",
      source: "수출바우처 포털",
      matchCategories: ["household", "electronics", "fashion"],
      matchCountries: [],
    },
  ],
};

// 실제 Supabase businesses 행(id)에 매핑되는 상세 정보. DB에는 이런 필드가 없어서
// 프론트 목업으로 관리한다 — 주관기관/기간 등은 임의로 채운 값이다.
export const govAnnouncementDetails = {
  "5090843f-cf8e-4945-a51d-69e1aa8e61e6": {
    org: "전북특별자치도경제통상진흥원",
    recruiter: "전북테크노파크",
    period: "2026.08.01 ~ 2026.08.31",
    target: "전북 소재 수출 유망 중소기업",
    support: "베트남 K-브랜드 EXPO 2026(Mega-Us) 참가 부스비·통역·물류비 등 지원",
    contact: "전북경제통상진흥원 수출지원팀 (063-000-0000)",
  },
  "bb7ab51f-5978-43f7-8f3e-bc85add54153": {
    org: "군산시청·김제시청",
    recruiter: "전북지역산업진흥원",
    period: "2026.08.01 ~ 2026.08.31",
    target: "군산·김제 자유무역지역 입주기업",
    support: "자유무역지역 내 기업 경쟁력 강화를 위한 통합 지원사업",
    contact: "군산시청 기업지원과 (063-000-0000)",
  },
  "ecb57103-e33f-4062-a506-93a95ca01f49": {
    org: "전북테크노파크",
    recruiter: "(재)전북특별자치도경제통상진흥원",
    period: "2026.08.01 ~ 2026.08.31",
    target: "식품 수출 유망 중소기업",
    support: "홍콩식품박람회 2026 참가 지원 (부스비·물류비 등)",
    contact: "전북테크노파크 지역산업육성실 (063-000-0000)",
  },
  "da530822-7707-44b6-b3b8-93dba472815c": {
    org: "전북테크노파크",
    recruiter: "(재)전북특별자치도경제통상진흥원",
    period: "2026.08.01 ~ 2026.08.31",
    target: "해외 수출 경쟁력 강화가 필요한 전북 소재 기업",
    support: "해외 수출기업 경쟁력 강화를 위한 컨설팅·마케팅 지원",
    contact: "전북테크노파크 지역산업육성실 (063-000-0000)",
  },
  "8bb84c8b-d4d5-4288-99bb-5218e16186af": {
    org: "전북특별자치도경제통상진흥원",
    recruiter: "(재)전북특별자치도경제통상진흥원",
    period: "2026.08.01 ~ 2026.08.31",
    target: "김제시 소재 수출 초보·유망 기업",
    support: "통상마스터Youth 연계 수출 통합 지원 (컨설팅·마케팅·인증 등)",
    contact: "전북경제통상진흥원 통상지원팀 (063-000-0000)",
  },
  "ff70560b-2848-4d4b-bce3-245a1244f304": {
    org: "전주시청",
    recruiter: "전북특별자치도경제통상진흥원",
    period: "2026.08.01 ~ 2026.08.31",
    target: "전주시 소재 수출 중소기업",
    support: "수출바우처 지원사업 (마케팅·인증·통역번역 등 자율 선택형)",
    contact: "전주시청 일자리경제국 (063-000-0000)",
  },
};

export const documentChecklist = {
  title: "수출 서류 제출",
  subtitle: "품목·지원사업별로 준비해야 할 서류를 확인하고 업로드해주세요.",
  autoFillLabel: "자동완성",
  autoFillAllLabel: "전체 서류 자동완성",
  notStartedLabel: "미작성",
  doneLabel: "완성",
  manualLabel: "수기 작성 필요",
  waitingLabel: "업로드 대기 중",
  uploadingLabel: "업로드 중...",
  uploadedLabel: "업로드 완료",
  uploadButtonLabel: "파일 업로드",
  reuploadButtonLabel: "다시 업로드",
  issueLinkLabel: "발급 바로가기",
  importButtonLabel: "마이페이지에서 가져오기",
  importingLabel: "가져오는 중...",
  overallTitle: "필수 서류 준비 현황",
  overallDescription: "모든 필수 서류가 등록되어야 다음 통관 단계로 진행할 수 있습니다.",
  overallSuffix: "완료",
  addDocButtonLabel: "추가 수출 제출 서류 작성하기",
  commonGroup: {
    id: "common",
    program: null,
    title: "공통 수출 서류",
    items: [
      {
        id: "doc-invoice",
        name: "상업송장 (Commercial Invoice)",
        description: "수출입 통관 및 관세 부과 기준이 되는 필수 서류",
        lang: "EN",
        autoResult: "done",
      },
      {
        id: "doc-packing",
        name: "포장명세서 (Packing List)",
        description: "화물의 포장 상태, 수량, 중량 등을 기재한 명세서",
        autoResult: "done",
      },
      {
        id: "doc-co",
        name: "원산지증명서 (C/O)",
        description: "FTA 협정세율 적용을 위한 필수 증명서",
        lang: "EN",
        autoResult: "manual",
      },
    ],
  },
  programGroups: [
    {
      id: "prog-voucher",
      program: "2024년 글로벌 시장 확대 바우처 사업",
      title: "2024년 글로벌 시장 확대 바우처 사업 제출서류",
      relatedItem: "워터젤 선크림 SPF50+",
      relatedItemDestination: "베트남",
      items: [
        {
          id: "doc-voucher-app",
          name: "사업 참여 신청서",
          description: "바우처 사업 신청을 위한 기본 서식",
          autoResult: "done",
        },
        {
          id: "doc-voucher-biz",
          name: "사업자등록증 사본",
          description: "신청 자격 확인을 위한 사업자등록증",
          autoResult: "manual",
        },
        {
          id: "doc-voucher-record",
          name: "수출 실적 증명서",
          description: "최근 1년간 수출 실적을 증빙하는 서류",
          autoResult: "manual",
        },
      ],
    },
    {
      id: "prog-cert",
      program: "해외 인증 획득 지원사업",
      title: "해외 인증 획득 지원사업 제출서류",
      relatedItem: "워터젤 선크림 SPF50+",
      relatedItemDestination: "베트남",
      items: [
        {
          id: "doc-cert-app",
          name: "인증 지원 신청서",
          description: "해외 인증 획득 지원사업 신청 서식",
          autoResult: "done",
        },
        {
          id: "doc-cert-plan",
          name: "인증 취득 계획서",
          description: "취득하고자 하는 인증 종류와 취득 일정 기재",
          autoResult: "manual",
        },
      ],
    },
    {
      id: "prog-expo",
      program: "해외 전시회 참가 지원금",
      title: "해외 전시회 참가 지원금 제출서류",
      relatedItem: "AeroTherm Pro 스마트 보틀",
      relatedItemDestination: "미국",
      items: [
        {
          id: "doc-expo-app",
          name: "전시회 참가 신청서",
          description: "참가하고자 하는 전시회 정보 기재",
          autoResult: "done",
        },
        {
          id: "doc-expo-quote",
          name: "부스 임차 견적서",
          description: "전시 부스 임차 비용 견적 자료",
          autoResult: "manual",
        },
      ],
    },
    {
      id: "prog-logistics",
      program: "소상공인 수출 물류비 지원사업",
      title: "소상공인 수출 물류비 지원사업 제출서류",
      relatedItem: "전통 발효 고추장 세트",
      relatedItemDestination: "태국",
      items: [
        {
          id: "doc-logi-app",
          name: "물류비 지원 신청서",
          description: "수출 물류비 지원사업 신청 서식",
          autoResult: "done",
        },
        {
          id: "doc-logi-invoice",
          name: "운송비 견적서/영수증",
          description: "실제 발생한 물류비를 증빙하는 자료",
          autoResult: "manual",
        },
      ],
    },
  ],
};

export const exportDocumentForm = {
  title: "수출 서류 정보 입력",
  subtitle: "서류 생성에 필요한 정보를 입력해주세요.",
  sections: {
    exporter: {
      title: "수출자 정보",
      companyName: { label: "회사명", value: "테크글로벌무역㈜" },
      taxId: { label: "사업자등록번호", value: "" },
      address: { label: "주소", value: "" },
    },
    consignee: {
      title: "수하인 정보",
      consigneeName: { label: "수하인명", value: "" },
      destinationCountry: { label: "목적국", value: "" },
    },
    items: {
      title: "품목 상세",
      descriptionLabel: "품목 설명",
      hsCodeLabel: "HS코드",
      quantityLabel: "수량",
      removeLabel: "삭제",
      addItemLabel: "품목 추가",
    },
  },
  destinationCountryOptions: [
    "국가를 선택하세요",
    "미국",
    "베트남",
    "태국",
    "중국",
    "일본",
    "독일",
  ],
  actions: {
    loadPrevious: "이전 정보 불러오기",
    preview: "서류 양식 보기",
    generate: "서류 생성하기",
  },
};

export const documentPreview = {
  fileName: "상업송장_미국수출_2023.pdf",
  badge: "AI 자동 작성",
  zoom: "100%",
  document: {
    title: "상업송장 (COMMERCIAL INVOICE)",
    shipperLabel: "수출자 (Shipper/Exporter)",
    consigneeLabel: "수하인 (Consignee)",
    shipper: {
      name: "테크글로벌 인더스트리㈜",
      address: ["혁신로 123", "서울특별시, 대한민국"],
    },
    consignee: {
      name: "American Retail Partners LLC",
      address: ["456 Commerce Blvd, Suite 200", "New York, NY 10001, USA"],
      aiFilled: true,
    },
    tableHeaders: { description: "품목 설명", hsCode: "HS코드", quantity: "수량", unitPrice: "단가", total: "총액" },
    items: [
      {
        description: "스마트홈 허브 v2.0",
        hsCode: "8517.62.00",
        quantity: "500개",
        unitPrice: "$120.00",
        totalValue: "$60,000.00",
        aiFilledField: "hsCode",
      },
      {
        description: "무선 센서 패키지",
        hsCode: "8543.70.99",
        quantity: "1,000개",
        unitPrice: "$45.00",
        totalValue: "$45,000.00",
        aiFilledField: "hsCode",
      },
    ],
    termsLabel: "거래 조건",
    termsOfSale: "DDP (관세지급인도조건) New York",
    disclaimer: "본 서류는 AI가 생성한 초안이며 전문가 검토가 필요할 수 있습니다.",
  },
  aiFillingComplete: {
    title: "AI 자동 채움 완료",
    description: "프로젝트 데이터를 기반으로 서류가 자동으로 채워졌습니다. 하이라이트된 항목을 검토해주세요.",
    checklist: [
      "수하인 주소 확인 완료",
      "품목 설명 기반 HS코드 추천 완료",
      "거래 조건(DDP) 자동 반영 완료",
    ],
    warning: "최종 제출 전 노란색으로 표시된 항목을 꼼꼼히 검토해주세요.",
  },
  actions: { submit: "제출하기", edit: "수정하기" },
  submitted: {
    title: "제출이 완료되었습니다",
    message: "서류가 정상적으로 제출되었습니다. 진행 상황은 나의 수출품목에서 확인할 수 있습니다.",
    backLabel: "서류 목록으로 돌아가기",
    myItemsLabel: "나의 수출품목 보기",
  },
};

export const marketingMaterialCreator = {
  title: "AI 이미지 생성",
  subtitle: "제품 마케팅 이미지를 빠르게 생성하세요.",
  actions: { saveImage: "이미지 저장" },
  uploadLabel: "상품 사진 업로드",
  uploadHint: { title: "클릭하거나 파일을 끌어다 놓으세요", sub: "SVG, PNG, JPG, GIF (최대 800x400px)" },
  templateSectionTitle: "템플릿 선택",
  templates: {
    categories: ["카드뉴스", "포스터", "상세페이지"],
    items: [
      // 포스터 5종 - 이미지 1장 구성은 동일하고, 프롬프트에 얹는 스타일 톤만 다르다.
      // "럭셔리 & 프리미엄"만 예외로, 백엔드의 전용 데이터 기반 광고 프롬프트(LUXURY_PREMIUM_POSTER_PROMPT)를 쓴다.
      {
        id: "tpl-poster-minimal",
        name: "미니멀 & 클린",
        category: "포스터",
        layout: "poster",
        selected: true,
        description: "깔끔하고 정돈된 레이아웃으로 제품이 돋보이는 디자인",
        styleHint: "미니멀하고 깨끗한 톤, 여백을 살린 절제된 구성, 차분한 파스텔 계열 배경",
      },
      {
        id: "tpl-poster-luxury",
        name: "럭셔리 & 프리미엄",
        category: "포스터",
        layout: "poster",
        description: "고급스러운 감성과 깊이감으로 브랜드 가치를 높이는 디자인",
      },
      {
        id: "tpl-poster-pop",
        name: "팝 & 컬러풀",
        category: "포스터",
        layout: "poster",
        description: "강렬한 컬러와 트렌디한 레이아웃으로 시선을 사로잡는 디자인",
        styleHint: "팝하고 컬러풀한 톤, 밝고 경쾌한 원색 대비, 발랄한 분위기",
      },
      {
        id: "tpl-poster-emotional",
        name: "감성 & 무드",
        category: "포스터",
        layout: "poster",
        description: "따뜻한 톤과 감각적인 분위기로 감성을 자극하는 디자인",
        styleHint: "감성적이고 무드 있는 톤, 부드러운 자연광과 따뜻한 색감",
      },
      {
        id: "tpl-poster-modern",
        name: "모던 & 대담",
        category: "포스터",
        layout: "poster",
        description: "강한 명암 대비와 기하학적 구도로 대담한 인상을 주는 디자인",
        styleHint: "모던하고 대담한 톤, 강한 명암 대비와 기하학적인 구도",
      },
      // 카드뉴스 4종 - 장수는 4장으로 고정하고, 프롬프트에 얹는 스타일 톤만 다르다.
      {
        id: "tpl-cardnews-minimal",
        name: "클린 & 에디토리얼",
        category: "카드뉴스",
        layout: "card-news",
        description: "여백과 정돈된 구성으로 제품과 핵심 메시지를 깔끔하게 전달하는 디자인",
        styleHint: "미니멀하고 깨끗한 톤, 여백을 살린 절제된 구성",
      },
      {
        id: "tpl-cardnews-luxury",
        name: "브랜드 & 매거진",
        category: "카드뉴스",
        layout: "card-news",
        description: "감각적인 타이포와 제품 중심 구도로 브랜드 이미지를 강조하는 매거진형 디자인",
        styleHint: "럭셔리하고 고급스러운 톤, 짙은 색감과 고급 소재 질감 강조",
      },
      {
        id: "tpl-cardnews-pop",
        name: "비비드 & 임팩트",
        category: "카드뉴스",
        layout: "card-news",
        description: "선명한 컬러와 과감한 그래픽으로 상품의 특징과 메시지를 직관적으로 강조하는 디자인",
        styleHint: "팝하고 컬러풀한 톤, 밝고 경쾌한 원색 대비",
      },
      {
        id: "tpl-cardnews-emotional",
        name: "라이프스타일 & 스토리",
        category: "카드뉴스",
        layout: "card-news",
        description: "제품이 사용되는 분위기와 감성적인 비주얼로 브랜드 스토리를 자연스럽게 전달하는 디자인",
        styleHint: "감성적이고 무드 있는 톤, 부드러운 자연광과 따뜻한 색감",
      },
      // 상세페이지 4종 - 구성(히어로+특징3+각도3)은 동일하고, 스타일 톤만 다르다.
      {
        id: "tpl-detail-classic",
        name: "클래식 화이트",
        category: "상세페이지",
        layout: "detail",
        description: "깨끗한 화이트 배경의 클래식하고 정갈한 스튜디오 룩",
        styleHint: "깨끗한 화이트 배경의 클래식하고 정갈한 스튜디오 톤",
      },
      {
        id: "tpl-detail-premium",
        name: "프리미엄 다크",
        category: "상세페이지",
        layout: "detail",
        description: "짙은 다크 배경과 은은한 조명이 만드는 프리미엄한 룩",
        styleHint: "짙은 다크 배경에 은은한 조명을 살린 프리미엄 톤",
      },
      {
        id: "tpl-detail-natural",
        name: "내추럴 & 오가닉",
        category: "상세페이지",
        layout: "detail",
        description: "자연광과 우드·식물 소품이 어우러진 내추럴한 룩",
        styleHint: "자연광과 우드·식물 소품을 활용한 내추럴하고 오가닉한 톤",
      },
      {
        id: "tpl-detail-trendy",
        name: "트렌디 & 팝",
        category: "상세페이지",
        layout: "detail",
        description: "선명한 색감과 대담한 구도가 돋보이는 트렌디한 룩",
        styleHint: "선명한 색감과 대담한 구도의 트렌디하고 팝한 톤",
      },
    ],
  },
  previewTitle: "미리보기",
  preview: {
    productName: "에어썸 프로 스마트 보틀",
    tagline: "완벽한 온도, 완벽한 하루",
    description: "전문가를 위한 첨단 온도 제어 기능. 오랜 시간 완벽한 보온·보냉을 유지합니다.",
    specs: [
      { icon: "temperature", label: "보온 유지", value: "24시간" },
      { icon: "weight", label: "무게", value: "320g" },
    ],
    brand: "GLOTIZ",
    website: "www.glotiz.kr",
    price: "29,000원",
  },
};

export const helpAndFaq = {
  title: "무엇을 도와드릴까요?",
  subtitle: "자주 묻는 질문을 확인하거나 AI 전문 상담사와 상담하세요.",
  chatBanner: {
    title: "1:1 AI 챗봇 상담",
    description: "수출 규정, 서류 작성, 시장 진입 전략에 대해 AI로부터 즉시 맞춤 답변을 받아보세요.",
    ctaLabel: "지금 상담 시작하기",
  },
  faqSectionTitle: "자주 묻는 질문",
  faqs: [
    {
      question: "필요서류는 어디서 다운받나요?",
      answer:
        "직접 발급받아야 하는 서류는 '수출 서류 제출' 페이지에서 '발급 바로가기'를 누르면 발급 사이트로 바로 이동해요. 나머지 서류는 다운로드할 필요 없이 그 자리에서 AI가 자동으로 채워드립니다.",
    },
    {
      question: "작성하다가 저장 안 하고 나가면 처음부터 다시 써야 하나요?",
      answer: "아니요, 입력 중인 내용은 자동으로 임시저장돼서 다시 들어오면 이어서 작성하실 수 있어요.",
    },
    {
      question: "서류 심사에서 '보완 필요'가 뜨면 어떻게 하나요?",
      answer: "해당 서류를 다시 열어 지적된 부분을 수정한 뒤 재제출하시면 담당자가 다시 확인합니다.",
    },
  ],
  floatingChatbot: {
    title: "AI 상담",
    greeting: "안녕하세요. 해외 수출에 궁금하신 점을 물어보세요.",
    suggestionsLabel: "자주 묻는 질문",
    inputPlaceholder: "궁금한 점을 입력하세요...",
    fallbackAnswer: "문의하신 내용은 확인 후 답변드릴게요. 더 자세한 상담은 고객지원 페이지를 이용해주세요.",
  },
};

export const translationEditor = {
  documentTitle: "상업송장 - 한국 수출용",
  languagePairLabel: "언어쌍",
  languagePair: { source: "영어", target: "한국어" },
  actions: {
    translateAll: "번역 (원문 변환)",
    aiFill: "AI 채우기",
    exportPdf: "PDF로 내보내기",
    save: "변경사항 저장",
  },
  sourcePanelTitle: "원문 (영어)",
  targetPanelTitle: "번역문 (한국어)",
  targetBadge: "편집 중",
  aiAppliedBadge: "AI 제안 적용됨",
  aiTranslatedBadge: "AI 번역됨",
  fieldLabels: {
    invoiceNo: "송장 번호",
    date: "발행일",
    shipper: "수출자",
    consignee: "수입자",
    description: "품명",
    qty: "수량",
    unitPrice: "단가",
    total: "총액",
  },
  source: {
    invoiceNo: "INV-2023-0042",
    date: "October 24, 2023",
    shipper: ["Global Tech Solutions Inc.", "123 Innovation Drive", "San Francisco, CA 94105, USA"],
    consignee: ["Seoul Electronics Ltd.", "456 Teheran-ro, Gangnam-gu", "Seoul 06164, South Korea"],
    items: [
      { description: "Industrial Grade Semiconductor Wafer", qty: 500, unitPrice: "$120.00", total: "$60,000.00" },
      { description: "High-Precision Sensor Modules", qty: 250, unitPrice: "$45.00", total: "$11,250.00" },
    ],
  },
  target: {
    invoiceNo: "INV-2023-0042",
    date: "2023년 10월 24일",
    dateAiTranslated: true,
    shipper: ["Global Tech Solutions Inc.", "123 Innovation Drive", "San Francisco, CA 94105, USA"],
    consignee: ["(주)서울일렉트로닉스", "서울특별시 강남구 테헤란로 456", "우편번호 06164, 대한민국"],
    consigneeAiTranslated: true,
    items: [
      { description: "산업용 반도체 웨이퍼", qty: 500, unitPrice: "$120.00", total: "$60,000.00" },
      { description: "고정밀 센서 모듈", qty: 250, unitPrice: "$45.00", total: "$11,250.00", aiTranslated: true },
    ],
  },
};

export const govConsultation = {
  title: "지자체 담당자 1:1 서류 문의",
  subtitle: "준비한 서류가 지원사업 요건에 맞는지 담당자에게 직접 확인받으세요.",
  inquiryTypes: ["서류 적합성 확인", "지원사업 자격 여부", "서식 오류 확인"],
  statusLabels: { waiting: "답변 대기", done: "답변 완료" },
  inquiries: [
    {
      id: "inq-001",
      subject: "원산지증명서 서식 문의",
      attachedDocument: "원산지증명서 (C/O)",
      status: "답변 완료",
      aiPreReview: "품목 설명과 HS코드가 일치하며 특이사항이 발견되지 않았습니다. 서명란 누락 여부만 확인해 주세요.",
      officerReply: "서식은 적합하며 접수 가능합니다.",
    },
    {
      id: "inq-002",
      subject: "수출바우처 신청 자격 문의",
      attachedDocument: "상업송장",
      status: "답변 대기",
      aiPreReview: "사업자등록증 상 업종 코드가 지원 대상에 포함되는지 추가 확인이 필요합니다.",
      officerReply: null,
    },
  ],
};

export const shopeeListing = {
  title: "해외 수출 플랫폼 입점 가이드",
  titleBadge: "Shopee",
  subtitle: "Shopee 입점부터 상품 등록까지, 해외 판매에 필요한 과정을 단계별로 확인해 보세요.",

  officialGuide: {
    badge: "SHOPEE OFFICIAL GUIDE",
    title: "Shopee 공식 입점 가이드",
    description: "판매자 계정 개설부터 입점 준비까지 Shopee에서 제공하는 공식 가이드 영상을 확인해 보세요.",
    note: "Shopee 공식 입점 교육 페이지로 이동합니다.",
    thumbnailKicker: "신규 셀러 입점 교육",
    thumbnailDescription: "입점부터 상품 등록까지 한 번에 알아보세요!",
    thumbnailDuration: "06:23",
  },

  supportSteps: {
    badge: "GLOTIZ SUPPORT",
    title: "GLOTIZ로 Shopee 상품 등록 정보를 준비해 보세요.",
    subtitle: "상품 정보를 입력하면 AI가 Shopee 상품 등록에 필요한 정보 작성과 번역을 도와드려요.",
    note: "GLOTIZ는 상품 등록에 필요한 정보 작성과 번역을 지원합니다. 최종 등록 및 검수는 Shopee Seller Centre에서 진행됩니다.",
    steps: [
      {
        icon: "pencil",
        title: "상품 정보 입력·AI 작성",
        description: "상품명, 카테고리, 브랜드 등 기본 정보를 입력하고 AI를 활용해 필요한 상품 정보를 작성해요.",
      },
      {
        icon: "globe",
        title: "AI 번역·최적화",
        description: "작성한 상품 정보를 판매 국가에 맞게 번역하고 최적화해요.",
      },
      {
        icon: "documents",
        title: "등록 정보 복사",
        description: "완성된 정보를 복사하여 Shopee 상품 등록에 활용해요.",
      },
      {
        icon: "checkCircle",
        title: "상품 등록 완료",
        description: "Shopee Seller Centre에 상품 정보를 입력하고 등록을 완료해요.",
      },
    ],
  },

  formTitle: "Shopee 상품 정보 작성",
  formSubtitle: "상품 정보를 입력해 주세요. AI가 해외 판매에 필요한 상품 등록 정보 작성을 도와드려요.",
  formNote: "입력한 정보는 AI 번역 및 최적화, Shopee 상품 등록 정보 생성에 활용됩니다.",

  guideVideoLabel: "Shopee 입점 가이드 영상 보기",
  guideVideoUrl: "https://shopee.kr/onboarding_video/",
  guideVideoPendingNote: "영상 링크는 준비 중이에요. 링크가 등록되면 버튼이 바로 연결됩니다.",
  loadPreviousLabel: "이전 정보 불러오기",
  loadPreviousEmpty: "이전에 작성한 정보가 없어요.",
  aiFillLabel: "AI 자동완성",
  copyLabel: "복사",
  copiedLabel: "복사됨",
  translateAllLabel: "전체 내용 번역",
  translatingLabel: "번역하는 중...",
  translateResultTitle: "번역 결과",
  translateEmptyNote: "번역할 내용을 먼저 입력하세요.",
  translateLanguages: [
    { code: "en", label: "English" },
    { code: "th", label: "ไทย (태국어)" },
    { code: "vi", label: "Tiếng Việt (베트남어)" },
  ],
  imagePickerLabel: "AI 이미지 생성에서 불러오기",
  imagePickerEmpty: "AI 이미지 생성에서 만든 이미지가 아직 없어요.",
  imageUploadLabel: "직접 업로드",
  fields: [
    { key: "productName", label: "Product Name", ko: "상품명", placeholder: "예: Dalba Waterjel Sun Cream SPF50+" },
    { key: "category", label: "Category", ko: "카테고리", placeholder: "예: Beauty > Skincare > Face Sunscreen" },
    { key: "description", label: "Product Description", ko: "상품 설명", placeholder: "최소 20자 이상 입력하세요.", multiline: true, aiFillable: true },
    { key: "brand", label: "Brand", ko: "브랜드", placeholder: "예: Dalba" },
    { key: "shelfLife", label: "Shelf life", ko: "유통기한", placeholder: "예: 24 Months" },
    { key: "price", label: "Global SKU Price", ko: "글로벌 판매가", placeholder: "예: 15000" },
    { key: "stock", label: "Stock", ko: "재고 수량", placeholder: "예: 100" },
    { key: "weight", label: "Weight (kg)", ko: "무게(kg)", placeholder: "예: 0.3" },
    { key: "daysToShip", label: "Days to ship", ko: "배송 준비 일수", placeholder: "예: 2" },
  ],
};

export const adminPanel = {
  title: "지원사업 신청 현황 관리",
  subtitle: "소상공인이 제출한 지원사업 신청서와 서류를 신청자별로 확인하세요.",
  summaryLabels: {
    applicants: "신청 기업 수",
    programs: "지원 사업 수",
    needsApproval: "승인 필요 서류 수",
  },
  searchPlaceholder: "사업 또는 기업 이름으로 검색",
  searchEmptyMessage: "검색 결과가 없습니다.",
  applicantFallbackName: "익명 신청자",
  tableHeaders: {
    applicant: "신청 기업",
    program: "신청 사업",
    documents: "제출 서류",
    lastUpdated: "최근 제출일",
  },
  statusLabels: {
    generated: "완성",
    filled: "AI 생성 대기",
    none: "미작성",
  },
  reviewStatusLabels: {
    approved: "제출 완료",
    needsRevision: "보완 필요",
    reviewing: "AI 검토 중",
    notSubmitted: "미제출",
  },
  percentLabel: "제출 완료율",
  notifyLabel: "알림 보내기",
  notifiedLabel: "알림 전송됨",
  emptyMessage: "아직 제출된 신청서가 없습니다.",
  viewDocumentLabel: "제출 내용 보기",
  generatingLabel: "문서 생성 중...",
  downloadLabel: "다운로드",
  markNeedsRevisionLabel: "반려",
  markApprovedLabel: "승인",
  applicantCountLabel: "신청 기업",

  tabs: {
    submissions: "제출 현황",
    businesses: "사업 관리",
  },

  businessManager: {
    newBusinessButtonLabel: "새 사업 등록",
    businessListEmptyMessage: "등록된 사업이 없습니다.",
    uploadTemplateButtonLabel: "제출 서류 업로드",
    addFieldsButtonLabel: "필드 추가",
    editTemplateButtonLabel: "수정",
    deleteTemplateButtonLabel: "삭제",
    templateListEmptyMessage: "등록된 서류 양식이 없습니다.",
    userUploadBadgeLabel: "사용자 업로드형",
    userUploadGroupLabel: "사용자 업로드형",
    formTemplateGroupLabel: "제출 서식 (서식 번호순)",

    businessForm: {
      title: "새 사업 등록",
      nameLabel: "사업명",
      namePlaceholder: "예: 2026년 전북 수출바우처 지원사업",
      referenceDocLabel: "공고문 업로드",
      referenceDocHint: "PDF/DOCX/HWP/이미지 파일을 올리면 AI가 기본 정보를 자동으로 채워요.",
      submitLabel: "등록하기",
    },

    templateForm: {
      title: "제출 서류 업로드",
      nameLabel: "서식명",
      namePlaceholder: "예: 신청서(별지 제1호)",
      formNumberLabel: "서식 번호",
      formNumberPlaceholder: "예: 1 또는 별지1호",
      fileLabel: "DOCX 파일",
      submitLabel: "업로드",
      docxHint:
        "업로드하는 DOCX 파일에는 각 필드의 자리표시자가 미리 포함되어 있어야 합니다. " +
        "일반 텍스트/장문 필드는 {{field_key}} 형식(예: {{company_name_kr}})으로, " +
        "체크박스 필드는 옵션 문구 앞에 □ 기호(예: □ 법인)를 넣어 작성해주세요. " +
        "자리표시자가 없으면 자동 채움 시 값이 채워지지 않습니다.",
      userUploadCheckboxLabel: "서식 번호 및 docx 파일을 올리지 않기",
      userUploadHint:
        "체크하면 AI 자동완성 서식 없이 서류 이름만 등록됩니다. 신청자 화면에는 이 서류가 " +
        "'발급 바로가기'로 발급받아 직접 업로드하는 서류로 표시됩니다.",
      linkedDocLabel: "마이페이지 서류와 연결",
      linkedDocHint:
        "연결하면 신청자가 마이페이지에 미리 올려둔 파일을 다시 고를 필요 없이 " +
        "'마이페이지에서 가져오기' 버튼으로 바로 제출할 수 있습니다.",
      linkedDocNoneOption: "연결 안 함",
    },

    editTemplateForm: {
      title: "서류 양식 수정",
      nameLabel: "서식명",
      namePlaceholder: "예: 신청서(별지 제1호)",
      formNumberLabel: "서식 번호",
      formNumberPlaceholder: "예: 1 또는 별지1호",
      fileLabel: "DOCX 파일 (선택, 새로 올리면 기존 파일을 대체합니다)",
      submitLabel: "수정 저장",
      linkedDocLabel: "마이페이지 서류와 연결",
      linkedDocNoneOption: "연결 안 함",
    },

    fieldsForm: {
      title: "필드 추가",
      fieldKeyLabel: "필드 키 (field_key)",
      fieldKeyPlaceholder: "예: company_name_kr",
      fieldLabelLabel: "필드 라벨",
      fieldLabelPlaceholder: "예: 회사명(국문)",
      fieldTypeLabel: "필드 유형",
      optionsLabel: "선택지 (쉼표로 구분)",
      optionsPlaceholder: "예: 법인, 개인사업자",
      addRowLabel: "필드 추가",
      removeRowLabel: "삭제",
      submitLabel: "저장하기",
      fieldTypeLabels: {
        text: "텍스트",
        number: "숫자",
        date: "날짜",
        select: "선택(드롭다운)",
        checkbox: "체크박스(선택형)",
        textarea: "여러 줄 텍스트",
        long_text: "장문(AI 자동 생성)",
      },
    },
  },
};
