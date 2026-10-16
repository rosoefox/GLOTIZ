# GLOTIZ

> 전북 소상공인·중소기업의 **수출 지원사업 신청 서류를 AI가 자동으로 작성**해 주는 웹서비스

🏆 **전북특별자치도지사상 (최우수상)** — 전북특별자치도 AI·AX 전문가 과정 팀 프로젝트 (2026.08.)  
👥 4인 팀 프로젝트

---

## 왜 만들었나요?

수출 지원사업에 신청하려면 공고마다 양식이 다른 신청서(HWP·DOCX·XLSX)를 매번 처음부터 채워야 합니다.
같은 회사 정보(사업자번호, 대표자, 수출 품목, 매출 등)를 서류마다 반복해서 입력하는 일이 소상공인에게는 큰 부담이었습니다.

GLOTIZ는 **한 번 등록한 기업 정보와 보유 서류를 바탕으로, 새 공고의 신청서 빈칸을 AI가 찾아서 자동으로 채워 줍니다.**

## 주요 기능

| 기능 | 설명 |
|---|---|
| 📄 **AI 서류 자동 작성** | 공고 서식에서 채워야 할 빈칸을 AI가 찾아내고, 기업 정보·기존 서류에서 값을 뽑아 자동 입력 → 완성 문서와 PDF 생성 |
| 🔍 **수출 지원사업 탐색** | 지원사업 공고 목록·상세, 북마크, 마감 임박 알림 |
| 🌐 **서류 번역** | 작성한 서류 내용을 해외 바이어용으로 번역·편집 |
| 🎨 **AI 마케팅 이미지** | 수출 품목 정보로 카드뉴스·상세페이지 이미지를 템플릿별로 생성 |
| 🛒 **쇼피(Shopee) 입점 도우미** | 동남아 이커머스 상품 등록 정보 작성 지원 |
| 💬 **AI 챗봇** | 수출 절차·서비스 이용 관련 질문 응답 |
| 🛠️ **관리자 페이지** | 공고·서식 등록, 제출 서류 검토(보완 요청), 사용자 알림 |

## 기술적으로 신경 쓴 부분

- **서식 빈칸 판단 모델 파인튜닝**: 기업마당 등에 실제 게시된 수출 지원사업 신청서 양식을 모아 학습·평가 데이터셋을 직접 구축하고(`backend/finetune_data/`), "이 칸이 사용자가 채워야 하는 빈칸인가"를 판단하도록 Gemini 2.5 Flash를 파인튜닝해 서비스에 적용했습니다. 엔드포인트가 없으면 기본 모델로 자동 폴백됩니다.
- **다양한 문서 형식 처리**: HWP/HWPX/DOCX/XLSX 서식에서 텍스트와 필드를 추출하고, Document AI로 업로드 서류(사업자등록증 등)에서 정보를 읽어 옵니다.
- **클라우드 이전**: 초기 Supabase 기반 구조에서 GCP(Cloud SQL, Cloud Storage, Pub/Sub, Secret Manager)로 데이터·파일·알림 처리와 로그인까지 전부 옮겼습니다. 로그인은 bcrypt + JWT 방식으로 직접 구현했습니다. 비밀번호·JWT 키 등은 코드나 환경 파일이 아닌 Secret Manager에서 읽어 옵니다.

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, React Router, GSAP |
| Backend | Python, FastAPI, python-docx, PyMuPDF |
| AI | Gemini 2.5 Flash (Vertex AI), Gemini 이미지 생성, 파인튜닝 모델, Google Document AI, Cloud Translation |
| Infra | GCP Cloud SQL(PostgreSQL), Cloud Storage, Pub/Sub, Secret Manager, Docker / nginx |
| 개발 도구 | Claude Code, Git/GitHub |

## 프로젝트 구조

```
GLOTIZ/
├── web/                 # 프론트엔드 (React + Vite)
│   └── src/pages/       # 대시보드, 지원사업, 서류 작성, 번역, 마케팅, 쇼피, 관리자 등
└── backend/
    ├── main.py          # FastAPI 서버 (인증, 서류 작성·생성, 번역, 마케팅 이미지, 관리자 API)
    ├── fill_docx.py     # 서식 문서에 값 채우기
    ├── finetune_data/   # 실제 신청서 양식 기반 파인튜닝 데이터셋·평가 스크립트
    └── sql/             # DB 스키마
```

---

## 로컬에서 실행하기

이 순서대로만 따라 하면 내 컴퓨터에서 홈페이지를 직접 켜서 볼 수 있어요.

### 이것부터 알아두세요

이 프로젝트는 **2개**로 이루어져 있어요.

| 이름 | 폴더 | 하는 일 |
|---|---|---|
| 화면 (프론트엔드) | `web` | 브라우저에 보이는 홈페이지 |
| 서버 (백엔드) | `backend` | 화면 뒤에서 AI·데이터 처리 |

**홈페이지가 제대로 보이려면 이 둘을 항상 같이 켜야 합니다.** 그래서 터미널(명령어 입력 창) 창이 **2개** 필요해요.

### 0. 준비물 설치 확인 (컴퓨터당 딱 한 번만)

터미널을 엽니다. (Windows는 시작 메뉴에서 "PowerShell" 검색)

아래 두 줄을 각각 입력해서 버전이 나오는지 확인하세요.

```bash
node --version
python --version
```

숫자가 안 뜨고 오류가 나면 아래에서 먼저 설치하세요.
- Node.js: https://nodejs.org (아무 최신 버전이나 OK)
- Python: https://www.python.org

서류를 PDF로 변환하는 기능을 쓰려면 LibreOffice도 설치해주세요: https://www.libreoffice.org/download/download/

### 1. 프로젝트 폴더 받기

이미 폴더가 컴퓨터에 있다면 이 단계는 건너뛰세요.

```bash
git clone https://github.com/rosoefox/GLOTIZ.git
```

### 2. 처음 한 번만 하는 설정

#### 2-1. 화면(web) 설정

1. 터미널에서 `web` 폴더로 들어가서 필요한 패키지를 설치합니다.

   ```bash
   cd web
   npm install
   ```

2. `web` 폴더 안에 `.env.local` 이라는 이름으로 새 파일을 만들고, 아래 한 줄을 붙여넣어 주세요.

   ```
   VITE_BACKEND_URL=http://localhost:8000
   ```

#### 2-2. 서버(backend) 설정

1. 터미널에서 `backend` 폴더로 들어가서 필요한 패키지를 설치합니다.

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. `backend` 폴더 안의 `.env.example`을 복사해서 `.env` 파일을 만들고, `< >` 부분을 실제 값으로 채워주세요. (이 값들을 모르면 프로젝트 담당자에게 물어보세요)

   ```
   VERTEX_AI_PROJECT_ID=<GCP 프로젝트 ID>
   GOOGLE_APPLICATION_CREDENTIALS=<서비스 계정 키 JSON 경로>
   DOCUMENT_AI_PROCESSOR_ID=<Document AI 프로세서 ID>
   CLOUD_SQL_HOST=<Cloud SQL 인스턴스 공인 IP>
   CLOUD_SQL_DB=<Cloud SQL 데이터베이스 이름>
   CLOUD_SQL_USER=<Cloud SQL 사용자>
   GCS_TEMPLATES_BUCKET=<templates 버킷 이름>
   GCS_GENERATED_BUCKET=<generated 버킷 이름>
   TUNED_BLANK_CANDIDATE_MODEL=<파인튜닝 모델 엔드포인트, 없으면 비워두기>
   ```

   > Cloud SQL 비밀번호와 로그인 토큰용 JWT 키는 `.env`에 적지 않습니다. 앱이 GCP **Secret Manager**에서 직접 읽어 오므로, 위 서비스 계정에 "Secret Manager 보안 비밀 접근자" 권한만 있으면 됩니다.

   > **아키텍처 안내**: 회원가입·로그인을 포함한 모든 데이터는 Cloud SQL(PostgreSQL)에,
   > 파일(서식 원본·생성 문서·마케팅 이미지)은 Cloud Storage에 저장됩니다.
   > 로그인은 비밀번호를 bcrypt로 암호화하고 자체 JWT 토큰을 발급하는 방식입니다.
   > 프론트엔드는 모든 데이터를 백엔드 API(`web/src/lib/api.js`)를 통해서만 주고받습니다.
   > (초기에는 Supabase를 썼지만 지금은 GCP로 완전히 옮겨서 Supabase는 필요 없습니다.)
   >
   > **Cloud SQL은 처음엔 빈 상태입니다** — 관리자 페이지에서 지원사업/서식을 등록해야 화면에 내용이 보입니다.

### 3. 실행하기 (다음부터는 이 단계만 반복하면 됩니다)

**터미널 창 1** — 화면 켜기

```bash
cd web
npm run dev
```

**터미널 창 2** (새 터미널을 하나 더 여세요) — 서버 켜기

```bash
cd backend
uvicorn main:app --reload --port 8000
```

두 개 다 켜진 상태에서 브라우저 주소창에 아래를 입력하면 홈페이지가 보입니다.

```
http://localhost:5173
```

끝낼 때는 각 터미널 창에서 `Ctrl + C`를 누르면 됩니다.

### 로그인은 어떻게 하나요?

아무 이메일이나 입력한다고 로그인되지 않아요. 먼저 홈페이지의 **회원가입**으로 계정을 새로 만들어야 합니다. 관리자 계정은 DB의 `users` 테이블에서 해당 계정의 `account_type`을 `admin`으로 설정해야 하니 담당자에게 문의하세요.

### 잘 안 될 때 확인해보세요

**"Could not import module main" 오류가 뜬다**
→ 터미널이 `backend` 폴더 "안"에 있는 상태에서 `uvicorn` 명령어를 실행해야 해요. `cd backend`를 먼저 입력했는지 확인하세요.

**화면이 하얗게(빈 화면) 뜬다**
→ `web/.env.local` 파일에 `VITE_BACKEND_URL`을 제대로 넣었는지, 서버(backend)도 켜져 있는지 확인하세요. 값을 새로 바꿨다면 `npm run dev`를 껐다가(`Ctrl + C`) 다시 켜야 반영돼요.

**"이미 사용 중인 주소입니다" 같은 오류가 뜬다 (포트 충돌)**
→ 예전에 켜둔 서버가 꺼지지 않고 남아있는 경우예요. 컴퓨터를 재시작하거나, 작업 관리자에서 관련 `python`/`node` 프로세스를 종료한 뒤 다시 실행해보세요.

### 더 알아보기

- `mock-data.json`: 프론트엔드 목업 데이터 원본
- 백엔드가 LibreOffice를 찾는 경로는 Windows 기본 설치 경로로 고정되어 있어요 (`backend/main.py`의 `find_soffice()`). macOS/Linux에서는 이 부분을 수정해야 서류 PDF 변환이 동작합니다.
- 백엔드는 `http://localhost:5173`에서 오는 요청만 허용합니다. 화면 주소를 다른 포트로 띄우면 AI 기능이 막혀요.
