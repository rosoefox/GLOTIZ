# JB-XPORT

전북 소상공인의 해외 수출을 돕는 AI 웹서비스입니다. 이 문서 순서대로만 따라 하면 내 컴퓨터에서 홈페이지를 직접 켜서 볼 수 있어요.

## 이것부터 알아두세요

이 프로젝트는 **2개**로 이루어져 있어요.

| 이름 | 폴더 | 하는 일 |
|---|---|---|
| 화면 (프론트엔드) | `web` | 브라우저에 보이는 홈페이지 |
| 서버 (백엔드) | `backend` | 화면 뒤에서 AI·데이터 처리 |

**홈페이지가 제대로 보이려면 이 둘을 항상 같이 켜야 합니다.** 그래서 터미널(명령어 입력 창) 창이 **2개** 필요해요.

## 0. 준비물 설치 확인 (컴퓨터당 딱 한 번만)

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

## 1. 프로젝트 폴더 받기

이미 폴더가 컴퓨터에 있다면 이 단계는 건너뛰세요.

```bash
git clone https://github.com/rosoefox/JB-Trade-AI-Agent.git
```

## 2. 처음 한 번만 하는 설정

### 2-1. 화면(web) 설정

1. 터미널에서 `web` 폴더로 들어가서 필요한 패키지를 설치합니다.

   ```bash
   cd web
   npm install
   ```

2. `web` 폴더 안에 `.env.local` 이라는 이름으로 새 파일을 만들고, 아래 내용을 붙여넣은 뒤 `< >` 부분을 실제 값으로 바꿔주세요. (이 값들을 모르면 프로젝트 담당자에게 물어보세요)

   ```
   VITE_SUPABASE_URL=<Supabase 프로젝트 URL>
   VITE_SUPABASE_ANON_KEY=<Supabase anon key>
   VITE_BACKEND_URL=http://localhost:8000
   ```

### 2-2. 서버(backend) 설정

1. 터미널에서 `backend` 폴더로 들어가서 필요한 패키지를 설치합니다.

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. `backend` 폴더 안에 `.env` 라는 이름으로 새 파일을 만들고, 아래 내용을 채워주세요.

   ```
   SUPABASE_URL=<Supabase 프로젝트 URL>
   SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
   VERTEX_AI_PROJECT_ID=<GCP 프로젝트 ID>
   GOOGLE_APPLICATION_CREDENTIALS=<Vertex AI 서비스 계정 키 JSON 경로>
   CLOUD_SQL_HOST=<Cloud SQL 인스턴스 공인 IP>
   CLOUD_SQL_DB=<Cloud SQL 데이터베이스 이름>
   CLOUD_SQL_USER=<Cloud SQL 사용자>
   CLOUD_SQL_PASSWORD=<Cloud SQL 비밀번호>
   GCS_TEMPLATES_BUCKET=<templates 버킷 이름>
   GCS_GENERATED_BUCKET=<generated 버킷 이름>
   ```

   > **아키텍처 안내**: 로그인/회원가입(Auth)과 `profiles` 테이블은 계속 Supabase를 씁니다.
   > 그 외 실제 서비스 데이터(businesses/templates/template_fields/submissions/
   > submission_values/generated_documents/notifications/bookmarks)는 Cloud SQL
   > (PostgreSQL)로, 파일 저장소(템플릿 원본/생성 문서/마케팅 이미지)는 Cloud Storage로
   > 옮겨져 있습니다. 프론트엔드는 이 테이블들을 더 이상 Supabase에 직접 쿼리하지 않고
   > 전부 이 백엔드 API(`web/src/lib/api.js`)를 거칩니다. Supabase Realtime으로 처리하던
   > 실시간 알림/현황 갱신은 15초 주기 폴링으로 대체되어 있습니다.
   >
   > **Cloud SQL은 처음엔 완전히 빈 상태입니다** — 관리자 페이지에서 사업/서식을 다시
   > 등록해야 화면에 내용이 보입니다 (기존 Supabase에 있던 데이터는 옮기지 않았습니다).

## 3. 실행하기 (다음부터는 이 단계만 반복하면 됩니다)

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

## 로그인은 어떻게 하나요?

아무 이메일이나 입력한다고 로그인되지 않아요. 먼저 홈페이지의 **회원가입**으로 계정을 새로 만들어야 합니다. 관리자 계정이 필요하면 Supabase에서 별도 설정이 필요하니 담당자에게 문의하세요.

## 잘 안 될 때 확인해보세요

**"Could not import module main" 오류가 뜬다**
→ 터미널이 `backend` 폴더 "안"에 있는 상태에서 `uvicorn` 명령어를 실행해야 해요. `cd backend`를 먼저 입력했는지 확인하세요.

**화면이 하얗게(빈 화면) 뜬다**
→ `web/.env.local` 파일에 값을 제대로 채워 넣었는지 확인하세요. 값을 새로 바꿨다면 `npm run dev`를 껐다가(`Ctrl + C`) 다시 켜야 반영돼요.

**"이미 사용 중인 주소입니다" 같은 오류가 뜬다 (포트 충돌)**
→ 예전에 켜둔 서버가 꺼지지 않고 남아있는 경우예요. 컴퓨터를 재시작하거나, 작업 관리자에서 관련 `python`/`node` 프로세스를 종료한 뒤 다시 실행해보세요.

## 더 알아보기

- `JB-XPORT_PRD.docx`, `JB_XPORT_task.md`: 기획 문서 및 개발 태스크 목록
- `UI design/`: 초기 화면 설계 참고 이미지
- `mock-data.json`: 프론트엔드 목업 데이터 원본
- 백엔드가 LibreOffice를 찾는 경로는 Windows 기본 설치 경로로 고정되어 있어요 (`backend/main.py`의 `find_soffice()`). macOS/Linux에서는 이 부분을 수정해야 서류 PDF 변환이 동작합니다.
- 백엔드는 `http://localhost:5173`에서 오는 요청만 허용합니다. 화면 주소를 다른 포트로 띄우면 AI 기능이 막혀요.
