# JB-XPORT

전북 로컬 특산물·소상공인 수출·마케팅 AI 에이전트

프론트엔드(React + Vite)와 백엔드(FastAPI)로 구성되어 있고, 데이터는 Supabase(Postgres + Storage)에 저장되며 문서 자동 완성은 Google Gemini를 사용합니다.

```
JB-Trade-AI-Agent-main/
├─ web/       # React + Vite 프론트엔드
└─ backend/   # FastAPI 백엔드 (AI 서류 자동 생성 · docx → PDF 변환)
```

## 사전 준비물

새 컴퓨터에서 실행하려면 아래가 미리 설치되어 있어야 합니다.

| 항목 | 확인 방법 | 비고 |
|---|---|---|
| Node.js 20 이상 | `node --version` | 이 문서는 v24.18.0 기준으로 검증했습니다 |
| Python 3.11 이상 | `python --version` | 이 문서는 3.12.10 기준으로 검증했습니다 |
| Git | `git --version` | |
| LibreOffice | - | 백엔드가 서류(docx)를 PDF로 변환할 때 사용합니다. [libreoffice.org](https://www.libreoffice.org/download/download/)에서 설치하세요 |

그 외에 아래 계정/키가 필요합니다 (프로젝트 담당자에게 문의).

- Supabase 프로젝트의 **URL**, **anon key**, **service role key**
- Google **Gemini API 키**
- 공공데이터포털(data.go.kr) **관세청_품목별 국가별 수출입실적(GW)** API 서비스키 (시장 분석 페이지의 실제 수출 데이터 조회용)

## 설치 및 실행

### 1. 클론

```bash
git clone https://github.com/rosoefox/JB-Trade-AI-Agent.git
cd JB-Trade-AI-Agent-main
```

### 2. 프론트엔드 (`web/`)

```bash
cd web
npm install
```

`web/.env.local` 파일을 새로 만들고 아래 내용을 채웁니다 (이 파일은 git에 포함되어 있지 않습니다).

```
VITE_SUPABASE_URL=<Supabase 프로젝트 URL>
VITE_SUPABASE_ANON_KEY=<Supabase anon key>
VITE_BACKEND_URL=http://localhost:8000
```

`VITE_BACKEND_URL`은 생략하면 자동으로 `http://localhost:8000`을 사용합니다.

실행:

```bash
npm run dev
```

터미널에 뜨는 주소(기본값 `http://localhost:5173`)를 브라우저에서 열면 됩니다.

### 3. 백엔드 (`backend/`)

새 터미널을 열고:

```bash
cd backend
python -m venv venv
```

가상환경 활성화:

```bash
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# macOS / Linux
source venv/bin/activate
```

```bash
pip install -r requirements.txt
```

`backend/.env` 파일을 새로 만들고 아래 내용을 채웁니다 (이 파일도 git에 포함되어 있지 않습니다).

```
SUPABASE_URL=<Supabase 프로젝트 URL>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
GEMINI_API_KEY=<Gemini API 키>
DATA_GO_KR_TRADE_SERVICE_KEY=<공공데이터포털에서 발급받은 관세청_품목별 국가별 수출입실적(GW) 서비스키(Encoding)>
MARKET_ANALYSIS_GEMINI_API_KEY=<시장 분석 전용 Gemini API 키 (생략 시 GEMINI_API_KEY를 대신 사용)>
```

`MARKET_ANALYSIS_GEMINI_API_KEY`는 서류 자동완성/챗봇이 쓰는 `GEMINI_API_KEY`와 무료 티어 일일 요청 한도를 공유하지 않도록, 시장 분석 페이지 전용으로 별도 Gemini 프로젝트에서 발급받은 키를 넣는 용도입니다. 비워두면 `GEMINI_API_KEY`를 그대로 씁니다.

실행:

```bash
uvicorn main:app --reload --port 8000
```

### 4. 확인

프론트엔드 주소(`http://localhost:5173`)를 브라우저에서 열면 됩니다. 종료하려면 각 터미널에서 `Ctrl + C`.

## 로그인 / 테스트 방법

로그인은 Supabase Auth(`signInWithPassword`)를 사용하는 실제 인증입니다. 아무 값이나 입력해서는 로그인할 수 없고, 먼저 `/signup` 화면에서 회원가입해 Supabase에 계정을 만들어야 합니다.

계정 유형(일반 사용자 / 관리자)은 로그인 화면에서 고르는 값이 아니라, Supabase `profiles` 테이블의 `account_type` 컬럼 값으로 결정됩니다. 이 값이 `admin`인 계정으로 로그인하면 신청 현황을 확인하는 관리자 페이지(`/admin`)로, 그 외에는 일반 소상공인용 화면(정부지원사업, 서류 관리, 쇼피 입점 가이드 등)으로 이동합니다. 관리자 계정을 만들려면 회원가입 후 Supabase 대시보드(또는 SQL)에서 해당 사용자의 `profiles.account_type`을 `admin`으로 직접 바꿔주어야 합니다.

데이터(정부지원사업 공고, 제출 서류, 마이페이지 정보 등 일부)는 위에서 설정한 Supabase 프로젝트에 저장되므로, 같은 Supabase 프로젝트를 가리키는 한 어느 컴퓨터에서 실행해도 동일한 데이터가 보입니다.

## 알려진 제한사항

- **LibreOffice 경로**: 백엔드가 LibreOffice를 찾는 경로가 Windows 기본 설치 경로(`C:\Program Files\LibreOffice\program\soffice.exe`)로 고정되어 있습니다 (`backend/main.py`의 `find_soffice()`). macOS/Linux에서 서류 자동 생성(PDF 변환)을 실행하려면 이 함수가 `soffice`를 PATH에서 찾도록 수정이 필요합니다.
- **CORS**: 백엔드는 `http://localhost:5173`에서 오는 요청만 허용하도록 되어 있습니다. 프론트엔드를 다른 포트나 주소로 띄우면 AI 서류 생성 요청이 차단됩니다.
- **환경변수 파일 미포함**: `web/.env.local`, `backend/.env`는 보안상 git에 포함되어 있지 않습니다. 새 환경에서는 위 안내대로 직접 생성해야 합니다.

## 참고 문서

- `JB-XPORT_PRD.docx`, `JB_XPORT_task.md`: 기획 문서 및 개발 태스크 목록
- `UI design/`: 초기 화면 설계 참고 이미지
- `mock-data.json`: 프론트엔드 목업 데이터 원본
