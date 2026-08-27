import base64
import io
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
import psycopg2
import psycopg2.extras
import pymupdf
from docx import Document
from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from google import genai
from google.cloud import documentai_v1 as documentai, pubsub_v1, translate_v3 as translate
from google.cloud import secretmanager
from google.cloud import storage as gcs_sdk
from google.genai import types
from pydantic import BaseModel

from fill_docx import apply_blank_field, detect_blank_candidates, extract_docx_fields, fill_document

load_dotenv()

# 모든 Gemini 호출은 Developer API 키가 아니라 Vertex AI를 통해 이뤄진다.
# GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 키 경로)는 google-auth ADC가 자동으로 읽는다.
VERTEX_AI_PROJECT_ID = os.environ["VERTEX_AI_PROJECT_ID"]
VERTEX_AI_LOCATION = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

_secret_manager_client = secretmanager.SecretManagerServiceClient()


def _get_secret(secret_id: str) -> str:
    """DB 비밀번호/JWT 시크릿처럼 진짜 민감한 값은 .env 평문 대신 Secret Manager에서 읽는다."""
    name = f"projects/{VERTEX_AI_PROJECT_ID}/secrets/{secret_id}/versions/latest"
    response = _secret_manager_client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8")


IMAGE_GEN_MODEL = os.environ.get("IMAGE_GEN_MODEL", "gemini-2.5-flash-image")
# 실제 전북/전국 수출지원사업 서식 56개(필드 460개)로 파인튜닝한 모델. 검증셋 기준
# field_key 정확일치율이 46.7% -> 95.5%로 개선됨 (backend/finetune_data 참고).
# 설정 안 돼있으면 베이스 모델로 자동 폴백.
TUNED_BLANK_CANDIDATE_MODEL = os.environ.get("TUNED_BLANK_CANDIDATE_MODEL", "gemini-2.5-flash")
# 공고 원문(reference-doc)에서 기본 정보를 뽑을 때 1단계 OCR로 쓰는 Document AI 프로세서.
# GCP 콘솔에서 "Document OCR" 프로세서를 만들고 그 processor ID를 넣어야 동작한다.
DOCUMENT_AI_LOCATION = os.environ.get("DOCUMENT_AI_LOCATION", "us")
DOCUMENT_AI_PROCESSOR_ID = os.environ.get("DOCUMENT_AI_PROCESSOR_ID")
# 회원/로그인(계정)과 businesses/templates/template_fields/submissions/submission_values/
# generated_documents/notifications/bookmarks 전부 Cloud SQL(PostgreSQL)에 있다. Supabase는
# 더 이상 쓰지 않는다.
CLOUD_SQL_HOST = os.environ["CLOUD_SQL_HOST"]
CLOUD_SQL_DB = os.environ["CLOUD_SQL_DB"]
CLOUD_SQL_USER = os.environ["CLOUD_SQL_USER"]
CLOUD_SQL_PASSWORD = _get_secret("jbxport-cloud-sql-password")

TEMPLATES_BUCKET = os.environ.get("GCS_TEMPLATES_BUCKET", "team-01-504502-templates")
GENERATED_BUCKET = os.environ.get("GCS_GENERATED_BUCKET", "team-01-504502-generated")
AI_FIELD_TYPES = {"long_text", "checkbox"}
VALID_FIELD_TYPES = {"text", "number", "date", "select", "checkbox", "textarea", "long_text"}

# 내일 시연용: 이 공고의 참가 신청서만 AI 필드 추출 결과에 의존하지 않고 고정한다.
VIETNAM_EXPO_BUSINESS_ID = "5090843f-cf8e-4945-a51d-69e1aa8e61e6"
VIETNAM_APPLICATION_FIELDS = [
    {"field_key": "company_name_kr", "field_label": "기업명(국문)", "field_type": "text", "options": None},
    {"field_key": "founded_date", "field_label": "설립일", "field_type": "date", "options": None},
    {"field_key": "company_name_en", "field_label": "기업명(영문)", "field_type": "text", "options": None},
    {"field_key": "ceo_name", "field_label": "대표자", "field_type": "text", "options": None},
    {"field_key": "business_reg_number", "field_label": "사업자등록번호", "field_type": "text", "options": None},
    {"field_key": "company_type", "field_label": "기업형태", "field_type": "checkbox", "options": ["법인", "개인"]},
    {"field_key": "main_product", "field_label": "주생산품", "field_type": "text", "options": None},
    {"field_key": "product_category", "field_label": "품목 구분", "field_type": "checkbox", "options": ["소비재", "산업재"]},
    {"field_key": "company_phone", "field_label": "전화번호", "field_type": "text", "options": None},
    {"field_key": "website", "field_label": "홈페이지", "field_type": "text", "options": None},
    {"field_key": "headquarters_address", "field_label": "본사 주소", "field_type": "text", "options": None},
    {"field_key": "participation_field", "field_label": "사업 분야(택 1)", "field_type": "checkbox", "options": ["K-AI&테크", "K-라이프스타일", "K-뷰티", "K-푸드"]},
    {"field_key": "main_export_product", "field_label": "주요 수출제품", "field_type": "text", "options": None},
    {"field_key": "hs_code", "field_label": "HS CODE", "field_type": "text", "options": None},
    {"field_key": "primary_business_code", "field_label": "주업종코드", "field_type": "text", "options": None},
    {"field_key": "primary_ksic_code", "field_label": "주업종 한국표준산업분류코드(KSIC)", "field_type": "text", "options": None},
    {"field_key": "secondary_business_code", "field_label": "부업종코드", "field_type": "text", "options": None},
    {"field_key": "secondary_ksic_code", "field_label": "부업종 한국표준산업분류코드(KSIC)", "field_type": "text", "options": None},
    {"field_key": "contact_name_kr", "field_label": "담당자 성명(국문)", "field_type": "text", "options": None},
    {"field_key": "contact_department", "field_label": "담당자 소속(부서)", "field_type": "text", "options": None},
    {"field_key": "contact_name_en", "field_label": "담당자 성명(영문)", "field_type": "text", "options": None},
    {"field_key": "contact_position", "field_label": "담당자 직위", "field_type": "text", "options": None},
    {"field_key": "contact_email", "field_label": "담당자 이메일", "field_type": "text", "options": None},
    {"field_key": "contact_mobile", "field_label": "담당자 핸드폰", "field_type": "text", "options": None},
    {"field_key": "application_date", "field_label": "신청일", "field_type": "date", "options": None},
    {"field_key": "signature_company_name", "field_label": "서명 기업명", "field_type": "text", "options": None},
    {"field_key": "signature_ceo_name", "field_label": "서명 대표이사", "field_type": "text", "options": None},
    {"field_key": "company_intro_kr", "field_label": "기업 소개(국문)", "field_type": "long_text", "options": None},
    {"field_key": "company_intro_en", "field_label": "기업 소개(영문)", "field_type": "long_text", "options": None},
]

class _GCSBucketProxy:
    """Supabase Storage 클라이언트(list/upload/update/download/remove/create_signed_url)와
    동일한 인터페이스를 Cloud Storage 위에 구현한 어댑터. 파일 저장소를 Supabase Storage에서
    GCS로 옮기면서, 호출부 코드(수십 곳)는 그대로 두고 클라이언트만 이걸로 바꿔치기한다."""

    def __init__(self, bucket_name: str):
        self._bucket = _gcs_client.bucket(bucket_name)

    def list(self, folder: str):
        prefix = f"{folder}/" if folder else ""
        items = []
        for blob in _gcs_client.list_blobs(self._bucket, prefix=prefix):
            name = blob.name[len(prefix):]
            if not name or "/" in name:
                continue  # 하위 폴더 항목은 제외 - Supabase list()도 해당 폴더 직속 항목만 반환한다.
            items.append({
                "id": blob.name,
                "name": name,
                "created_at": blob.time_created.isoformat() if blob.time_created else "",
            })
        return items

    def create_signed_url(self, path: str, expires_in: int = 3600):
        url = self._bucket.blob(path).generate_signed_url(
            version="v4", expiration=timedelta(seconds=expires_in), method="GET"
        )
        return {"signedURL": url}

    def remove(self, paths):
        for p in paths:
            try:
                self._bucket.blob(p).delete()
            except Exception:
                pass

    def upload(self, path: str, data: bytes, options: dict | None = None):
        content_type = (options or {}).get("content-type", "application/octet-stream")
        self._bucket.blob(path).upload_from_string(data, content_type=content_type)

    def update(self, path: str, data: bytes, options: dict | None = None):
        self.upload(path, data, options)

    def download(self, path: str) -> bytes:
        return self._bucket.blob(path).download_as_bytes()


class _GCSStorageClient:
    def from_(self, bucket_name: str) -> _GCSBucketProxy:
        return _GCSBucketProxy(bucket_name)


_gcs_client = gcs_sdk.Client()
gcs = _GCSStorageClient()


def _pg_connect():
    conn = psycopg2.connect(
        host=CLOUD_SQL_HOST, port=5432, dbname=CLOUD_SQL_DB,
        user=CLOUD_SQL_USER, password=CLOUD_SQL_PASSWORD, sslmode="require",
    )
    conn.autocommit = True
    return conn


_pg_conn = _pg_connect()


def _pg_value(v):
    """dict/list 값은 jsonb 컬럼에 넣을 수 있게 Json으로 감싼다. 그 외 값은 그대로 psycopg2에 맡긴다."""
    if isinstance(v, (dict, list)):
        return psycopg2.extras.Json(v)
    return v


def _pg_row(row: dict | None) -> dict | None:
    """datetime 값을 Supabase 클라이언트와 동일하게 ISO 문자열로 바꾼다 (그 외 타입은 psycopg2가
    이미 Supabase와 같은 파이썬 타입으로 반환한다: uuid/text->str, jsonb->dict/list, bool->bool)."""
    if row is None:
        return None
    for k, v in row.items():
        if isinstance(v, datetime):
            row[k] = v.isoformat()
    return row


class _PgResult:
    def __init__(self, data):
        self.data = data


class _PgQuery:
    """Supabase Python 클라이언트(postgrest)의 체이닝 인터페이스 중 이 프로젝트가 실제로 쓰는
    부분(select/insert/update/delete/eq/in_/order/limit/maybe_single/single/execute/.data)만
    Cloud SQL(psycopg2) 위에 구현한 어댑터. 호출부 코드(80여 곳)는 그대로 두고 클라이언트
    객체만 supabase -> db로 바꿔치기하기 위한 것이다."""

    def __init__(self, table: str):
        self._table = table
        self._op = None
        self._columns = "*"
        self._payload = None
        self._filters = []  # (column, "eq"|"in", value)
        self._order_col = None
        self._order_desc = False
        self._limit_n = None
        self._single_mode = None  # None | "maybe_single" | "single"

    def select(self, columns: str = "*"):
        self._op = self._op or "select"
        self._columns = columns
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, column: str, value):
        self._filters.append((column, "eq", value))
        return self

    def in_(self, column: str, values):
        self._filters.append((column, "in", list(values)))
        return self

    def order(self, column: str, desc: bool = False):
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, n: int):
        self._limit_n = n
        return self

    def maybe_single(self):
        self._single_mode = "maybe_single"
        return self

    def single(self):
        self._single_mode = "single"
        return self

    def _where(self):
        if not self._filters:
            return "", []
        clauses, params = [], []
        for column, op, value in self._filters:
            if op == "eq":
                clauses.append(f'"{column}" = %s')
                params.append(_pg_value(value))
            elif op == "in":
                if not value:
                    clauses.append("FALSE")
                else:
                    # uuid/text 등 컬럼 타입을 몰라도 안전하게 비교하기 위해 컬럼을 text로 캐스팅한다.
                    clauses.append(f'"{column}"::text = ANY(%s)')
                    params.append([str(_pg_value(v)) for v in value])
        return " WHERE " + " AND ".join(clauses), params

    def execute(self):
        global _pg_conn
        where_sql, where_params = self._where()
        # 전역 커넥션 하나를 계속 재사용하는데, 네트워크 순단이나 Cloud SQL 쪽에서 idle
        # 커넥션을 끊는 경우 이 프로세스는 재시작 전까지 계속 죽어있었다. 끊긴 채로
        # 잡히면(InterfaceError/OperationalError) 한 번 재연결해서 다시 시도한다.
        for attempt in range(2):
            try:
                with _pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    if self._op == "select":
                        sql = f'SELECT {self._columns} FROM "{self._table}"{where_sql}'
                        if self._order_col:
                            sql += f' ORDER BY "{self._order_col}" {"DESC" if self._order_desc else "ASC"}'
                        if self._limit_n is not None:
                            sql += f" LIMIT {int(self._limit_n)}"
                        cur.execute(sql, where_params)
                        rows = [_pg_row(dict(r)) for r in cur.fetchall()]
                        if self._single_mode:
                            return _PgResult(rows[0] if rows else None)
                        return _PgResult(rows)

                    if self._op == "insert":
                        rows_in = self._payload if isinstance(self._payload, list) else [self._payload]
                        inserted = []
                        for row in rows_in:
                            cols = list(row.keys())
                            col_sql = ", ".join(f'"{c}"' for c in cols)
                            placeholders = ", ".join(["%s"] * len(cols))
                            vals = [_pg_value(row[c]) for c in cols]
                            cur.execute(f'INSERT INTO "{self._table}" ({col_sql}) VALUES ({placeholders}) RETURNING *', vals)
                            inserted.append(_pg_row(dict(cur.fetchone())))
                        return _PgResult(inserted)

                    if self._op == "update":
                        set_cols = list(self._payload.keys())
                        set_sql = ", ".join(f'"{c}" = %s' for c in set_cols)
                        set_vals = [_pg_value(self._payload[c]) for c in set_cols]
                        cur.execute(f'UPDATE "{self._table}" SET {set_sql}{where_sql} RETURNING *', set_vals + where_params)
                        rows = [_pg_row(dict(r)) for r in cur.fetchall()]
                        return _PgResult(rows)

                    if self._op == "delete":
                        cur.execute(f'DELETE FROM "{self._table}"{where_sql}', where_params)
                        return _PgResult(None)

                    raise RuntimeError("execute() 전에 select/insert/update/delete 중 하나를 호출해야 합니다.")
            except (psycopg2.InterfaceError, psycopg2.OperationalError):
                if attempt == 1:
                    raise
                _pg_conn = _pg_connect()


class _PgClient:
    def table(self, name: str) -> _PgQuery:
        return _PgQuery(name)


db = _PgClient()
gemini_client = genai.Client(vertexai=True, project=VERTEX_AI_PROJECT_ID, location=VERTEX_AI_LOCATION)
vertex_image_client = gemini_client
document_ai_client = documentai.DocumentProcessorServiceClient(
    client_options={"api_endpoint": f"{DOCUMENT_AI_LOCATION}-documentai.googleapis.com"}
)
translate_client = translate.TranslationServiceClient(transport="rest")
TRANSLATE_PARENT = f"projects/{VERTEX_AI_PROJECT_ID}/locations/global"

# 서류 승인/반려, 마감 임박 알림을 Pub/Sub 이벤트로 발행한다 - 발행 쪽(이 백엔드)과 실제 알림
# 생성 쪽(/pubsub/* 구독 엔드포인트)을 분리해서, 나중에 Cloud Run에 배포하면 Pub/Sub가 그 둘을
# 이어준다. 로컬 개발 중에는 토픽이 없거나 권한이 없어도 앱이 죽지 않도록 발행은 항상 best-effort로
# 처리한다(발행 실패가 서류 상태 변경 자체를 막으면 안 되기 때문).
pubsub_publisher = pubsub_v1.PublisherClient()
SUBMISSION_EVENTS_TOPIC = pubsub_publisher.topic_path(
    VERTEX_AI_PROJECT_ID, os.environ.get("PUBSUB_SUBMISSION_EVENTS_TOPIC", "submission-events")
)


def publish_event(topic_path: str, payload: dict):
    try:
        pubsub_publisher.publish(topic_path, json.dumps(payload).encode("utf-8")).result(timeout=10)
    except Exception as e:
        print(f"[pubsub] 이벤트 발행 실패 ({topic_path}): {e}")


def friendly_ai_error(e: Exception) -> str:
    """Gemini API 에러를 사용자에게 보여줘도 되는 한국어 메시지로 바꾼다. 특히 무료 티어
    할당량 초과(429 RESOURCE_EXHAUSTED)는 파이썬 dict가 그대로 노출되지 않도록 따로 처리한다."""
    text = str(e)
    if "RESOURCE_EXHAUSTED" in text or "429" in text:
        return "지금 AI 사용량이 많아 잠시 처리하지 못했습니다. 30초~1분 후 다시 시도해주세요."
    return text


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://jbxport-frontend-639709983318.asia-northeast3.run.app",
    ],
    # vite는 5173 포트가 이미 쓰이고 있으면 5174, 5175...로 자동으로 옮겨간다 — 매번 여기
    # 목록을 손으로 늘리지 않도록 로컬 개발 포트는 통째로 정규식으로 허용한다.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    submission_id: str


class ReviewRequest(BaseModel):
    submission_id: str


class ChatMessage(BaseModel):
    role: str  # "user" | "ai"
    message: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


CHATBOT_SYSTEM_PROMPT = """당신은 소상공인 해외 수출 올인원 AI 플랫폼 '글로티즈(glotiz)'의 공식 안내 챗봇 '글로티(Gloti)'입니다.
수출 준비 과정에서 어려움을 겪는 대표님들이 이 플랫폼(글로티즈)을 활용해 실제로 다음 행동을 할 수 있게 안내하는 게 역할입니다.

[답변 범위 — 반드시 지키세요]
- 이 플랫폼(글로티즈)이 제공하는 기능([주요 안내 영역] 참고)을 중심으로만 답변하세요. 베트남 현지 규제
  세부사항, 시장 조사 방법론처럼 플랫폼과 무관한 일반 창업·무역 지식을 강의하듯 늘어놓지 마세요.
- 그런 질문이 오면, 그 주제를 다루는 플랫폼 기능(있다면)으로 바로 연결하고, 플랫폼 밖 전문 영역(세무·통관·현지
  법률 등)은 길게 설명하지 말고 짧게 "이 부분은 KOTRA나 1:1 전문가 상담을 통해 확인하시는 게 정확해요" 정도로만 안내하세요.

[답변 형식 — 반드시 지키세요, 예외 없음]
- 사람이 옆에서 말해주듯 자연스러운 구어체 대화 문장으로 답하세요. 보고서·기획서처럼 번호 매긴 목록, 소제목,
  단계별 나열로 답하지 마세요.
- **, *, # 같은 마크다운 기호는 절대 쓰지 마세요(그대로 글자로 보입니다).
- 처음 답변은 핵심만 짧고 간결하게 말하세요. 배경 설명, 예상 후속 정보, 세부 절차까지 먼저 다 풀어놓지 말고
  꼭 필요한 한두 문장으로 끝내세요 — 사용자가 "더 자세히", "그럼 어떻게 해야 해" 처럼 추가로 물어봤을 때만
  그 부분을 더 설명하세요.
- 정중하면서도 친절한 말투(~해요체)를 쓰되, 장황하지 않게 깔끔하게 정리해서 답하세요.
- [등록된 공고 목록]에 사용자 질문과 관련된 공고가 있으면 "그런 지원사업이 있어요" 식으로 뭉뚱그리지 말고
  그 공고의 정확한 이름을 콕 집어서 알려주세요 (예: "해외규격인증 획득 지원사업이라는 공고가 있어요").

[주요 안내 영역]
- 지원사업: 기업 맞춤형 수출 바우처 및 정부 지원사업 추천/조건 확인
- 서류 작성: AI 사업계획서, 수출 인보이스, 영문 카탈로그 초안 작성 가이드
- 마케팅 디자인: 다국어 상세페이지, 글로벌 SNS 콘텐츠 AI 생성 방법
- 해외 판매: 타깃 국가 설정, 현지 플랫폼(아마존, 쇼피 등) 연동 및 물류 기초 가이드"""


def fetch_business_context(include_closed: bool = False) -> str:
    """챗봇이 실제 공고 데이터에 근거해 답하도록, 등록된 공고들의 기본 정보(주관기관/접수기간/
    지원대상/지원내용/문의처)를 프롬프트에 넣을 텍스트로 요약한다. 공고 수가 적어(전북 지역 한정)
    벡터 검색 없이 전체를 프롬프트에 그대로 넣는다. 사용자가 마감 여부를 따로 물어본 게 아니면
    이미 마감된 공고는 답변에서 자연히 빠지도록 목록에서 제외한다."""
    rows = (
        db.table("businesses").select("id,name,basic_info").order("created_at", desc=True).execute().data
        or []
    )
    lines = []
    for row in rows:
        info = row.get("basic_info") or {}
        if not any((info.get(k) or "").strip() for k in ("org", "period", "target", "support", "contact")):
            continue
        closed = is_business_closed(row)
        if closed and not include_closed:
            continue
        lines.append(
            f"- {row['name']}{' [마감됨]' if closed else ''} | 주관기관: {info.get('org', '')} "
            f"| 접수기간: {info.get('period', '')} | 지원대상: {info.get('target', '')} "
            f"| 지원내용: {info.get('support', '')} | 문의처: {info.get('contact', '')}"
        )
    return "\n".join(lines)


@app.post("/chat")
def chat(req: ChatRequest):
    history_text = "\n".join(
        f"{'사용자' if h.role == 'user' else 'AI'}: {h.message}" for h in req.history[-6:]
    )
    # 사용자가 이번 메시지나 최근 대화에서 "마감"을 직접 언급한 경우에만 마감된 공고까지
    # 포함시킨다 - 그 외엔 이미 지난 공고를 추천/언급하지 않는다.
    include_closed = "마감" in req.message or any("마감" in h.message for h in req.history[-6:])
    business_context = fetch_business_context(include_closed=include_closed)
    context_block = f"[등록된 공고 목록]\n{business_context}" if business_context else "[등록된 공고 목록]\n(현재 등록된 공고 정보 없음)"
    prompt = f"{CHATBOT_SYSTEM_PROMPT}\n\n{context_block}\n\n{history_text}\n사용자: {req.message}\nAI:"

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return {"answer": (response.text or "").strip()}


# --- 회원가입/로그인 (Cloud SQL + JWT) ---
# 원래는 Supabase Auth를 썼지만, 로그인/계정도 Cloud SQL로 옮겼다. 이 프로젝트 GCP 계정에
# Identity Platform/Firebase를 붙이려면 콘솔에서 한 번 약관 동의를 해야 하는데(Firebase
# Management API가 "the caller does not have permission"로 막음 - 브라우저 로그인이 필요해서
# 이 세션에선 넘을 수 없었다) 그래서 자체 JWT 발급 방식으로 구현했다. bcrypt로 비밀번호를
# 해시하고, HS256 JWT를 발급해서 Authorization: Bearer로 검증한다.
AUTH_JWT_SECRET = _get_secret("jbxport-auth-jwt-secret")
AUTH_TOKEN_TTL_DAYS = 30


def _issue_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "exp": datetime.now(timezone.utc) + timedelta(days=AUTH_TOKEN_TTL_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, AUTH_JWT_SECRET, algorithm="HS256")


def _user_public(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


class SignupRequest(BaseModel):
    email: str
    password: str
    login_id: str | None = None
    name: str | None = None
    phone: str | None = None
    company: str | None = None
    category_id: str | None = None
    country: str | None = None
    account_type: str = "user"


@app.post("/auth/signup")
def auth_signup(req: SignupRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="올바른 이메일을 입력해주세요.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="비밀번호는 6자 이상이어야 합니다.")
    if req.account_type not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="account_type이 올바르지 않습니다.")

    existing = db.table("users").select("id").eq("email", email).maybe_single().execute().data
    if existing:
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.")

    password_hash = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = (
        db.table("users")
        .insert({
            "email": email,
            "password_hash": password_hash,
            "login_id": req.login_id,
            "name": req.name,
            "phone": req.phone,
            "company": req.company,
            "category_id": req.category_id,
            "country": req.country,
            "account_type": req.account_type,
        })
        .execute()
        .data[0]
    )
    token = _issue_token(user)
    return {"access_token": token, "user": _user_public(user)}


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def auth_login(req: LoginRequest):
    email = req.email.strip().lower()
    user = db.table("users").select("*").eq("email", email).maybe_single().execute().data
    if not user or not bcrypt.checkpw(req.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    token = _issue_token(user)
    return {"access_token": token, "user": _user_public(user)}


def _decode_token(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")
    token = authorization.split(" ", 1)[1]
    try:
        return jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="로그인 세션이 만료되었습니다. 다시 로그인해주세요.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")


@app.get("/auth/me")
def auth_me(authorization: str | None = Header(None)):
    payload = _decode_token(authorization)
    user = db.table("users").select("*").eq("id", payload["sub"]).maybe_single().execute().data
    if not user:
        raise HTTPException(status_code=401, detail="계정을 찾을 수 없습니다.")
    return _user_public(user)


class UpdateProfileRequest(BaseModel):
    login_id: str | None = None
    name: str | None = None
    phone: str | None = None
    company: str | None = None


@app.patch("/auth/me")
def auth_update_me(req: UpdateProfileRequest, authorization: str | None = Header(None)):
    payload = _decode_token(authorization)
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        user = db.table("users").select("*").eq("id", payload["sub"]).maybe_single().execute().data
        return _user_public(user)
    user = db.table("users").update(updates).eq("id", payload["sub"]).execute().data[0]
    return _user_public(user)


@app.delete("/account")
def delete_account(authorization: str | None = Header(None)):
    payload = _decode_token(authorization)
    db.table("users").delete().eq("id", payload["sub"]).execute()
    return {"deleted": True}


def require_user(authorization: str | None) -> str:
    """bearer 토큰을 검증하고 로그인한 사용자의 user_id를 반환한다 (관리자 권한은 요구하지 않는다)."""
    payload = _decode_token(authorization)
    return payload["sub"]


ADDITIONAL_DOC_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".hwp", ".jpg", ".jpeg", ".png"}
# 마이페이지에 고정으로 노출되는 서류 슬롯 (슬롯당 파일 1개 - 재업로드하면 기존 파일을 교체한다).
ACCOUNT_DOC_TYPES = {"biz_reg": "사업자 등록증", "product_spec": "상품 상세설명서"}


def _account_doc_folder(user_id: str, doc_type: str) -> str:
    if doc_type not in ACCOUNT_DOC_TYPES:
        raise HTTPException(status_code=400, detail="알 수 없는 서류 종류입니다.")
    return f"additional-docs/{user_id}/{doc_type}"


@app.get("/account/documents")
def list_additional_documents(doc_type: str, authorization: str | None = Header(None)):
    """마이페이지 서류 슬롯(사업자 등록증/상품 상세설명서)에 업로드된 파일을 조회한다."""
    user_id = require_user(authorization)
    folder = _account_doc_folder(user_id, doc_type)
    objects = gcs.from_(TEMPLATES_BUCKET).list(folder)

    documents = []
    for obj in objects or []:
        # 폴더 자체를 나타내는 placeholder 항목은 제외한다.
        if not obj.get("id"):
            continue
        path = f"{folder}/{obj['name']}"
        signed = gcs.from_(TEMPLATES_BUCKET).create_signed_url(path, 3600)
        original_name = obj["name"].split("_", 1)[-1] if "_" in obj["name"] else obj["name"]
        documents.append(
            {
                "path": path,
                "name": original_name,
                "createdAt": obj.get("created_at"),
                "url": signed.get("signedURL"),
            }
        )
    documents.sort(key=lambda d: d["createdAt"] or "", reverse=True)
    return {"documents": documents}


@app.post("/account/documents")
def upload_additional_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    """마이페이지 서류 슬롯에 파일을 업로드한다. 슬롯당 파일 1개만 유지하므로,
    새로 업로드하면 그 슬롯에 있던 기존 파일은 지운다."""
    user_id = require_user(authorization)
    folder = _account_doc_folder(user_id, doc_type)

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ADDITIONAL_DOC_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF, DOCX, HWP, JPG, PNG 파일만 업로드할 수 있습니다.")

    existing = gcs.from_(TEMPLATES_BUCKET).list(folder)
    old_paths = [f"{folder}/{obj['name']}" for obj in (existing or []) if obj.get("id")]
    if old_paths:
        gcs.from_(TEMPLATES_BUCKET).remove(old_paths)

    file_bytes = file.file.read()
    # 원본 파일명을 그대로 스토리지 키에 넣으면 한글/대괄호/공백 때문에 Supabase Storage가
    # "Invalid key"로 거부한다. 키는 안전한 uuid+확장자로만 만들고, 원본 이름은 별도로 반환한다.
    object_path = f"{folder}/{uuid.uuid4().hex}{ext}"
    try:
        gcs.from_(TEMPLATES_BUCKET).upload(
            object_path, file_bytes, {"content-type": file.content_type or "application/octet-stream"}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    return {"path": object_path, "name": file.filename}


@app.delete("/account/documents")
def delete_additional_document(path: str, authorization: str | None = Header(None)):
    """마이페이지 서류 슬롯에서 업로드했던 파일을 삭제한다."""
    user_id = require_user(authorization)
    if not path.startswith(f"additional-docs/{user_id}/"):
        raise HTTPException(status_code=403, detail="본인이 업로드한 서류만 삭제할 수 있습니다.")

    gcs.from_(TEMPLATES_BUCKET).remove([path])
    return {"deleted": True}


@app.post("/submissions/user-upload")
def upload_user_submission(
    template_id: str = Form(...),
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    """관리자가 서식(docx)을 따로 주지 않고 '사용자가 직접 발급받아 올리는' 서류
    (예: 사업자등록증)를 사용자가 업로드하는 엔드포인트."""
    user_id = require_user(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")
    if not template.get("user_upload_required"):
        raise HTTPException(status_code=400, detail="직접 업로드가 필요한 서류가 아닙니다.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ADDITIONAL_DOC_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF, DOCX, HWP, JPG, PNG 파일만 업로드할 수 있습니다.")

    file_bytes = file.file.read()
    # 원본 파일명을 그대로 스토리지 키에 넣으면 한글/대괄호/공백 때문에 Supabase Storage가
    # "Invalid key"로 거부한다. 키는 안전한 uuid+확장자로만 만든다.
    object_path = f"user-submissions/{template_id}/{user_id}/{uuid.uuid4().hex}{ext}"
    try:
        gcs.from_(TEMPLATES_BUCKET).upload(
            object_path, file_bytes, {"content-type": file.content_type or "application/octet-stream"}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    # submissions.status는 'filled'/'generated'만 허용한다(체크 제약) — "uploaded"는 없는 값이라
    # insert가 매번 500으로 죽었었다. 사용자가 올린 파일 자체가 최종 산출물이니 'generated'로 넣는다.
    row = (
        db.table("submissions")
        .insert({"template_id": template_id, "user_id": user_id, "status": "generated", "file_path": object_path})
        .execute()
        .data[0]
    )
    return row


@app.post("/submissions/import-from-account")
def import_submission_from_account(
    template_id: str = Form(...),
    authorization: str | None = Header(None),
):
    """마이페이지 서류 슬롯(사업자등록증/상품 상세설명서)에 이미 올려둔 파일을 그대로
    복사해 해당 공고의 submission으로 등록한다. /submissions/user-upload와 같은 결과를
    만들되, 사용자가 파일을 다시 고를 필요 없이 마이페이지 파일을 재사용한다."""
    user_id = require_user(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")
    if not template.get("user_upload_required"):
        raise HTTPException(status_code=400, detail="직접 업로드가 필요한 서류가 아닙니다.")
    doc_type = template.get("linked_account_doc_type")
    if not doc_type:
        raise HTTPException(status_code=400, detail="마이페이지 서류와 연결되지 않은 항목입니다.")

    folder = _account_doc_folder(user_id, doc_type)
    objects = [obj for obj in (gcs.from_(TEMPLATES_BUCKET).list(folder) or []) if obj.get("id")]
    if not objects:
        raise HTTPException(
            status_code=404, detail=f"마이페이지에 등록된 {ACCOUNT_DOC_TYPES[doc_type]}가 없습니다."
        )
    objects.sort(key=lambda o: o.get("created_at") or "", reverse=True)
    src_name = objects[0]["name"]
    src_path = f"{folder}/{src_name}"
    ext = Path(src_name).suffix.lower()

    file_bytes = gcs.from_(TEMPLATES_BUCKET).download(src_path)
    object_path = f"user-submissions/{template_id}/{user_id}/{uuid.uuid4().hex}{ext}"
    try:
        gcs.from_(TEMPLATES_BUCKET).upload(
            object_path, file_bytes, {"content-type": "application/octet-stream"}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 가져오기에 실패했습니다: {e}")

    row = (
        db.table("submissions")
        .insert({"template_id": template_id, "user_id": user_id, "status": "generated", "file_path": object_path})
        .execute()
        .data[0]
    )
    return row


def require_admin(authorization: str | None) -> str:
    """bearer 토큰을 검증하고 users.account_type == 'admin'인지 확인한다.
    성공 시 user_id를 반환하고, 실패 시 HTTPException을 던진다."""
    payload = _decode_token(authorization)
    user_id = payload["sub"]
    user = db.table("users").select("account_type").eq("id", user_id).maybe_single().execute().data
    if not user or user.get("account_type") != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")
    return user_id


class SetReviewStatusRequest(BaseModel):
    status: str  # "approved" | "needs_revision"
    note: str | None = None


@app.post("/admin/submissions/{submission_id}/review-status")
def set_review_status(submission_id: str, req: SetReviewStatusRequest, authorization: str | None = Header(None)):
    """관리자가 제출된 서류를 승인/반려할 때 쓴다. 상태 변경은 여기서 바로 반영하고, 사용자에게
    보여줄 알림 생성은 Pub/Sub 이벤트로 넘긴다(승인/반려 둘 다 같은 방식으로 처리되도록 통일)."""
    require_admin(authorization)
    if req.status not in ("approved", "needs_revision"):
        raise HTTPException(status_code=400, detail="status는 approved 또는 needs_revision이어야 합니다.")

    submission = db.table("submissions").select("*").eq("id", submission_id).maybe_single().execute().data
    if not submission:
        raise HTTPException(status_code=404, detail="제출 내역을 찾을 수 없습니다.")

    updated = (
        db.table("submissions")
        .update({
            "review_status": req.status,
            "review_note": req.note,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", submission_id)
        .execute()
        .data[0]
    )

    template = (
        db.table("templates").select("name").eq("id", submission["template_id"]).maybe_single().execute().data
    )

    event = {
        "event_type": req.status,
        "submission_id": submission_id,
        "user_id": submission["user_id"],
        "template_id": submission["template_id"],
        "template_name": template["name"] if template else "",
        "note": req.note or "",
    }
    publish_event(SUBMISSION_EVENTS_TOPIC, event)
    # publish_event는 best-effort라 Pub/Sub 토픽/구독이 없으면(로컬 개발 환경) 알림이 절대 오지
    # 않는다 - 실제 push 구독이 붙어 있으면 handle_submission_event가 같은 이벤트를 한 번 더
    # 받을 수 있지만, _create_submission_review_notification 안의 중복 방지로 안전하다.
    _create_submission_review_notification(event)

    return {"submission_id": submission_id, "review_status": updated["review_status"]}


def _decode_pubsub_push(body: dict) -> dict:
    """Pub/Sub push 구독이 보내는 envelope({"message": {"data": base64, ...}})에서
    우리가 발행했던 실제 JSON payload를 꺼낸다."""
    data_b64 = (body.get("message") or {}).get("data") or ""
    if not data_b64:
        return {}
    return json.loads(base64.b64decode(data_b64).decode("utf-8"))


_notified_submission_events = set()  # (event_type, submission_id) 중복 알림 방지 (같은 이벤트가 두 경로로 들어올 수 있어서)


def _create_submission_review_notification(event: dict):
    """서류 승인/반려 이벤트로 사용자에게 보여줄 알림을 만든다. Pub/Sub push(handle_submission_event)와
    set_review_status의 직접 호출 양쪽에서 같이 쓴다 - 이 프로젝트엔 실제 Pub/Sub 토픽/구독이
    구성되어 있지 않아(로컬 개발 환경이라 Pub/Sub가 localhost로 push할 수 없음) publish_event()만
    믿으면 알림이 영영 안 생기므로, set_review_status가 상태 변경 직후 이 함수를 직접도 호출한다."""
    event_type = event.get("event_type")
    if event_type not in ("approved", "needs_revision"):
        return
    submission_id = event.get("submission_id")
    dedup_key = (event_type, submission_id)
    if submission_id and dedup_key in _notified_submission_events:
        return

    template_name = event.get("template_name") or ""
    if event_type == "approved":
        message = f"[{template_name}] 제출하신 서류가 승인되었습니다."
    else:
        note = event.get("note")
        message = f"[{template_name}] 제출하신 서류에 보완이 필요합니다.{f' ({note})' if note else ''}"

    db.table("notifications").insert({
        "user_id": event["user_id"],
        "submission_id": event["submission_id"],
        "template_id": event["template_id"],
        "type": event_type,
        "message": message,
    }).execute()
    if submission_id:
        _notified_submission_events.add(dedup_key)


# 주의: 아래 /pubsub/* 엔드포인트는 Pub/Sub push 구독 전용이라 Supabase 로그인 토큰으로 인증하지
# 않는다. 실제 배포(Cloud Run) 시에는 Cloud Run 자체 인증을 켜고, 해당 push 구독의 서비스 계정에만
# roles/run.invoker를 부여하는 방식으로 막아야 한다(Pub/Sub가 자동으로 OIDC 토큰을 붙여 호출).
@app.post("/pubsub/submission-events")
def handle_submission_event(body: dict = Body(...)):
    """서류 승인/반려 이벤트를 받아 사용자에게 보여줄 알림을 만든다."""
    event = _decode_pubsub_push(body)
    _create_submission_review_notification(event)
    return {"ok": True}


# 위 push 엔드포인트는 공인 URL이 있어야 Pub/Sub가 호출할 수 있어서 로컬 개발(localhost)에서는
# 도달할 수 없다. 그래서 pull 구독으로 백엔드가 직접 메시지를 당겨오는 백그라운드 스레드를 같이
# 띄운다 - 실제로 Pub/Sub를 거쳐서 알림이 만들어지는 걸 로컬에서도 확인할 수 있다. set_review_status가
# 이미 직접 호출로도 알림을 만들어두기 때문에(Pub/Sub가 아직 없던 시절의 안전장치), 같은 이벤트가
# 이 pull 경로로 한 번 더 들어와도 _create_submission_review_notification의 dedup 처리 덕분에
# 알림이 중복 생성되지는 않는다.
pubsub_subscriber = pubsub_v1.SubscriberClient()
SUBMISSION_EVENTS_SUBSCRIPTION = pubsub_subscriber.subscription_path(
    VERTEX_AI_PROJECT_ID, os.environ.get("PUBSUB_SUBMISSION_EVENTS_SUBSCRIPTION", "submission-events-sub")
)


def _handle_pulled_submission_event(message):
    try:
        event = json.loads(message.data.decode("utf-8"))
        _create_submission_review_notification(event)
    except Exception as e:
        print(f"[pubsub] pull 메시지 처리 실패: {e}")
    finally:
        message.ack()


try:
    pubsub_subscriber.subscribe(SUBMISSION_EVENTS_SUBSCRIPTION, callback=_handle_pulled_submission_event)
    print(f"[pubsub] pull 구독 시작: {SUBMISSION_EVENTS_SUBSCRIPTION}")
except Exception as e:
    print(f"[pubsub] pull 구독 시작 실패 (구독이 아직 없거나 권한 문제일 수 있음): {e}")


def business_period_end(business: dict) -> datetime | None:
    """web/src/lib/period.js의 periodEndDate와 같은 로직의 파이썬 버전 - 접수기간 텍스트에서
    마감일만 뽑아낸다. "2026. 7. 30.(목)~8. 18.(화) 자정까지"처럼 끝 날짜에 연도가 없는
    표기가 흔해서(요일/시각 표기 제거 후 숫자가 월/일 2개뿐인 경우), 그럴 땐 시작 날짜의
    연도를 그대로 물려받는다. 그마저도 없으면 조용히 None을 반환한다(상시 접수로 취급)."""
    period = ((business.get("basic_info") or {}).get("period")) or ""
    if "~" not in period:
        return None
    start_str, end_str = period.split("~", 1)
    end_str = re.sub(r"\([^)]*\)", "", end_str)  # "(수)" 같은 요일 표기 제거
    end_str = re.sub(r"\d{1,2}:\d{2}", "", end_str)  # "17:00" 같은 시각 제거
    numbers = re.findall(r"\d+", end_str)
    if len(numbers) >= 3:
        year, month, day = (int(n) for n in numbers[:3])
    elif len(numbers) == 2:
        start_year = re.search(r"\d{4}", start_str)
        if not start_year:
            return None
        year = int(start_year.group())
        month, day = (int(n) for n in numbers[:2])
    else:
        return None
    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def is_business_closed(business: dict) -> bool:
    end = business_period_end(business)
    return bool(end) and end < datetime.now(timezone.utc)


def _run_deadline_check() -> dict:
    """마감이 3일 이내로 남았고, 서류를 하나라도 작성(제출)한 신청자에게 마감임박 알림을 보낸다.
    같은 신청자·공고 조합으로 이미 마감임박 알림을 보낸 적이 있으면 다시 보내지 않는다.
    Cloud Scheduler가 주기적으로 Pub/Sub 토픽에 발행하면, 백엔드의 pull 구독이 그걸 받아서
    이 함수를 실행한다(아래 deadline-check-trigger 구독 참고) - /pubsub/deadline-check
    엔드포인트로 수동/직접 호출할 수도 있다."""
    now = datetime.now(timezone.utc)

    businesses = db.table("businesses").select("id, name, basic_info").execute().data or []
    soon = {}
    for b in businesses:
        end = business_period_end(b)
        if end and timedelta(0) <= (end - now) <= timedelta(days=3):
            soon[b["id"]] = b["name"]
    if not soon:
        return {"ok": True, "notified": 0}

    templates = (
        db.table("templates").select("id, business_id").in_("business_id", list(soon.keys())).execute().data
        or []
    )
    business_by_template = {t["id"]: t["business_id"] for t in templates}
    if not business_by_template:
        return {"ok": True, "notified": 0}

    submissions = (
        db.table("submissions")
        .select("user_id, template_id")
        .in_("template_id", list(business_by_template.keys()))
        .execute()
        .data
        or []
    )
    # (user_id, business_id) 조합 중 서류를 하나라도 작성한 것만 남긴다.
    started_pairs = {
        (s["user_id"], business_by_template[s["template_id"]])
        for s in submissions
        if s["template_id"] in business_by_template
    }
    if not started_pairs:
        return {"ok": True, "notified": 0}

    existing = (
        db.table("notifications")
        .select("user_id, business_id")
        .eq("type", "deadline_soon")
        .in_("business_id", list(soon.keys()))
        .execute()
        .data
        or []
    )
    already_notified = {(n["user_id"], n["business_id"]) for n in existing}

    to_notify = started_pairs - already_notified
    for user_id, business_id in to_notify:
        db.table("notifications").insert({
            "user_id": user_id,
            "business_id": business_id,
            "type": "deadline_soon",
            "message": f"[{soon[business_id]}] 접수 마감이 3일 이내로 다가왔어요. 작성 중인 서류를 확인해주세요.",
        }).execute()

    return {"ok": True, "notified": len(to_notify)}


@app.post("/pubsub/deadline-check")
def handle_deadline_check(body: dict = Body(...)):
    return _run_deadline_check()


# Cloud Scheduler가 매일 이 토픽에 발행하고, 아래 pull 구독으로 백엔드가 직접 받아서
# _run_deadline_check()를 실행한다 - submission-events와 동일하게, 로컬 백엔드는 공인
# 주소가 없어 Cloud Scheduler/Pub/Sub가 직접 호출(push)할 수 없으므로 pull로 받는다.
DEADLINE_CHECK_SUBSCRIPTION = pubsub_subscriber.subscription_path(
    VERTEX_AI_PROJECT_ID, os.environ.get("PUBSUB_DEADLINE_CHECK_SUBSCRIPTION", "deadline-check-trigger-sub")
)


def _handle_pulled_deadline_check(message):
    try:
        result = _run_deadline_check()
        print(f"[pubsub] deadline-check 실행: {result}")
    except Exception as e:
        print(f"[pubsub] deadline-check 처리 실패: {e}")
    finally:
        message.ack()


try:
    pubsub_subscriber.subscribe(DEADLINE_CHECK_SUBSCRIPTION, callback=_handle_pulled_deadline_check)
    print(f"[pubsub] pull 구독 시작: {DEADLINE_CHECK_SUBSCRIPTION}")
except Exception as e:
    print(f"[pubsub] deadline-check pull 구독 시작 실패: {e}")


# --- 프론트엔드가 Supabase 테이블에 직접 쿼리하던 부분을 대체하는 REST 엔드포인트 ---
# DB가 Supabase에서 Cloud SQL로 옮겨가면서, 브라우저가 RLS(row-level security)를 믿고 테이블에
# 직접 접근하던 방식(supabase.from("...").select(...))은 더 이상 쓸 수 없다. 이 구간의
# 엔드포인트들이 그 직접 접근을 대체하고, RLS가 하던 "본인 데이터만" 권한 체크를 여기서 한다.


def _ids(value: str | None) -> list[str]:
    """콤마로 구분된 id 목록 쿼리 파라미터(?id=a,b,c)를 리스트로 바꾼다."""
    if not value:
        return []
    return [v for v in value.split(",") if v]


def _is_admin(authorization: str | None) -> bool:
    try:
        require_admin(authorization)
        return True
    except HTTPException:
        return False


@app.get("/businesses")
def list_businesses(id: str | None = None, order_by: str = "sort_order"):
    q = db.table("businesses").select("*")
    ids = _ids(id)
    if ids:
        q = q.in_("id", ids)
    if order_by not in {"sort_order", "name", "created_at"}:
        order_by = "sort_order"
    rows = q.order(order_by).execute().data or []
    return {"businesses": rows}


@app.get("/businesses/{business_id}")
def get_business(business_id: str):
    row = db.table("businesses").select("*").eq("id", business_id).maybe_single().execute().data
    if not row:
        raise HTTPException(status_code=404, detail="해당 공고를 찾을 수 없습니다.")
    return row


@app.get("/templates")
def list_templates(business_id: str | None = None, id: str | None = None, order_by: str = "sort_order"):
    q = db.table("templates").select("*")
    business_ids = _ids(business_id)
    if len(business_ids) == 1:
        q = q.eq("business_id", business_ids[0])
    elif business_ids:
        q = q.in_("business_id", business_ids)
    ids = _ids(id)
    if ids:
        q = q.in_("id", ids)
    if order_by not in {"sort_order", "form_number", "name", "created_at"}:
        order_by = "sort_order"
    rows = q.order(order_by).execute().data or []
    return {"templates": rows}


@app.get("/template_fields")
def list_template_fields(template_id: str | None = None, field_key: str | None = None, id: str | None = None):
    q = db.table("template_fields").select("*")
    template_ids = _ids(template_id)
    if template_ids:
        q = q.in_("template_id", template_ids)
    field_keys = _ids(field_key)
    if field_keys:
        q = q.in_("field_key", field_keys)
    ids = _ids(id)
    if ids:
        q = q.in_("id", ids)
    rows = q.execute().data or []
    for row in rows:
        row["field_label"] = clean_blank_field_label(
            row.get("field_label"), "", row.get("field_key", "")
        ) or row.get("field_key", "")
    return {"fields": rows}


@app.get("/submissions")
def list_my_submissions(
    template_id: str | None = None,
    review_status: str | None = None,
    authorization: str | None = Header(None),
):
    """로그인한 본인의 제출 내역만 반환한다. 관리자가 전체를 봐야 하면 /admin/submissions를 쓴다."""
    user_id = require_user(authorization)
    q = db.table("submissions").select("*").eq("user_id", user_id)
    template_ids = _ids(template_id)
    if template_ids:
        q = q.in_("template_id", template_ids)
    if review_status:
        q = q.eq("review_status", review_status)
    rows = q.order("created_at", desc=True).execute().data or []
    return {"submissions": rows}


@app.get("/submissions/needs-revision-count")
def count_needs_revision(authorization: str | None = Header(None)):
    """반려(보완 필요) 배지/네비 표시용 개수. 같은 서식을 반려된 뒤 고쳐서 다시 제출하면 예전
    반려 기록 row는 그대로 DB에 남아있으므로, review_status만 단순히 세면 다시 제출한 뒤에도
    계속 "보완 필요"로 잡힌다 — 서식별로 가장 최근 제출 1건의 상태만 봐야 한다."""
    user_id = require_user(authorization)
    rows = db.table("submissions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    latest_by_template = {}
    for r in rows:
        latest_by_template.setdefault(r["template_id"], r)
    count = sum(1 for r in latest_by_template.values() if r.get("review_status") == "needs_revision")
    return {"count": count}


@app.get("/submissions/submitted-template-ids")
def list_submitted_template_ids():
    """홈 화면 '인기 지원사업' 통계용 - 어떤 사용자가 제출했는지는 공개하지 않고, 신청이
    한 건이라도 들어온 template_id 집합만 비로그인 방문자에게도 공개한다."""
    rows = db.table("submissions").select("template_id").execute().data or []
    return {"template_ids": list({r["template_id"] for r in rows})}


@app.get("/admin/submissions")
def list_all_submissions(authorization: str | None = Header(None)):
    require_admin(authorization)
    rows = db.table("submissions").select("*").order("created_at", desc=True).execute().data or []
    return {"submissions": rows}


@app.get("/admin/users")
def list_users_by_id(id: str | None = None, authorization: str | None = Header(None)):
    """신청자 표시용. 서식에 회사명 필드가 없어도 계정에 등록된 이름/회사명으로 보여줄 수 있게
    관리자가 user_id 목록으로 계정 기본정보를 조회한다."""
    require_admin(authorization)
    ids = _ids(id)
    if not ids:
        return {"users": []}
    rows = db.table("users").select("id,name,company").in_("id", ids).execute().data or []
    return {"users": rows}


def _owns_submissions(user_id: str, submission_ids: list[str]) -> bool:
    if not submission_ids:
        return True
    owned = (
        db.table("submissions").select("id").eq("user_id", user_id).in_("id", submission_ids).execute().data or []
    )
    return {r["id"] for r in owned} == set(submission_ids)


@app.get("/submission_values")
def list_submission_values(
    submission_id: str | None = None,
    field_id: str | None = None,
    authorization: str | None = Header(None),
):
    """본인 제출 건이거나 관리자일 때만 조회를 허용한다 (submission_values 자체엔 user_id가 없어서
    submission_id로 소유권을 거슬러 확인해야 한다)."""
    user_id = require_user(authorization)
    submission_ids = _ids(submission_id)
    field_ids = _ids(field_id)
    if not submission_ids and not field_ids:
        raise HTTPException(status_code=400, detail="submission_id 또는 field_id가 필요합니다.")

    if submission_ids and not _is_admin(authorization) and not _owns_submissions(user_id, submission_ids):
        raise HTTPException(status_code=403, detail="본인 제출 내역만 조회할 수 있습니다.")

    q = db.table("submission_values").select("*")
    if submission_ids:
        q = q.in_("submission_id", submission_ids)
    if field_ids:
        q = q.in_("field_id", field_ids)
    rows = q.execute().data or []
    return {"values": rows}


_SIGNED_URL_BUCKETS = {"generated": GENERATED_BUCKET, "templates": TEMPLATES_BUCKET}


@app.get("/generated-file-url")
def get_generated_file_url(path: str, bucket: str = "generated", authorization: str | None = Header(None)):
    """GCS(generated/templates 버킷)에 있는 파일의 서명 URL을 발급한다. 프론트는 GCS 자격증명이
    없어서 직접 서명할 수 없으므로, 다운로드 버튼을 누를 때 이 엔드포인트를 거쳐야 한다."""
    require_user(authorization)
    if bucket not in _SIGNED_URL_BUCKETS:
        raise HTTPException(status_code=400, detail="알 수 없는 버킷입니다.")
    signed = gcs.from_(_SIGNED_URL_BUCKETS[bucket]).create_signed_url(path, 3600)
    return {"url": signed.get("signedURL")}


@app.get("/generated_documents")
def list_generated_documents(submission_id: str | None = None, authorization: str | None = Header(None)):
    require_admin(authorization)
    q = db.table("generated_documents").select("submission_id,file_path")
    submission_ids = _ids(submission_id)
    if submission_ids:
        q = q.in_("submission_id", submission_ids)
    rows = q.execute().data or []
    return {"documents": rows}


class CreateSubmissionRequest(BaseModel):
    template_id: str
    status: str = "filled"


@app.post("/submissions")
def create_submission(req: CreateSubmissionRequest, authorization: str | None = Header(None)):
    """AI 자동작성/정부지원사업 신청 폼을 최종 제출할 때 호출한다. 값(submission_values)은
    이어서 /submission_values로 별도 저장한다 (프론트가 기존에 하던 2단계 저장과 동일한 흐름)."""
    user_id = require_user(authorization)
    row = (
        db.table("submissions")
        .insert({"template_id": req.template_id, "user_id": user_id, "status": req.status})
        .execute()
        .data[0]
    )
    return row


class SubmissionValueIn(BaseModel):
    field_id: str
    value: str = ""
    source: str | None = None
    needs_review: bool = False
    confidence_note: str | None = None


class CreateSubmissionValuesRequest(BaseModel):
    submission_id: str
    values: list[SubmissionValueIn]


@app.post("/submission_values")
def create_submission_values(req: CreateSubmissionValuesRequest, authorization: str | None = Header(None)):
    user_id = require_user(authorization)
    if not _owns_submissions(user_id, [req.submission_id]):
        raise HTTPException(status_code=403, detail="본인 제출 내역에만 값을 저장할 수 있습니다.")
    rows = [{"submission_id": req.submission_id, **v.model_dump()} for v in req.values]
    if rows:
        db.table("submission_values").insert(rows).execute()
    return {"saved": len(rows)}


@app.get("/notifications")
def list_notifications(
    type: str | None = None,
    is_read: bool | None = None,
    count_only: bool = False,
    authorization: str | None = Header(None),
):
    user_id = require_user(authorization)
    q = db.table("notifications").select("*").eq("user_id", user_id)
    if type:
        q = q.eq("type", type)
    if is_read is not None:
        q = q.eq("is_read", is_read)
    rows = q.order("created_at", desc=True).execute().data or []
    if count_only:
        return {"count": len(rows)}
    return {"notifications": rows}


@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, authorization: str | None = Header(None)):
    user_id = require_user(authorization)
    row = db.table("notifications").select("id").eq("id", notification_id).eq("user_id", user_id).maybe_single().execute().data
    if not row:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    db.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    return {"ok": True}


class CreateNotificationRequest(BaseModel):
    user_id: str
    submission_id: str | None = None
    template_id: str | None = None
    type: str
    message: str


@app.post("/admin/notifications")
def create_notification(req: CreateNotificationRequest, authorization: str | None = Header(None)):
    """관리자 페이지의 수동 '알림 보내기' 버튼용."""
    require_admin(authorization)
    row = db.table("notifications").insert(req.model_dump()).execute().data[0]
    return row


@app.get("/bookmarks")
def list_bookmarks(authorization: str | None = Header(None)):
    user_id = require_user(authorization)
    rows = (
        db.table("bookmarks").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    )
    return {"bookmarks": rows}


class CreateBookmarkRequest(BaseModel):
    business_id: str


@app.post("/bookmarks")
def create_bookmark(req: CreateBookmarkRequest, authorization: str | None = Header(None)):
    user_id = require_user(authorization)
    try:
        row = db.table("bookmarks").insert({"user_id": user_id, "business_id": req.business_id}).execute().data[0]
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"이미 북마크한 공고입니다: {e}")
    return row


@app.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: str, authorization: str | None = Header(None)):
    user_id = require_user(authorization)
    row = db.table("bookmarks").select("id").eq("id", bookmark_id).eq("user_id", user_id).maybe_single().execute().data
    if not row:
        raise HTTPException(status_code=404, detail="북마크를 찾을 수 없습니다.")
    db.table("bookmarks").delete().eq("id", bookmark_id).execute()
    return {"deleted": True}


class CreateBusinessRequest(BaseModel):
    name: str
    description: str | None = None


def next_business_sort_order() -> int | None:
    """sort_order 컬럼은 backend/sql/reorder_and_uploads.sql 마이그레이션 실행 후에 생긴다.
    아직 실행 전이라면 조회 자체가 에러이므로, None을 반환해 호출부가 그 컬럼 없이 진행하게 한다."""
    try:
        existing = (
            db.table("businesses")
            .select("sort_order")
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
            .data
        )
    except Exception:
        return None
    if existing and existing[0]["sort_order"] is not None:
        return existing[0]["sort_order"] + 1
    return 1


@app.post("/admin/businesses")
def create_business(req: CreateBusinessRequest, authorization: str | None = Header(None)):
    require_admin(authorization)

    if not req.name.strip():
        raise HTTPException(status_code=400, detail="사업명을 입력해주세요.")

    payload = {"name": req.name.strip(), "description": req.description}
    next_order = next_business_sort_order()
    if next_order is not None:
        payload["sort_order"] = next_order

    row = db.table("businesses").insert(payload).execute().data[0]
    return row


class UpdateOrderRequest(BaseModel):
    sort_order: int


@app.patch("/admin/businesses/{business_id}/order")
def reorder_business(business_id: str, req: UpdateOrderRequest, authorization: str | None = Header(None)):
    require_admin(authorization)
    try:
        row = (
            db.table("businesses")
            .update({"sort_order": req.sort_order})
            .eq("id", business_id)
            .execute()
            .data
        )
    except Exception as e:
        raise HTTPException(
            status_code=409, detail=f"순서 변경에 실패했습니다 (DB 마이그레이션을 먼저 실행해주세요): {e}"
        )
    if not row:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")
    return row[0]


class UpdateBusinessNameRequest(BaseModel):
    name: str


@app.patch("/admin/businesses/{business_id}")
def update_business_name(
    business_id: str, req: UpdateBusinessNameRequest, authorization: str | None = Header(None)
):
    require_admin(authorization)

    if not req.name.strip():
        raise HTTPException(status_code=400, detail="사업명을 입력해주세요.")

    business = (
        db.table("businesses").select("id").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    row = (
        db.table("businesses")
        .update({"name": req.name.strip()})
        .eq("id", business_id)
        .execute()
        .data[0]
    )
    return row


REFERENCE_DOC_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".hwp", ".jpg", ".jpeg", ".png"}


DOCUMENT_AI_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png"}


def extract_text_with_document_ai(file_bytes: bytes, mime_type: str) -> str:
    """Document AI(Document OCR 프로세서)로 공고 원문의 텍스트를 추출한다. 표/스캔본이 섞인
    공고문에서도 Gemini에 파일을 통째로 넣는 것보다 안정적인 원문 텍스트를 얻기 위한 1단계 OCR이다.
    동기 처리라 최대 약 15페이지/20MB까지만 지원한다 — 그보다 큰 문서는 배치 처리가 별도로 필요하다."""
    if not DOCUMENT_AI_PROCESSOR_ID:
        raise RuntimeError(
            "DOCUMENT_AI_PROCESSOR_ID가 설정되지 않았습니다. GCP 콘솔에서 Document AI > Document OCR "
            "프로세서를 만들고 backend/.env에 DOCUMENT_AI_PROCESSOR_ID를 추가해주세요."
        )
    if mime_type not in DOCUMENT_AI_MIME_TYPES:
        raise RuntimeError(f"Document AI가 지원하지 않는 파일 형식입니다: {mime_type}")

    processor_name = document_ai_client.processor_path(
        VERTEX_AI_PROJECT_ID, DOCUMENT_AI_LOCATION, DOCUMENT_AI_PROCESSOR_ID
    )
    request = documentai.ProcessRequest(
        name=processor_name,
        raw_document=documentai.RawDocument(content=file_bytes, mime_type=mime_type),
    )
    result = document_ai_client.process_document(request=request)
    return result.document.text


def build_basic_info_prompt(business_name):
    return f"""당신은 정부 지원사업 공고문(원본 서류)을 읽고, 신청자에게 보여줄 핵심 정보를 요약하는 어시스턴트입니다.
사업명: {business_name}

아래는 Document AI OCR로 추출한 공고문 원문입니다. OCR 특성상 줄바꿈/띄어쓰기가 다소 어긋날 수 있으니
문맥으로 이해하고, 이 원문을 읽고 아래 항목을 채워주세요:
- org: 주관기관 (예: 전북테크노파크)
- period: 접수기간 (예: 2026.08.01 ~ 2026.08.31)
- target: 지원대상
- support: 지원내용 (1~2문장 요약)
- contact: 문의처 (담당부서·전화번호 등)

문서에서 확인할 수 없는 항목은 빈 문자열("")로 두고, 추측해서 지어내지 마세요.
"""


def call_gemini_basic_info(business_name, document_text):
    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[build_basic_info_prompt(business_name), f"\n\n[공고문 원문]\n{document_text}"],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "org": {"type": "STRING"},
                    "period": {"type": "STRING"},
                    "target": {"type": "STRING"},
                    "support": {"type": "STRING"},
                    "contact": {"type": "STRING"},
                },
                "required": ["org", "period", "target", "support", "contact"],
            },
        ),
    )
    return json.loads(response.text)


@app.post("/admin/businesses/{business_id}/reference-doc")
def upload_reference_doc(
    business_id: str,
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    """공고 원문(기본서류)을 업로드하고, AI가 그 문서를 읽어 공고 상세페이지의
    '기본 정보'(주관기관/접수기간/지원대상/지원내용/문의처)를 자동으로 채운다.
    제출용 신청서 템플릿(/admin/templates)과는 별개의, 정보 제공용 문서다."""
    require_admin(authorization)

    business = (
        db.table("businesses").select("*").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in REFERENCE_DOC_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF, DOCX, HWP, JPG, PNG 파일만 업로드할 수 있습니다.")

    file_bytes = file.file.read()
    object_path = f"reference/{business_id}/{uuid.uuid4().hex}{ext}"

    try:
        gcs.from_(TEMPLATES_BUCKET).upload(object_path, file_bytes, {"upsert": "false"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    if ext in (".docx", ".hwp"):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src_path = tmp_path / f"source{ext}"
            src_path.write_bytes(file_bytes)
            try:
                pdf_path = convert_to_pdf(src_path, tmp_path)
                gemini_bytes = pdf_path.read_bytes()
            except Exception as e:
                db.table("businesses").update({"reference_file_path": object_path}).eq(
                    "id", business_id
                ).execute()
                raise HTTPException(status_code=502, detail=f"파일은 업로드됐지만 문서 변환에 실패했습니다: {e}")
        gemini_mime = "application/pdf"
    elif ext == ".pdf":
        gemini_bytes = file_bytes
        gemini_mime = "application/pdf"
    else:
        gemini_bytes = file_bytes
        gemini_mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    try:
        document_text = extract_text_with_document_ai(gemini_bytes, gemini_mime)
        basic_info = call_gemini_basic_info(business["name"], document_text)
    except Exception as e:
        db.table("businesses").update({"reference_file_path": object_path}).eq("id", business_id).execute()
        raise HTTPException(
            status_code=502, detail=f"파일은 업로드됐지만 AI 정보 추출에 실패했습니다: {friendly_ai_error(e)}"
        )

    row = (
        db.table("businesses")
        .update({"reference_file_path": object_path, "basic_info": basic_info})
        .eq("id", business_id)
        .execute()
        .data[0]
    )
    return row


def next_template_sort_order(business_id: str, user_upload_required: bool) -> int | None:
    """새 서식은 항상 그룹(사용자 업로드형/서식 제공형)의 가장자리에 배치한다.
    사용자 업로드형은 매번 맨 위(가장 작은 sort_order)로, 서식 제공형은 맨 아래로 추가한다.
    sort_order 컬럼이 아직 마이그레이션되지 않았으면(select 자체가 에러) None을 반환해
    호출부가 그 컬럼 없이 진행하게 한다."""
    try:
        rows = (
            db.table("templates")
            .select("sort_order")
            .eq("business_id", business_id)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    orders = [r["sort_order"] for r in rows if r["sort_order"] is not None]
    if user_upload_required:
        return (min(orders) - 1) if orders else 0
    return (max(orders) + 1) if orders else 0


@app.post("/admin/templates")
def create_template(
    business_id: str = Form(...),
    name: str = Form(...),
    form_number: str | None = Form(None),
    user_upload_required: bool = Form(False),
    reference_only: bool = Form(False),
    linked_account_doc_type: str | None = Form(None),
    file: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    """서식은 세 종류 중 하나다:
    - 자동완성 서류(기본): {{field_key}} 자리표시자가 있는 docx를 올리면 AI가 채운다.
    - 사용자 제출서류(user_upload_required): 신청자가 자기 파일(사업자등록증 등)을 직접 올린다.
    - 참고자료(reference_only): 제출/자동채움 대상이 아니라 다운로드용으로만 올려두는 파일.
    셋은 동시에 성립할 수 없다."""
    require_admin(authorization)

    if user_upload_required and reference_only:
        raise HTTPException(status_code=400, detail="사용자 제출서류와 참고자료는 동시에 선택할 수 없습니다.")

    business = (
        db.table("businesses").select("id").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")
    if linked_account_doc_type and linked_account_doc_type not in ACCOUNT_DOC_TYPES:
        raise HTTPException(status_code=400, detail="알 수 없는 마이페이지 서류 종류입니다.")

    object_path = None
    if reference_only:
        if not file or not file.filename:
            raise HTTPException(status_code=400, detail="참고자료로 올릴 파일을 선택해주세요.")
        ext = Path(file.filename).suffix.lower()
        if ext not in REFERENCE_DOC_ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="PDF, DOCX, HWP, JPG, PNG 파일만 업로드할 수 있습니다.")
        file_bytes = file.file.read()
        object_path = f"{business_id}/{uuid.uuid4().hex}{ext}"
        try:
            gcs.from_(TEMPLATES_BUCKET).upload(object_path, file_bytes, {"upsert": "false"})
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")
    elif not user_upload_required:
        if not file or not file.filename or not file.filename.lower().endswith(".docx"):
            raise HTTPException(status_code=400, detail="docx 파일만 업로드할 수 있습니다.")

        file_bytes = file.file.read()
        # Supabase Storage 오브젝트 키는 비-ASCII(한글 등)를 허용하지 않아 InvalidKey로 거부한다.
        # 원본 파일명은 storage 경로에 쓰지 않고 templates.name(서식명)에만 사람이 읽을 형태로 남긴다.
        object_path = f"{business_id}/{uuid.uuid4().hex}.docx"

        try:
            gcs.from_(TEMPLATES_BUCKET).upload(
                object_path,
                file_bytes,
                {
                    "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "upsert": "false",
                },
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    payload = {
        "business_id": business_id,
        "name": name,
        "form_number": form_number if not user_upload_required and not reference_only else None,
        "original_file_path": object_path,
        "user_upload_required": user_upload_required,
        "reference_only": reference_only,
        "linked_account_doc_type": linked_account_doc_type if user_upload_required else None,
    }
    sort_order = next_template_sort_order(business_id, user_upload_required)
    if sort_order is not None:
        payload["sort_order"] = sort_order

    try:
        row = db.table("templates").insert(payload).execute().data[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"서류 양식 저장에 실패했습니다: {e}")
    return row


@app.patch("/admin/templates/{template_id}/order")
def reorder_template(template_id: str, req: UpdateOrderRequest, authorization: str | None = Header(None)):
    require_admin(authorization)
    try:
        row = (
            db.table("templates")
            .update({"sort_order": req.sort_order})
            .eq("id", template_id)
            .execute()
            .data
        )
    except Exception as e:
        raise HTTPException(
            status_code=409, detail=f"순서 변경에 실패했습니다 (DB 마이그레이션을 먼저 실행해주세요): {e}"
        )
    if not row:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")
    return row[0]


@app.patch("/admin/templates/{template_id}")
def update_template(
    template_id: str,
    name: str = Form(...),
    form_number: str | None = Form(None),
    linked_account_doc_type: str | None = Form(None),
    file: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    require_admin(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")
    if linked_account_doc_type and linked_account_doc_type not in ACCOUNT_DOC_TYPES:
        raise HTTPException(status_code=400, detail="알 수 없는 마이페이지 서류 종류입니다.")

    if file is not None and file.filename:
        if not file.filename.lower().endswith(".docx"):
            raise HTTPException(status_code=400, detail="docx 파일만 업로드할 수 있습니다.")
        file_bytes = file.file.read()
        try:
            gcs.from_(TEMPLATES_BUCKET).update(
                template["original_file_path"],
                file_bytes,
                {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    update_payload = {"name": name, "form_number": form_number}
    if template.get("user_upload_required"):
        update_payload["linked_account_doc_type"] = linked_account_doc_type

    row = (
        db.table("templates")
        .update(update_payload)
        .eq("id", template_id)
        .execute()
        .data[0]
    )
    return row


@app.delete("/admin/templates/{template_id}")
def delete_template(template_id: str, authorization: str | None = Header(None)):
    require_admin(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    submissions = (
        db.table("submissions").select("id").eq("template_id", template_id).execute().data or []
    )
    submission_ids = [s["id"] for s in submissions]

    if submission_ids:
        generated_docs = (
            db.table("generated_documents")
            .select("file_path")
            .in_("submission_id", submission_ids)
            .execute()
            .data
            or []
        )
        gen_paths = [g["file_path"] for g in generated_docs if g.get("file_path")]
        db.table("generated_documents").delete().in_("submission_id", submission_ids).execute()
        if gen_paths:
            try:
                gcs.from_(GENERATED_BUCKET).remove(gen_paths)
            except Exception:
                pass

        db.table("submission_values").delete().in_("submission_id", submission_ids).execute()
        db.table("submissions").delete().eq("template_id", template_id).execute()

    db.table("template_fields").delete().eq("template_id", template_id).execute()
    db.table("templates").delete().eq("id", template_id).execute()
    try:
        gcs.from_(TEMPLATES_BUCKET).remove([template["original_file_path"]])
    except Exception:
        pass  # storage 파일 삭제 실패는 무시 — DB 정리가 우선이다.

    return {"deleted": True}


@app.delete("/admin/businesses/{business_id}/applicants/{user_id}")
def delete_applicant_submissions(business_id: str, user_id: str, authorization: str | None = Header(None)):
    """마감된 지원사업에서 특정 신청 기업의 제출 내역(그 사업에 낸 서식 전부)을 통째로
    삭제한다 - 관리자가 종료된 공고의 신청 목록을 정리할 때 쓴다."""
    require_admin(authorization)

    template_ids = [
        t["id"]
        for t in (db.table("templates").select("id").eq("business_id", business_id).execute().data or [])
    ]
    if not template_ids:
        return {"deleted": True}

    submission_ids = [
        s["id"]
        for s in (
            db.table("submissions")
            .select("id")
            .eq("user_id", user_id)
            .in_("template_id", template_ids)
            .execute()
            .data
            or []
        )
    ]
    if not submission_ids:
        return {"deleted": True}

    generated_docs = (
        db.table("generated_documents")
        .select("file_path")
        .in_("submission_id", submission_ids)
        .execute()
        .data
        or []
    )
    gen_paths = [g["file_path"] for g in generated_docs if g.get("file_path")]
    db.table("generated_documents").delete().in_("submission_id", submission_ids).execute()
    if gen_paths:
        try:
            gcs.from_(GENERATED_BUCKET).remove(gen_paths)
        except Exception:
            pass

    db.table("submission_values").delete().in_("submission_id", submission_ids).execute()
    db.table("submissions").delete().in_("id", submission_ids).execute()

    return {"deleted": True}


@app.delete("/admin/businesses/{business_id}")
def delete_business(business_id: str, authorization: str | None = Header(None)):
    """지원사업(공고) 자체를 삭제한다. 서식 파일만 지우는 게 아니라, 연결된 서식/제출
    내역/생성된 문서/스토리지 파일까지 전부 함께 삭제한다."""
    require_admin(authorization)

    business = (
        db.table("businesses").select("*").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    templates = (
        db.table("templates")
        .select("id,original_file_path")
        .eq("business_id", business_id)
        .execute()
        .data
        or []
    )
    template_ids = [t["id"] for t in templates]

    if template_ids:
        submissions = (
            db.table("submissions").select("id").in_("template_id", template_ids).execute().data or []
        )
        submission_ids = [s["id"] for s in submissions]

        if submission_ids:
            generated_docs = (
                db.table("generated_documents")
                .select("file_path")
                .in_("submission_id", submission_ids)
                .execute()
                .data
                or []
            )
            gen_paths = [g["file_path"] for g in generated_docs if g.get("file_path")]
            db.table("generated_documents").delete().in_("submission_id", submission_ids).execute()
            if gen_paths:
                try:
                    gcs.from_(GENERATED_BUCKET).remove(gen_paths)
                except Exception:
                    pass

            db.table("submission_values").delete().in_("submission_id", submission_ids).execute()
            db.table("submissions").delete().in_("template_id", template_ids).execute()

        db.table("template_fields").delete().in_("template_id", template_ids).execute()
        db.table("templates").delete().eq("business_id", business_id).execute()

        template_paths = [t["original_file_path"] for t in templates if t.get("original_file_path")]
        if template_paths:
            try:
                gcs.from_(TEMPLATES_BUCKET).remove(template_paths)
            except Exception:
                pass

    if business.get("reference_file_path"):
        try:
            gcs.from_(TEMPLATES_BUCKET).remove([business["reference_file_path"]])
        except Exception:
            pass

    db.table("businesses").delete().eq("id", business_id).execute()

    return {"deleted": True}


class TemplateFieldIn(BaseModel):
    field_key: str
    field_label: str
    field_type: str
    options: list | None = None
    section: str | None = None
    hint: str | None = None


class CreateFieldsRequest(BaseModel):
    fields: list[TemplateFieldIn]


@app.post("/admin/templates/{template_id}/fields")
def create_template_fields(
    template_id: str, req: CreateFieldsRequest, authorization: str | None = Header(None)
):
    require_admin(authorization)

    template = (
        db.table("templates").select("id").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    if not req.fields:
        raise HTTPException(status_code=400, detail="추가할 필드가 없습니다.")

    rows = []
    for f in req.fields:
        if f.field_type not in VALID_FIELD_TYPES:
            raise HTTPException(status_code=400, detail=f"알 수 없는 field_type: {f.field_type}")
        key = f.field_key.strip()
        label = clean_blank_field_label(f.field_label, "", key)
        if not key:
            raise HTTPException(status_code=400, detail="field_key는 비워둘 수 없습니다.")
        if not label:
            continue
        rows.append({
            "template_id": template_id,
            "field_key": key,
            "field_label": label,
            "field_type": f.field_type,
            "options": f.options,
            "section": f.section,
            "hint": f.hint,
        })

    if not rows:
        raise HTTPException(status_code=400, detail="저장할 수 있는 필드가 없습니다.")

    db.table("template_fields").delete().eq("template_id", template_id).execute()
    inserted = db.table("template_fields").insert(rows).execute().data
    return {"fields": inserted}


def build_field_suggestion_prompt(business_name, template_name, field_keys, checkbox_options):
    placeholder_desc = (
        "\n".join(f"- {k}" for k in field_keys) if field_keys else "(없음)"
    )
    checkbox_desc = (
        "\n".join(f"- {o}" for o in checkbox_options) if checkbox_options else "(없음)"
    )
    return f"""당신은 정부지원사업 신청서 서식을 분석해 입력 필드를 설계하는 어시스턴트입니다.
사업명: {business_name}
서식명: {template_name}

이 문서에서 아래 {{{{필드명}}}} 플레이스홀더를 찾았습니다 (신청자가 입력하거나 AI가 채울 자리):
{placeholder_desc}

이 문서에서 아래 '□ 옵션텍스트' 체크박스 후보들도 찾았습니다 (원문 그대로, 아직 어떤 필드로
묶일지는 정해지지 않았습니다):
{checkbox_desc}

작업:
1. 위 플레이스홀더 각각에 대해 field_key(원문 그대로 유지), 한국어 field_label,
   적절한 field_type(text/number/date/select/checkbox/textarea/long_text)을 제안하세요.
   - 회사 소개/사업 계획처럼 긴 서술이 필요한 항목은 long_text
   - 날짜는 date, 전화번호/사업자번호처럼 짧은 값은 text
2. 체크박스 후보들은 의미상 같은 질문에 속하는 것끼리 묶어서, 새로운 field_key(영문 snake_case로
   직접 작명)와 field_label을 만들고 field_type은 "checkbox"로, options에는 그 그룹에 속한
   옵션 원문들을 배열로 넣으세요. 후보가 없으면 빈 배열을 반환하세요.
3. 확신이 안 서는 항목도 최선으로 추측해서 채우되, field_type은 반드시 지정된 값 중 하나여야 합니다.

모든 field_key는 서로 달라야 합니다.
"""


def call_gemini_field_suggestions(business_name, template_name, field_keys, checkbox_options):
    if not field_keys and not checkbox_options:
        return []

    prompt = build_field_suggestion_prompt(business_name, template_name, field_keys, checkbox_options)

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "field_key": {"type": "STRING"},
                        "field_label": {"type": "STRING"},
                        "field_type": {
                            "type": "STRING",
                            "enum": ["text", "number", "date", "select", "checkbox", "textarea", "long_text"],
                        },
                        "options": {"type": "ARRAY", "items": {"type": "STRING"}},
                    },
                    "required": ["field_key", "field_label", "field_type"],
                },
            },
        ),
    )
    return json.loads(response.text)


MAX_BLANK_CANDIDATES = 150
FIELD_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
BLANK_MARKER_RE = re.compile(r"\[\[(?:빈칸|鍮덉뭏)\]\]")


def clean_blank_field_label(label: str | None, context: str, key: str) -> str | None:
    """Keep the internal [[blank]] marker out of user-facing field labels."""
    raw_label = (label or "").strip()
    for candidate in (raw_label, context or "", key or ""):
        cleaned = BLANK_MARKER_RE.sub(" ", str(candidate))
        cleaned = re.sub(r"\s*>\s*", " ", cleaned)
        cleaned = re.sub(r"\s*[-:]\s*$", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:>|\t\r\n")
        if cleaned and not BLANK_MARKER_RE.search(cleaned):
            return cleaned[:60]
    return None


def build_blank_candidate_prompt(business_name, template_name, candidates):
    lines = [f"{i}. {c['context']}" for i, c in enumerate(candidates)]
    return f"""당신은 정부지원사업 신청서 원본 서식(빈칸이 {{{{}}}}로 표시돼있지 않은 순수 양식)을 분석해서,
어디가 신청자가 채워야 할 빈칸인지 판단하는 어시스턴트입니다.
사업명: {business_name}
서식명: {template_name}

아래는 문서에서 자동으로 찾아낸 빈칸 후보 목록입니다. 각 줄은 "번호. 주변 문맥"이고,
[[빈칸]]은 실제로 비어있는 위치를 나타냅니다 (표 형식은 "라벨1 > 라벨2 > ..." 로 표시됨):
{chr(10).join(lines)}

각 번호에 대해 판단하세요:
- 정말 신청자가 채워야 할 정보(회사명, 날짜, 금액, 담당자 정보 등)면 skip=false로 하고
  field_key(영문 snake_case, 예: company_name), 한국어 field_label, field_type을 제안하세요.
- 장식용 공백, 표 레이아웃상 의미 없는 빈칸, 이미 다른 후보와 중복되는 항목이면 skip=true로 하세요.
- field_type은 text/number/date/select/checkbox/textarea/long_text 중 하나여야 합니다.
- 모든 field_key는 서로 달라야 합니다 (겹치면 뒤에 번호를 붙이세요, 예: contact_phone_2).

반드시 입력된 후보 개수와 같은 개수의 결과를, 같은 순서(index)로 반환하세요.
"""


def call_gemini_blank_candidates(business_name, template_name, candidates):
    if not candidates:
        return []

    response = gemini_client.models.generate_content(
        model=TUNED_BLANK_CANDIDATE_MODEL,
        contents=build_blank_candidate_prompt(business_name, template_name, candidates),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "index": {"type": "INTEGER"},
                        "skip": {"type": "BOOLEAN"},
                        "field_key": {"type": "STRING"},
                        "field_label": {"type": "STRING"},
                        "field_type": {
                            "type": "STRING",
                            "enum": ["text", "number", "date", "select", "checkbox", "textarea", "long_text"],
                        },
                        "options": {"type": "ARRAY", "items": {"type": "STRING"}},
                    },
                    "required": ["index", "skip"],
                },
            },
        ),
    )
    return json.loads(response.text)


def apply_vietnam_application_placeholders(doc):
    """베트남 EXPO 참가신청서 원본 표의 고정 위치에 플레이스홀더를 심는다."""
    if len(doc.tables) < 2 or len(doc.tables[0].rows) < 19 or len(doc.tables[1].rows) < 4:
        raise HTTPException(status_code=400, detail="베트남 참가신청서의 표 구조가 예상과 다릅니다.")

    main = doc.tables[0]
    intro = doc.tables[1]
    placements = [
        (main, 0, 3, "company_name_kr"),
        (main, 0, 9, "founded_date"),
        (main, 1, 3, "company_name_en"),
        (main, 1, 9, "ceo_name"),
        (main, 2, 3, "business_reg_number"),
        (main, 3, 3, "main_product"),
        (main, 4, 3, "company_phone"),
        (main, 4, 9, "website"),
        (main, 5, 3, "headquarters_address"),
        (main, 9, 3, "main_export_product"),
        (main, 9, 6, "hs_code"),
        (main, 10, 3, "primary_business_code"),
        (main, 10, 9, "primary_ksic_code"),
        (main, 11, 3, "secondary_business_code"),
        (main, 11, 9, "secondary_ksic_code"),
        (main, 12, 3, "contact_name_kr"),
        (main, 12, 9, "contact_department"),
        (main, 13, 3, "contact_name_en"),
        (main, 13, 9, "contact_position"),
        (main, 14, 3, "contact_email"),
        (main, 14, 9, "contact_mobile"),
        (main, 16, 0, "application_date"),
        (main, 17, 2, "signature_company_name"),
        (main, 17, 8, "signature_ceo_name"),
        (intro, 1, 0, "company_intro_kr"),
        (intro, 3, 0, "company_intro_en"),
    ]
    for table, row_index, cell_index, field_key in placements:
        table.rows[row_index].cells[cell_index].text = "{{" + field_key + "}}"


@app.post("/admin/templates/{template_id}/suggest-fields")
def suggest_template_fields(template_id: str, authorization: str | None = Header(None)):
    require_admin(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")
    business = (
        db.table("businesses").select("name").eq("id", template["business_id"]).maybe_single().execute().data
    )
    business_name = business["name"] if business else template["name"]

    file_bytes = gcs.from_(TEMPLATES_BUCKET).download(template["original_file_path"])
    doc = Document(io.BytesIO(file_bytes))

    if template["business_id"] == VIETNAM_EXPO_BUSINESS_ID and template["name"].strip() == "참가 신청서":
        apply_vietnam_application_placeholders(doc)
        output = io.BytesIO()
        doc.save(output)
        # 같은 Storage 경로를 덮어쓰면 CDN 캐시 때문에 직전 원본이 다시 내려올 수 있어
        # 고정 필드를 심은 파일은 새 경로로 올리고 template 포인터를 교체한다.
        patched_path = f"{template['business_id']}/{uuid.uuid4().hex}.docx"
        gcs.from_(TEMPLATES_BUCKET).upload(
            patched_path,
            output.getvalue(),
            {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
        )
        db.table("templates").update({"original_file_path": patched_path}).eq("id", template_id).execute()
        return {"fields": VIETNAM_APPLICATION_FIELDS}

    field_keys, checkbox_options = extract_docx_fields(doc)

    if not field_keys and not checkbox_options:
        # {{}}/□ 가 전혀 없는 순수 원본 서식 — 표/문단에서 빈칸 후보를 직접 찾아 AI에게 물어보고,
        # 채택된 곳엔 {{field_key}}를 심어서 원본 파일 자체를 업데이트한다.
        candidates = detect_blank_candidates(doc)[:MAX_BLANK_CANDIDATES]
        if not candidates:
            return {"fields": []}

        try:
            decisions = call_gemini_blank_candidates(business_name, template["name"], candidates)
        except Exception:
            return {"fields": []}

        seen_keys = set()
        field_meta = {}
        for d in decisions:
            idx = d.get("index")
            if d.get("skip") or not isinstance(idx, int) or not (0 <= idx < len(candidates)):
                continue
            key = (d.get("field_key") or "").strip()
            if not key or not FIELD_KEY_RE.match(key) or key in seen_keys:
                continue
            field_label = clean_blank_field_label(d.get("field_label"), candidates[idx].get("context", ""), key)
            if not field_label:
                continue
            field_type = d.get("field_type") if d.get("field_type") in VALID_FIELD_TYPES else "text"
            seen_keys.add(key)
            apply_blank_field(candidates[idx], key)
            field_meta[key] = {
                "field_key": key,
                "field_label": field_label,
                "field_type": field_type,
                "options": d.get("options") or None,
                "section": candidates[idx].get("section"),
            }

        # 표 병합이 불규칙한 문서는 서로 다른 후보가 실제로는 같은 셀/문단을 가리킬 수 있어,
        # 나중에 쓴 값이 앞서 쓴 {{}}를 덮어쓸 수 있다. 최종 저장 전에 문서를 다시 스캔해서
        # 실제로 살아남은 {{field_key}}만 결과로 돌려준다 (반환값이 실제 문서와 항상 일치하도록).
        final_keys, _ = extract_docx_fields(doc)
        fields = [field_meta[k] for k in final_keys if k in field_meta]

        if fields:
            output = io.BytesIO()
            doc.save(output)
            gcs.from_(TEMPLATES_BUCKET).update(
                template["original_file_path"],
                output.getvalue(),
                {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            )
        return {"fields": fields}

    try:
        suggestions = call_gemini_field_suggestions(
            business["name"] if business else template["name"], template["name"], field_keys, checkbox_options
        )
    except Exception:
        # AI 제안 실패 시에도 최소한 {{}}로 찾은 field_key는 기본값으로 돌려준다.
        suggestions = [
            {"field_key": k, "field_label": k, "field_type": "text", "options": None} for k in field_keys
        ]

    seen_keys = set()
    fields = []
    for s in suggestions:
        key = (s.get("field_key") or "").strip()
        if not key or key in seen_keys:
            continue
        field_label = clean_blank_field_label(s.get("field_label"), "", key)
        if not field_label:
            continue
        field_type = s.get("field_type") if s.get("field_type") in VALID_FIELD_TYPES else "text"
        seen_keys.add(key)
        fields.append({
            "field_key": key,
            "field_label": field_label,
            "field_type": field_type,
            "options": s.get("options") or None,
            "section": None,
        })

    return {"fields": fields}


def build_gemini_prompt(business_name, template_name, ai_fields, user_values):
    fields_desc = []
    for f in ai_fields:
        line = f"- field_key: {f['field_key']} | label: {f['field_label']} | type: {f['field_type']}"
        if f.get("options"):
            line += f" | options: {json.dumps(f['options'], ensure_ascii=False)}"
        fields_desc.append(line)

    return f"""당신은 정부지원사업 신청서 작성을 돕는 어시스턴트입니다.
사업명: {business_name}
서식명: {template_name}

아래는 신청자가 직접 입력한 정보입니다:
{json.dumps(user_values, ensure_ascii=False, indent=2)}

아래의 비어 있는 필드들을 모두 채워야 합니다:
{chr(10).join(fields_desc)}

규칙:
- 응답에는 위에 제시된 모든 field_key를 정확히 한 번씩 포함하고, value를 비워두지 마세요.
- text 필드는 필드명에 맞는 짧고 자연스러운 값을 작성하세요.
- number 필드는 숫자만, date 필드는 YYYY-MM-DD 형식으로 작성하세요.
- select와 checkbox 필드는 options가 있으면 그중 정확히 일치하는 값 하나만 선택하세요.
- textarea와 long_text 필드는 신청자 정보를 바탕으로 신청서 톤에 맞는 격식 있는 문장을 새로 작성하세요. 국문/영문 필드는 서로 번역이 아니라 각각 자연스럽게 작성하세요.
- 신청자가 입력한 값에서 직접 확인하거나 논리적으로 확정할 수 없는 정보는 시연에 사용할 수 있는 합리적인 예시값으로 채우되 반드시 needs_review를 true로 하고, confidence_note에 확인이 필요한 이유를 짧게 적으세요.
- 특히 등록번호, 날짜, 금액, 수출실적, 인원, 이메일, 전화번호, 주소, URL, HS CODE처럼 사실 확인이 필요한 값을 추정했다면 반드시 needs_review를 true로 표시하세요.
- 입력 정보만으로 충분히 확인되는 값만 needs_review를 false로 하고 confidence_note는 빈 문자열로 두세요.
"""


def call_gemini(business_name, template_name, ai_fields, user_values):
    if not ai_fields:
        return []

    prompt = build_gemini_prompt(business_name, template_name, ai_fields, user_values)

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "field_key": {"type": "STRING"},
                        "value": {"type": "STRING"},
                        "needs_review": {"type": "BOOLEAN"},
                        "confidence_note": {"type": "STRING"},
                    },
                    "required": ["field_key", "value", "needs_review", "confidence_note"],
                },
            },
        ),
    )
    return json.loads(response.text)


def build_extract_from_docs_prompt(template_name, fields):
    fields_desc = []
    for f in fields:
        line = f"- field_key: {f['field_key']} | label: {f['field_label']} | type: {f['field_type']}"
        if f.get("options"):
            line += f" | options: {json.dumps(f['options'], ensure_ascii=False)}"
        fields_desc.append(line)

    return f"""당신은 정부지원사업 신청서 작성을 돕는 어시스턴트입니다.
첨부된 문서는 신청자가 예전에 이 포털에 업로드했던 서류들(예: 사업자등록증, 사업계획서 등)입니다.
지금 작성해야 할 서식명: {template_name}

아래 필드들의 값을 첨부 문서 내용에서 찾아 채워주세요:
{chr(10).join(fields_desc)}

규칙:
- 문서에서 실제로 확인되는 값만 채우세요. 추측하거나 지어내지 마세요.
- 문서에서 찾을 수 없는 필드는 value를 빈 문자열("")로 두세요.
- checkbox 필드는 options 중 문서 내용과 정확히 일치하는 값이 있을 때만 선택하세요.
"""


def call_gemini_extract_from_docs(template_name, fields, doc_parts):
    if not fields or not doc_parts:
        return []

    prompt = build_extract_from_docs_prompt(template_name, fields)

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[*doc_parts, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "field_key": {"type": "STRING"},
                        "value": {"type": "STRING"},
                    },
                    "required": ["field_key", "value"],
                },
            },
        ),
    )
    return json.loads(response.text)


DOC_PART_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


def build_gemini_doc_parts(paths: list[str]) -> list:
    """storage 경로들을 다운로드해 Gemini에 넣을 수 있는 PDF/이미지 Part로 변환한다.
    docx/hwp는 PDF로 변환하고, 다운로드나 변환에 실패하는 파일은 건너뛴다."""
    parts = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for i, path in enumerate(paths):
            ext = Path(path).suffix.lower()
            try:
                file_bytes = gcs.from_(TEMPLATES_BUCKET).download(path)
            except Exception:
                continue

            if ext in (".docx", ".hwp"):
                try:
                    src_path = tmp_path / f"doc{i}{ext}"
                    src_path.write_bytes(file_bytes)
                    pdf_path = convert_to_pdf(src_path, tmp_path)
                    parts.append(types.Part.from_bytes(data=pdf_path.read_bytes(), mime_type="application/pdf"))
                except Exception:
                    continue
            elif ext in DOC_PART_MIME_BY_EXT:
                parts.append(types.Part.from_bytes(data=file_bytes, mime_type=DOC_PART_MIME_BY_EXT[ext]))
    return parts


@app.post("/templates/{template_id}/extract-from-uploads")
def extract_from_uploads(template_id: str, authorization: str | None = Header(None)):
    """작성 중인 서류 화면에서 '업로드한 서류에서 불러오기'를 누르면, 이 사용자가 예전에
    포털에 업로드했던 서류(사업자등록증 등) 파일을 AI(Gemini)가 직접 읽어서 지금 서식의
    빈 칸에 채울 수 있는 값을 뽑아 돌려준다. ai-fill과 마찬가지로 미리보기 용도라
    submission을 만들거나 저장하지 않는다."""
    user_id = require_user(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서류를 찾을 수 없습니다.")

    fields = (
        db.table("template_fields").select("*").eq("template_id", template_id).execute().data or []
    )
    if not fields:
        return {"fields": []}

    all_submissions = (
        db.table("submissions")
        .select("id, template_id, file_path, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    uploaded = [s for s in all_submissions if s.get("file_path")]
    if not uploaded:
        return {"fields": []}

    # 같은 서식을 여러 번 다시 올렸을 수 있으니 서식당 가장 최근 것만, 최대 5개 문서까지만 읽는다.
    seen_templates = set()
    picked = []
    for row in uploaded:
        if row["template_id"] in seen_templates:
            continue
        seen_templates.add(row["template_id"])
        picked.append(row)
        if len(picked) >= 5:
            break

    parts = build_gemini_doc_parts([row["file_path"] for row in picked])
    if not parts:
        return {"fields": []}

    try:
        results = call_gemini_extract_from_docs(template["name"], fields, parts)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"업로드한 서류에서 정보를 불러오지 못했습니다: {friendly_ai_error(e)}"
        )
    return {"fields": results}


@app.post("/templates/{template_id}/extract-from-account")
def extract_from_account_docs(template_id: str, authorization: str | None = Header(None)):
    """작성 중인 서류 화면에서 '마이페이지에서 가져오기'를 누르면, 마이페이지 서류 슬롯(사업자
    등록증/상품 상세설명서)에 올려둔 파일을 AI(Gemini)가 읽어서 지금 서식의 빈 칸에 채울 수 있는
    값을 뽑아 돌려준다. extract-from-uploads와 마찬가지로 미리보기 용도라 submission을 만들거나
    저장하지 않는다."""
    user_id = require_user(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서류를 찾을 수 없습니다.")

    fields = (
        db.table("template_fields").select("*").eq("template_id", template_id).execute().data or []
    )
    if not fields:
        return {"fields": []}

    paths = []
    for doc_type in ACCOUNT_DOC_TYPES:
        folder = _account_doc_folder(user_id, doc_type)
        objects = [obj for obj in (gcs.from_(TEMPLATES_BUCKET).list(folder) or []) if obj.get("id")]
        if not objects:
            continue
        objects.sort(key=lambda o: o.get("created_at") or "", reverse=True)
        paths.append(f"{folder}/{objects[0]['name']}")

    if not paths:
        return {"fields": []}

    parts = build_gemini_doc_parts(paths)
    if not parts:
        return {"fields": []}

    try:
        results = call_gemini_extract_from_docs(template["name"], fields, parts)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"마이페이지 서류에서 정보를 불러오지 못했습니다: {friendly_ai_error(e)}"
        )
    return {"fields": results}


def build_gemini_review_prompt(business_name, template_name, fields, user_values):
    fields_desc = []
    for f in fields:
        line = f"- field_key: {f['field_key']} | label: {f['field_label']} | type: {f['field_type']}"
        if f.get("options"):
            line += f" | options: {json.dumps(f['options'], ensure_ascii=False)}"
        value = user_values.get(f["field_key"], "")
        line += f" | 입력값: {json.dumps(value, ensure_ascii=False)}"
        fields_desc.append(line)

    return f"""당신은 정부지원사업 신청서 제출 내용을 검토하는 심사 보조 어시스턴트입니다.
사업명: {business_name}
서식명: {template_name}

아래는 신청자가 제출한 필드와 입력값입니다:
{chr(10).join(fields_desc)}

각 필드가 비어 있지 않은지, 그리고 값이 해당 필드의 의미에 맞게 논리적으로 타당한지 검토하세요.
판단 기준:
- 필수로 보이는 정보성 필드(회사명/대표자/연락처/사업 개요 등)가 비어 있으면 보완이 필요합니다.
- 값이 있어도 필드 성격과 맞지 않거나(예: 이메일 필드에 이메일 형식이 아닌 값), 너무 짧거나 모순되어 보이면 보완이 필요합니다.
- 전반적으로 내용이 충분하고 일관되면 승인합니다.

status는 다음 중 하나만 사용하세요: "approved"(승인) 또는 "needs_revision"(보완 필요).
note에는 판단 이유를 한국어로 1~2문장 이내로 간결하게 작성하세요. approved인 경우 note는 빈 문자열로 두세요.
"""


def call_gemini_review(business_name, template_name, fields, user_values):
    prompt = build_gemini_review_prompt(business_name, template_name, fields, user_values)

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "status": {"type": "STRING", "enum": ["approved", "needs_revision"]},
                    "note": {"type": "STRING"},
                },
                "required": ["status", "note"],
            },
        ),
    )
    return json.loads(response.text)


def find_soffice() -> str:
    candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return "soffice"


def convert_to_pdf(docx_path: Path, out_dir: Path) -> Path:
    # LibreOffice headless는 프로필을 공유하면 동시 변환 시 잠금 충돌로 실패한다
    # (예: 상세페이지에서 서식 여러 개를 동시에 미리보기할 때). 호출마다 별도 프로필을 써서 피한다.
    profile_dir = out_dir / f"lo_profile_{uuid.uuid4().hex}"
    result = subprocess.run(
        [
            find_soffice(),
            "--headless",
            "--norestore",
            f"-env:UserInstallation=file:///{profile_dir.as_posix()}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(out_dir),
            str(docx_path),
        ],
        capture_output=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"LibreOffice PDF 변환 실패 (code {result.returncode}): "
            f"{result.stderr.decode(errors='replace') or result.stdout.decode(errors='replace')}"
        )
    return out_dir / (docx_path.stem + ".pdf")


@app.get("/templates/{template_id}/preview-pdf")
def preview_template_pdf(template_id: str):
    """공고 상세페이지에서 원본(빈) 서식을 PDF로 미리보기 위한 공개 엔드포인트.
    로그인 여부와 무관하게 볼 수 있어야 하므로 관리자 인증을 요구하지 않는다."""
    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        docx_bytes = gcs.from_(TEMPLATES_BUCKET).download(template["original_file_path"])
        docx_path = tmp_path / "template.docx"
        docx_path.write_bytes(docx_bytes)
        try:
            pdf_path = convert_to_pdf(docx_path, tmp_path)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"PDF 미리보기 생성에 실패했습니다: {e}")
        pdf_bytes = pdf_path.read_bytes()

    return Response(content=pdf_bytes, media_type="application/pdf")


REFERENCE_DOC_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".hwp": "application/x-hwp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


@app.get("/businesses/{business_id}/reference-doc")
def download_reference_doc(business_id: str):
    """공고 상세페이지의 '기본 정보'를 AI가 추출할 때 사용한 원본 공고 파일을
    그대로 다운로드한다. 로그인 여부와 무관하게 볼 수 있어야 하므로 인증을 요구하지 않는다."""
    business = (
        db.table("businesses").select("reference_file_path,name").eq("id", business_id).maybe_single().execute().data
    )
    if not business or not business.get("reference_file_path"):
        raise HTTPException(status_code=404, detail="등록된 기본서류가 없습니다.")

    object_path = business["reference_file_path"]
    ext = Path(object_path).suffix.lower()
    file_bytes = gcs.from_(TEMPLATES_BUCKET).download(object_path)
    media_type = REFERENCE_DOC_MIME_TYPES.get(ext, "application/octet-stream")
    filename = f"{business['name']}_기본서류{ext}"

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


BASIC_INFO_HIGHLIGHT_COLOR = (1, 0.92, 0.23)  # 형광펜 노랑


def highlight_basic_info_in_pdf(pdf_bytes: bytes, basic_info: dict | None) -> bytes:
    """공고 상세페이지 '기본 정보'(주관기관/접수기간/지원대상/지원내용/문의처) 값과 일치하는
    부분을 PDF 안에서 찾아 노란 형광펜 하이라이트를 그린다.
    org/period/contact는 원문에 그대로 나오는 값이라 문장 전체가 대부분 그대로 잡히지만,
    target/support는 AI가 요약한 문장이라 원문 그대로는 거의 안 잡힌다 — 이 경우 값 안의
    의미 있는 단어 단위로 쪼개서 찾은 부분만 하이라이트한다(완벽히 일치하지는 않을 수 있음).
    무엇이든 실패하면(암호화된 PDF 등) 하이라이트 없이 원본 PDF를 그대로 돌려준다."""
    if not basic_info:
        return pdf_bytes

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return pdf_bytes

    try:
        for raw_value in basic_info.values():
            value = (raw_value or "").strip()
            if not value:
                continue
            for page in doc:
                rects = page.search_for(value)
                if not rects:
                    tokens = sorted(
                        {t for t in re.split(r"[\s,./()~\-–·]+", value) if len(t) >= 2},
                        key=len,
                        reverse=True,
                    )[:8]
                    rects = [r for t in tokens for r in page.search_for(t)]
                for rect in rects:
                    annot = page.add_highlight_annot(rect)
                    annot.set_colors(stroke=BASIC_INFO_HIGHLIGHT_COLOR)
                    annot.update()
        return doc.tobytes(garbage=3, deflate=True)
    except Exception:
        return pdf_bytes
    finally:
        doc.close()


@app.get("/businesses/{business_id}/reference-doc/preview-pdf")
def preview_reference_doc_pdf(business_id: str):
    """공고 상세페이지에서 기본서류를 PDF로 바로 미리보기 위한 공개 엔드포인트.
    이미지(jpg/png)는 그대로 반환하고, docx/hwp는 PDF로 변환한다.
    PDF/DOCX/HWP는 '기본 정보' 카드에 나온 내용을 원문에서 찾아 노란 형광펜으로 표시해서 돌려준다."""
    business = (
        db.table("businesses")
        .select("reference_file_path,name,basic_info")
        .eq("id", business_id)
        .maybe_single()
        .execute()
        .data
    )
    if not business or not business.get("reference_file_path"):
        raise HTTPException(status_code=404, detail="등록된 기본서류가 없습니다.")

    object_path = business["reference_file_path"]
    ext = Path(object_path).suffix.lower()
    file_bytes = gcs.from_(TEMPLATES_BUCKET).download(object_path)
    basic_info = business.get("basic_info")

    if ext == ".pdf":
        return Response(content=highlight_basic_info_in_pdf(file_bytes, basic_info), media_type="application/pdf")

    if ext in (".jpg", ".jpeg", ".png"):
        return Response(content=file_bytes, media_type=REFERENCE_DOC_MIME_TYPES[ext])

    if ext in (".docx", ".hwp"):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src_path = tmp_path / f"reference{ext}"
            src_path.write_bytes(file_bytes)
            try:
                pdf_path = convert_to_pdf(src_path, tmp_path)
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"PDF 미리보기 생성에 실패했습니다: {e}")
            pdf_bytes = highlight_basic_info_in_pdf(pdf_path.read_bytes(), basic_info)
            return Response(content=pdf_bytes, media_type="application/pdf")

    raise HTTPException(status_code=415, detail="이 파일 형식은 미리보기를 지원하지 않습니다. 다운로드해서 확인해주세요.")


# 지역/품목 선택 마법사의 매칭은 더 이상 이 백엔드가 AI로 판단하지 않는다 — 프론트엔드
# (GovSupport.jsx)가 각 공고의 지역/품목 키워드를 즉시 대조해서 바로 계산한다.


TRANSLATE_LANGUAGE_NAMES = {"en": "English", "th": "Thai", "vi": "Vietnamese"}


class TranslateFieldsRequest(BaseModel):
    fields: dict[str, str]
    target_lang: str  # "en" | "th" | "vi"


def build_translation_review_prompt(fields_ko, fields_translated, lang_name):
    lines = "\n".join(
        f"- {k}\n  원문(한국어): {fields_ko[k]}\n  번역문({lang_name}): {fields_translated[k]}"
        for k in fields_translated
    )
    return f"""다음은 해외 이커머스 플랫폼(쇼피 등) 상품 등록 정보를 기계번역(Cloud Translation API)으로
{lang_name}로 번역한 결과입니다. 이미 번역은 끝났으니 다시 번역하지 말고, 아래 검수만 하세요.

검수 기준:
- 해당 언어권에서 정치·종교·왕실 관련 민감어, 인종·문화적 금기어, 욕설·비속어 등 현지인이
  불쾌하게 받아들이거나 조심스러워할 만한 단어·표현이 있는지만 확인하세요.
- 문제가 있으면 같은 의미를 전달하는 무난하고 안전한 표현으로 그 부분만 최소한으로 고치세요.
- "+", "&", "/" 같은 기호가 단어 연결 용도로 쓰였다면 자연스러운 단어("and" 등)로 풀어써서
  기호를 최대한 빼세요(예: "Hydrating + Brightening" -> "Hydrating and Brightening"). 다만
  숫자 뒤에 붙는 표기(SPF50+ 같은 제품 스펙 표기)는 의미가 바뀌므로 그대로 두세요.
- 문제가 없으면 번역문을 그대로 반환하세요. 문체나 표현을 임의로 바꾸지 마세요.

{lines}

반드시 원본과 동일한 키를 사용한 JSON 객체로, 각 항목의 최종 값만 응답하세요.
"""


def call_translation_review(fields_ko, fields_translated, lang_name):
    prompt = build_translation_review_prompt(fields_ko, fields_translated, lang_name)
    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {k: {"type": "STRING"} for k in fields_translated},
                "required": list(fields_translated.keys()),
            },
        ),
    )
    return json.loads(response.text)


@app.post("/translate-fields")
def translate_fields(req: TranslateFieldsRequest):
    """쇼피 입점 폼/AI 이미지 생성에 입력한 한국어 값들을 선택한 언어(영/태국/베트남)로 번역한다.
    1차로 Cloud Translation API(NMT)가 빠르게 직역하고, 2차로 Gemini가 그 결과에서 현지 문화권
    민감어·금기어만 검수해서 고친다 - 전체를 Gemini가 새로 번역하는 것보다 빠르면서도 안전장치는
    유지하기 위한 구조. 검수 단계가 실패해도 기계번역 결과는 그대로 돌려준다(전체 요청을 막지 않음)."""
    if req.target_lang not in TRANSLATE_LANGUAGE_NAMES:
        raise HTTPException(status_code=400, detail="지원하지 않는 언어입니다.")

    non_empty = {k: v for k, v in req.fields.items() if (v or "").strip()}
    if not non_empty:
        return {"translated": {k: "" for k in req.fields}}

    keys = list(non_empty.keys())
    try:
        response = translate_client.translate_text(
            request={
                "parent": TRANSLATE_PARENT,
                "contents": [non_empty[k] for k in keys],
                "mime_type": "text/plain",
                "source_language_code": "ko",
                "target_language_code": req.target_lang,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"번역에 실패했습니다: {e}")

    translated = {k: t.translated_text for k, t in zip(keys, response.translations)}

    try:
        lang_name = TRANSLATE_LANGUAGE_NAMES[req.target_lang]
        reviewed = call_translation_review(non_empty, translated, lang_name)
        translated = {k: reviewed.get(k) or translated[k] for k in translated}
    except Exception:
        pass  # 검수 실패해도 기계번역 결과는 그대로 반환한다

    return {"translated": {k: translated.get(k, "") for k in req.fields}}


@app.post("/marketing/ai-fill")
def marketing_ai_fill(
    product_name: str = Form(...),
    product_images: list[UploadFile] = File(...),
    logo: UploadFile | None = File(None),
    style_hint: str = Form(""),
    authorization: str | None = Header(None),
):
    """AI 이미지 생성 페이지의 '상품 정보 입력(Step 3)'에서 'AI로 채우기'를 누르면, Step 1에서 올린
    상품 사진(여러 장 가능)·기업 로고와 Step 2에서 고른 템플릿의 스타일 톤(style_hint)을 함께 보고
    상품명에 맞춰 나머지 정보(태그라인/설명/가격 추천/필수 장면)를 채워준다. 상품명은 사용자가 직접
    쓴 값을 그대로 존중하고 AI가 덮어쓰지 않는다. 가격은 그냥 추정치가 아니라 사진 속 상품의 재질·
    구성·마감 품질을 근거로 한 '해외 판매 추천가'로 채우고, 그 근거(price_reason)를 한 줄로 같이
    돌려준다 — 로고 이미지는 상품으로 착각하거나 이미지 안에 그대로 옮겨 그릴 대상이 아니라 브랜드
    톤(색감·분위기)을 파악하는 참고 자료로만 쓴다."""
    require_user(authorization)

    if not product_name.strip():
        raise HTTPException(status_code=400, detail="상품명을 입력해야 작성 가능합니다.")
    if not product_images:
        raise HTTPException(status_code=400, detail="먼저 상품 사진을 넣어주세요.")
    for img in product_images:
        if (img.content_type or "") not in ALLOWED_PRODUCT_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
    if logo is not None and (logo.content_type or "") not in ALLOWED_PRODUCT_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="로고는 JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")

    image_parts = [
        types.Part.from_bytes(data=img.file.read(), mime_type=img.content_type) for img in product_images
    ]
    logo_note = ""
    if logo is not None:
        image_parts.append(types.Part.from_bytes(data=logo.file.read(), mime_type=logo.content_type))
        logo_note = (
            f"\n첨부된 이미지 중 마지막 한 장은 상품 사진이 아니라 이 브랜드의 로고입니다. "
            f"상품으로 착각하지 말고, 브랜드 색상·톤·분위기를 파악하는 참고 자료로만 쓰세요."
        )
    style_note = f"\n선택된 디자인 템플릿의 스타일 톤: {style_hint.strip()} — 문구의 어휘와 분위기를 이 톤에 맞추세요." if style_hint.strip() else ""

    prompt = f"""당신은 소상공인의 해외 수출 마케팅 자료 작성을 돕는 어시스턴트이자, 수출 상품 가격 컨설턴트입니다.
첨부된 사진{'들' if len(product_images) > 1 else ''} 중 상품 사진은 실제로 판매할 상품입니다. 사진 속 상품의 실제 형태·색상·재질·마감 품질·구성을 자세히 보고,
아래 상품명에 맞는 마케팅 정보를 채워주세요. 사진만으로 알 수 없는 사실(소재 성분 등)은 지어내지 마세요.{logo_note}{style_note}

상품명: {product_name.strip()}

다음 항목을 채워주세요 (상품명이 영어 등 다른 언어로 적혀 있어도 반드시 한국어로 작성하세요.
언어 변경은 화면의 "이미지 언어 설정하기" 버튼으로 사용자가 직접 선택할 때만 이뤄집니다):
- tagline: 한 줄 홍보 문구
- description: 상품 설명 (2~3문장, 사진에 실제로 보이는 특징을 반영)
- price: 해외 판매를 기준으로 AI가 추천하는 가격 (예: "29,000원" 형식). 사진에 보이는 재질·마감·구성 수준과
  비슷한 카테고리 상품의 일반적인 해외 판매가 수준을 근거로 합리적으로 추천하세요.
- price_reason: 위 가격을 추천한 근거를 한 문장으로 (예: "고급 스테인리스 마감과 다기능 구성을 고려한 중가~프리미엄 가격대")
- must_have_photo: 이미지에 꼭 들어갔으면 하는 장면 묘사 (한 문장)
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                *image_parts,
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "tagline": {"type": "STRING"},
                        "description": {"type": "STRING"},
                        "price": {"type": "STRING"},
                        "price_reason": {"type": "STRING"},
                        "must_have_photo": {"type": "STRING"},
                    },
                    "required": ["tagline", "description", "price", "price_reason", "must_have_photo"],
                },
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 채우기에 실패했습니다: {friendly_ai_error(e)}")


class AiFillRequest(BaseModel):
    values: dict[str, str] = {}


@app.post("/templates/{template_id}/ai-fill")
def ai_fill_template(template_id: str, req: AiFillRequest, authorization: str | None = Header(None)):
    """작성 중인 서류 화면에서 'AI 채우기'를 누르면, 지금까지 입력한 값을 참고해 AI가 채울 수
    있는 모든 빈 필드를 채워서 돌려준다. 제출/문서 생성과는 별개로 값만 미리보고
    편집할 수 있게 하기 위한 용도라 submission을 만들거나 저장하지 않는다."""
    require_user(authorization)

    template = (
        db.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서류를 찾을 수 없습니다.")
    business = (
        db.table("businesses").select("name").eq("id", template["business_id"]).maybe_single().execute().data
    )
    business_name = business["name"] if business else template["name"]

    fields = (
        db.table("template_fields").select("*").eq("template_id", template_id).execute().data or []
    )
    ai_fields = [
        f for f in fields
        if not str(req.values.get(f["field_key"], "") or "").strip()
    ]

    try:
        # 필드가 많은 신청서를 한 번에 요청하면 모델 응답 길이 때문에 뒤쪽 항목이 누락될 수 있다.
        # 작은 묶음으로 나눠 요청한 뒤 아래에서 원래 필드 순서대로 다시 조립한다.
        raw_results = []
        for start in range(0, len(ai_fields), 15):
            raw_results.extend(
                call_gemini(
                    business_name,
                    template["name"],
                    ai_fields[start:start + 15],
                    req.values,
                )
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 채우기에 실패했습니다: {friendly_ai_error(e)}")

    result_by_key = {
        item.get("field_key"): item
        for item in raw_results
        if item.get("field_key")
    }

    def fallback_value(field):
        options = field.get("options") or []
        if options:
            first = options[0]
            if isinstance(first, dict):
                return str(first.get("value") or first.get("label") or "확인 필요")
            return str(first)

        field_type = field.get("field_type")
        search_text = f"{field.get('field_key', '')} {field.get('field_label', '')}".lower()
        if field_type == "date":
            return datetime.now(timezone.utc).date().isoformat()
        if field_type == "number":
            return "0"
        if "email" in search_text or "이메일" in search_text:
            return "contact@example.com"
        if any(token in search_text for token in ("phone", "tel", "전화", "핸드폰", "연락처")):
            return "010-0000-0000"
        if any(token in search_text for token in ("homepage", "website", "url", "링크", "홈페이지")):
            return "https://example.com"
        if "hs" in search_text and "code" in search_text:
            return "3304.99"
        if "원산지" in search_text or "origin" in search_text:
            return "대한민국"
        if field_type in ("textarea", "long_text"):
            return "관련 내용을 확인하여 보완해주세요."
        return "확인 필요"

    results = []
    for field in ai_fields:
        item = result_by_key.get(field["field_key"]) or {}
        value = str(item.get("value") or "").strip() or fallback_value(field)
        options = field.get("options") or []
        option_values = [
            str((option.get("value") or option.get("label") or "") if isinstance(option, dict) else option)
            for option in options
        ]
        option_values = [option for option in option_values if option]
        if field.get("field_type") in ("select", "checkbox") and option_values and value not in option_values:
            value = option_values[0]
        if field.get("field_type") == "date" and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            value = fallback_value(field)
        if field.get("field_type") == "number" and not re.fullmatch(r"-?\d+(?:\.\d+)?", value):
            value = fallback_value(field)
        results.append({
            "field_key": field["field_key"],
            "value": value,
            # 빈칸을 AI가 새로 만든 값은 제출 전에 사용자가 한 번 확인하도록 보수적으로 표시한다.
            "needs_review": True,
            "confidence_note": item.get("confidence_note") or "AI가 생성한 값이므로 실제 정보와 일치하는지 확인해주세요.",
        })
    return {"fields": results}


@app.post("/generate")
def generate(req: GenerateRequest):
    submission_id = req.submission_id

    submission = (
        db.table("submissions").select("*").eq("id", submission_id).single().execute().data
    )
    if not submission:
        raise HTTPException(status_code=404, detail="submission을 찾을 수 없습니다.")

    template = (
        db.table("templates").select("*").eq("id", submission["template_id"]).single().execute().data
    )
    business = (
        db.table("businesses").select("*").eq("id", template["business_id"]).single().execute().data
    )
    fields = (
        db.table("template_fields").select("*").eq("template_id", template["id"]).execute().data
    )
    field_by_id = {f["id"]: f for f in fields}

    existing_values = (
        db.table("submission_values").select("*").eq("submission_id", submission_id).execute().data
    )

    user_values = {}
    review_fields = set()
    for v in existing_values:
        field = field_by_id.get(v["field_id"])
        if not field:
            continue
        user_values[field["field_key"]] = v["value"]
        if v.get("needs_review"):
            review_fields.add(field["field_key"])

    # 이미 값이 있는 필드(source와 무관하게)는 다시 생성하지 않는다 — 그렇지 않으면 사용자가 직접
    # 입력/검토해서 제출한 값을 AI가 재생성으로 덮어써버리고, 새로 생긴 needs_review 플래그 때문에
    # 실제 제출본과 다른 형광펜 표시가 최종 문서에 남는다.
    ai_fields = [
        f
        for f in fields
        if f["field_type"] in AI_FIELD_TYPES and not (user_values.get(f["field_key"]) or "").strip()
    ]
    ai_field_by_key = {f["field_key"]: f for f in ai_fields}

    try:
        ai_results = call_gemini(business["name"], template["name"], ai_fields, user_values)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"완성된 서류를 만드는 데 실패했습니다: {friendly_ai_error(e)}")

    new_rows = []
    for item in ai_results:
        field = ai_field_by_key.get(item.get("field_key"))
        if not field:
            continue
        needs_review = bool(item.get("needs_review", False))
        new_rows.append({
            "submission_id": submission_id,
            "field_id": field["id"],
            "value": item.get("value", ""),
            "source": "ai_generated",
            "needs_review": needs_review,
            "confidence_note": item.get("confidence_note") or None,
        })
        user_values[field["field_key"]] = item.get("value", "")
        if needs_review:
            review_fields.add(field["field_key"])

    if new_rows:
        db.table("submission_values").insert(new_rows).execute()

    values = {}
    checkbox_selections = {}
    for f in fields:
        key = f["field_key"]
        val = user_values.get(key)
        if f["field_type"] == "checkbox":
            if val:
                checkbox_selections[key] = val
        else:
            values[key] = val

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        template_bytes = gcs.from_(TEMPLATES_BUCKET).download(template["original_file_path"])
        template_path = tmp_path / "template.docx"
        template_path.write_bytes(template_bytes)

        output_docx = tmp_path / "output.docx"
        fill_document(str(template_path), str(output_docx), values, checkbox_selections, review_fields)

        pdf_path = convert_to_pdf(output_docx, tmp_path)

        storage_path = f"{submission_id}/document.pdf"
        with open(pdf_path, "rb") as fh:
            gcs.from_(GENERATED_BUCKET).upload(
                storage_path,
                fh.read(),
                {"content-type": "application/pdf", "upsert": "true"},
            )

    generated_doc = (
        db.table("generated_documents")
        .insert({
            "submission_id": submission_id,
            "file_path": storage_path,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
        .execute()
        .data[0]
    )

    db.table("submissions").update({"status": "generated"}).eq("id", submission_id).execute()

    return {
        "submission_id": submission_id,
        "file_path": storage_path,
        "generated_document_id": generated_doc["id"],
    }


@app.post("/review")
def review(req: ReviewRequest):
    submission_id = req.submission_id

    submission = (
        db.table("submissions").select("*").eq("id", submission_id).single().execute().data
    )
    if not submission:
        raise HTTPException(status_code=404, detail="submission을 찾을 수 없습니다.")

    template = (
        db.table("templates").select("*").eq("id", submission["template_id"]).single().execute().data
    )
    business = (
        db.table("businesses").select("*").eq("id", template["business_id"]).single().execute().data
    )
    fields = (
        db.table("template_fields").select("*").eq("template_id", template["id"]).execute().data
    )
    field_by_id = {f["id"]: f for f in fields}

    existing_values = (
        db.table("submission_values").select("*").eq("submission_id", submission_id).execute().data
    )
    user_values = {}
    for v in existing_values:
        field = field_by_id.get(v["field_id"])
        if field:
            user_values[field["field_key"]] = v["value"]

    try:
        result = call_gemini_review(business["name"], template["name"], fields, user_values)
        status = result.get("status")
        if status not in ("approved", "needs_revision"):
            status = "needs_revision"
        note = result.get("note") or None
    except Exception:
        # Gemini 호출 실패 시 승인으로 잘못 표시되는 일이 없도록 항상 보완 필요로 처리한다.
        status = "needs_revision"
        note = "AI 검토 중 오류가 발생했습니다. 관리자가 직접 확인해주세요."

    updated = (
        db.table("submissions")
        .update({
            "review_status": status,
            "review_note": note,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", submission_id)
        .execute()
        .data[0]
    )

    if status == "needs_revision":
        message = f"[{template['name']}] 제출하신 서류에 보완이 필요합니다.{f' ({note})' if note else ''}"
        db.table("notifications").insert({
            "user_id": submission["user_id"],
            "submission_id": submission_id,
            "template_id": template["id"],
            "type": "needs_revision",
            "message": message,
        }).execute()

    return {
        "submission_id": submission_id,
        "review_status": updated["review_status"],
        "review_note": updated["review_note"],
    }


# --- AI 이미지 생성 (마케팅 이미지: 포스터 / 카드뉴스 / 상세설명) ---
# 이미지 생성과 문구(카피) 생성 모두 Vertex AI(gemini_client)를 사용한다. 이미지 안에는 어떤 문자도
# 렌더링하지 않고, 실제 문구는 프론트엔드가 이미지 위에 CSS로 오버레이한다 (NO_TEXT_INSTRUCTION 참고).

ALLOWED_PRODUCT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

AI_MODEL_ON_NOTE = (
    "장면에 자연스러운 포토리얼리스틱 AI 인물 모델을 등장시켜, 상품을 사용하거나 손에 들고 있는 "
    "모습으로 자연스럽게 연출하세요. 인물의 얼굴·손·신체 비율과 자세가 사실적으로 보이도록 하고, "
    "과도하게 눈에 띄어 상품보다 시선을 빼앗지 않게 하세요."
)
AI_MODEL_OFF_NOTE = "사람 모델 없이, 상품 자체가 화면의 중심이 되는 순수 제품 사진으로 구성하세요."

LOGO_REFERENCE_NOTE = (
    "참고로 첨부된 이미지 중 마지막 한 장은 상품 사진이 아니라 이 브랜드의 로고입니다. "
    "상품으로 착각해 등장시키지 말고, 브랜드 색상·톤을 파악하는 참고 자료로만 쓰세요. "
    "이 로고를 문자·워터마크·인쇄물처럼 이미지 안에 렌더링하지 마세요."
)

NO_TEXT_INSTRUCTION = (
    "이미지 안에 어떠한 문자, 숫자, 로고 텍스트, 워터마크도 절대 렌더링하지 마세요. "
    "문구·캡션·타이포그래피 요소 없이 순수한 사진/장면 이미지만 생성하세요. 문구는 이후 별도로 합성됩니다. "
    "실제 상업 스튜디오에서 촬영한 사진처럼 사실적인 조명·그림자·질감·반사를 살리고, "
    "인공적인 대칭·과도한 채도·플라스틱 같은 질감 등 AI가 생성한 티가 나는 요소는 피하세요."
)

MARKETING_ASSETS_DIR = Path(__file__).parent / "marketing_assets"


def _load_marketing_asset(filename: str) -> tuple[bytes, str] | None:
    path = MARKETING_ASSETS_DIR / filename
    if not path.exists():
        return None
    mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return path.read_bytes(), mime


# 템플릿(포스터/상세페이지 등) 중 실제 참고 디자인 이미지가 준비된 것만 등록한다 — 없는
# 템플릿은 지금처럼 style_hint 텍스트만으로 생성한다.
TEMPLATE_STYLE_REFERENCE_IMAGES = {
    "tpl-detail-classic": _load_marketing_asset("detail-classic-reference.png"),
    "tpl-detail-premium": _load_marketing_asset("detail-premium-reference.png"),
    "tpl-detail-trendy": _load_marketing_asset("detail-trendy-reference.png"),
    "tpl-poster-minimal": _load_marketing_asset("poster-minimal-reference.jpg"),
    "tpl-poster-pop": _load_marketing_asset("poster-pop-reference.jpg"),
    "tpl-poster-emotional": _load_marketing_asset("poster-emotional-reference.jpg"),
    "tpl-poster-modern": _load_marketing_asset("poster-modern-reference.jpg"),
}

STYLE_REFERENCE_NOTE = (
    "참고로 첨부된 이미지 중 맨 마지막 한 장은 상품 사진이 아니라, 이 템플릿이 지향하는 사진 스타일(배경·소재·"
    "조명·색감·구도)을 보여주는 예시 이미지입니다. 이 예시 속 상품·텍스트·레이아웃을 그대로 베끼지 말고, "
    "오직 전체적인 분위기와 톤만 참고하세요. 실제로 그려야 하는 상품은 그 앞에 첨부된 참고 사진 속 상품입니다."
)


def _with_rate_limit_retry(fn, max_retries: int = 4, base_delay: float = 2.0):
    """Gemini/Vertex AI가 429(RESOURCE_EXHAUSTED)로 순간적인 사용량 폭주를 거절할 때, 바로
    실패 처리하지 않고 짧게 쉬었다가 몇 번 더 시도한다 — 상세페이지/카드뉴스처럼 여러 장을
    한꺼번에 병렬로 요청하면 짧은 순간에 호출이 몰려서 이 순간적인 429가 나기 쉬워졌기 때문에
    (병렬화 이전에는 순서대로 호출해서 거의 안 나던 에러다). 재시도로도 안 되면 마지막 예외를
    그대로 던져서 friendly_ai_error가 사용자에게 안내 메시지를 보여주게 한다."""
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as e:
            text = str(e)
            if "RESOURCE_EXHAUSTED" not in text and "429" not in text:
                raise
            last_error = e
            if attempt < max_retries:
                time.sleep(base_delay * (2**attempt))
    raise last_error


def _generate_image(
    prompt: str, reference_images: list[tuple[bytes, str]], aspect_ratio: str
) -> tuple[bytes, str]:
    """Vertex AI 이미지 생성 모델을 호출해 (이미지 bytes, mime_type)을 반환한다.
    reference_images는 (bytes, mime_type) 튜플 목록 — 상품 사진을 여러 장 올렸으면 전부 같이
    넘겨서, 여러 각도/구성을 참고해 더 정확한 이미지를 만들도록 한다."""
    response = _with_rate_limit_retry(
        lambda: vertex_image_client.models.generate_content(
            model=IMAGE_GEN_MODEL,
            contents=[
                *[types.Part.from_bytes(data=b, mime_type=m) for b, m in reference_images],
                prompt,
            ],
            config=types.GenerateContentConfig(
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
            ),
        )
    )
    if response.candidates:
        for part in response.candidates[0].content.parts:
            if getattr(part, "inline_data", None) is not None:
                return part.inline_data.data, part.inline_data.mime_type
    raise RuntimeError("이미지가 생성되지 않았습니다.")


def _generate_copy_json(prompt: str, schema: dict) -> dict:
    """문구(JSON) 생성 — Vertex AI gemini_client를 재사용한다."""
    response = _with_rate_limit_retry(
        lambda: gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema),
        )
    )
    return json.loads(response.text)


def _upload_generated_image(user_id: str, gen_id: str, slot: str, image_bytes: bytes, mime_type: str) -> dict:
    ext = "png" if "png" in mime_type else "jpg"
    path = f"marketing-images/{user_id}/{gen_id}/{slot}.{ext}"
    gcs.from_(GENERATED_BUCKET).upload(
        path, image_bytes, {"content-type": mime_type, "upsert": "true"}
    )
    signed = gcs.from_(GENERATED_BUCKET).create_signed_url(path, 3600)
    return {"slot": slot, "path": path, "url": signed.get("signedURL")}


def _generate_slots_parallel(user_id, gen_id, slot_prompts, reference_images, aspect_ratio="1:1"):
    """카드뉴스/상세페이지처럼 여러 장을 만들 때, 슬롯마다 독립적인 Gemini 이미지 생성 호출을
    순서대로 기다리지 않고 동시에 실행한다 — 슬롯당 몇 초씩 걸리는 호출이 3~7번 이어지면 체감
    대기 시간이 그만큼 길어지므로, 서로 의존관계가 없는 호출을 병렬로 묶어 전체 대기 시간을
    슬롯 수가 아니라 가장 느린 슬롯 하나 수준으로 줄인다. 결과 순서는 상관없다 — 프론트는
    "slot" 값으로 이미지를 찾아 쓴다.
    slot_prompts의 각 항목은 (slot, prompt) 2개 또는 (slot, prompt, aspect_ratio) 3개 튜플이다
    (3개짜리면 그 슬롯만 기본 aspect_ratio 대신 지정된 비율을 쓴다 — 상세페이지 히어로처럼
    다른 슬롯과 비율이 다른 경우)."""
    def run(item):
        slot, prompt, *rest = item
        ratio = rest[0] if rest else aspect_ratio
        image_bytes, mime = _generate_image(prompt, reference_images, ratio)
        return _upload_generated_image(user_id, gen_id, slot, image_bytes, mime)

    # 한꺼번에 너무 많이 몰아서 요청하면 순간적으로 429(사용량 초과)를 유발하기 쉬워서, 동시
    # 실행 수를 3개로 제한한다 — 순차 실행보다는 훨씬 빠르면서도 폭주는 피하는 절충점.
    with ThreadPoolExecutor(max_workers=min(len(slot_prompts), 3)) as executor:
        return list(executor.map(run, slot_prompts))


def _style_line(style_hint: str) -> str:
    return f"\n스타일 톤: {style_hint.strip()}" if style_hint and style_hint.strip() else ""


def _poster_prompt(
    product_name: str, description: str, must_have_photo: str, style_hint: str = "",
    aspect_ratio: str = "4:5", tagline: str = "", price: str = "", logo_render_note: str = "",
    target_language: str = "ko", use_ai_model: bool = True,
) -> str:
    scene = must_have_photo.strip() or "상품을 돋보이게 하는 매력적인 장면을 자유롭게 구성하세요."
    # "AI 모델 적용"이 꺼져 있으면, 사용자가 적은 장면에 사람이 나온다는 내용이 있어도 사람 없이
    # 표현해야 한다 — 이 문장이 "반드시 포함"이라고 강하게 지시하는 자리라 뒤에 오는 모델 on/off
    # 안내보다 우선 적용될 수 있어서, 아예 이 자리에서 같이 명시한다.
    if not use_ai_model and must_have_photo.strip():
        scene += " (단, 사람 없이 상품/손·소품만으로 표현하세요.)"
    lang_name = TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean"
    logo_line = f"\n{logo_render_note}" if logo_render_note else ""
    return f"""당신은 상업 광고 사진작가 겸 그래픽 디자이너입니다. 아래 정보를 바탕으로 완성된 마케팅 포스터 한 장을 만들어주세요.
상품명: {product_name}
태그라인: {tagline or '(없음)'}
상품 설명: {description or '(설명 없음)'}
가격: {price or '(없음)'}
반드시 포함되어야 하는 장면: {scene}{logo_line}

요구사항: 첨부된 참고 사진 속 실제 상품과 동일한 형태·색상·재질로 등장시키세요.
세로로 긴 {aspect_ratio} 비율로 네이티브하게 구성하세요.
상품명·태그라인·가격은 나중에 프론트엔드가 얹는 게 아니라, 지금 이 이미지 안에 실제 문구를 디자인 요소로 직접 렌더링해주세요 — 상품명이 가장 크고 강한 타이포그래피 요소여야 합니다.
모든 렌더링 문구는 {lang_name} 언어로만 쓰고, 한글이나 다른 언어를 섞지 마세요 — 소스 데이터가 한글처럼 보여도 마찬가지입니다.
이건 예외 없는 필수 규칙입니다 — 완성된 이미지 어디에도 한글 문자가 절대 나타나면 안 됩니다.
글자는 매끈하고 정확한 철자로, 뭉개지거나 뒤틀리거나 겹치지 않게 완벽하게 읽혀야 합니다. 깨끗하게 렌더링될 자신이 없는 문구는 줄여서 쓰세요.
특정 문구가 진짜 {lang_name}로 쓰인 게 확실하지 않으면(한글일 수도 있다면), 절대 넣지 말고 그 요소를 완전히 생략하세요.
값이 없는 항목(태그라인·가격 등)은 자리표시자나 빈 박스 없이 자연스럽게 생략하세요.
가짜 헤드라인·가짜 가격·가짜 CTA·의미 없는 텍스트를 지어내지 마세요.
실제 스튜디오에서 촬영한 것처럼 사실적인 조명·그림자·반사를 살려서, AI가 생성한 티가 나지 않는 고급 상업광고 포스터 사진 스타일로 만들어주세요.{_style_line(style_hint)}"""


CARD_NEWS_SHOPEE_PROMPT = """ROLE
You are a professional e-commerce visual designer specializing in Shopee product marketing and commercial advertising.
Create ONE square product advertising photograph according to the provided CARD_TYPE.
This image is part of a reusable four-card Shopee advertising template system.
The visual structure must remain consistent across different products.
All product-specific content must be dynamically populated from PRODUCT_DATA.

CORE SYSTEM
The template follows this data flow:
PRODUCT DATABASE
→ AD TEMPLATE FIELD MAPPING
→ IMAGE GENERATION
Never hard-code a specific product name, description, feature, usage instruction, price, discount, or promotion into the template.
Always retrieve those values from PRODUCT_DATA.

OUTPUT FORMAT
Aspect ratio: 1:1
Recommended resolution: 1024 x 1024

TEXT IS RENDERED IN THIS IMAGE
Unlike a generic product photo, this template renders its own typography directly into the image —
the headline, benefit labels, usage steps, prices, and CTA are all real rendered text, not reserved
empty space. Render every text field's ACTUAL supplied value exactly as given — do not paraphrase,
translate, or invent wording. If a field is empty, per the EMPTY FIELD RULE below simply omit that
element (no placeholder, no blank box) rather than leaving a broken gap.
Keep every line of rendered text crisp, correctly spelled, and fully legible — never render smudged,
warped, doubled, or illegible letterforms. Every rendered text field must be written in
{{target_language}} only — never mix in Korean or any other language, even if the source data looks
like it could be Korean. This is a hard requirement with zero exceptions: absolutely no Korean
characters may appear anywhere in the rendered image. If you are not fully confident that a piece of
text is already written in {{target_language}} (not Korean), do not render it at all — omit that text
element entirely rather than risk any Korean leaking through. If a supplied {{brand_logo}} reference image exists, faithfully reproduce
that EXACT supplied logo graphic in the small brand area — do not redesign it, distort it, restyle it,
or replace it with a different mark. If no {{brand_logo}} is supplied, leave that brand area empty —
never invent a logo. Do not render {{brand_name}} as text; the only brand element in the image is the
reproduced logo graphic itself (or nothing, if none was supplied).

TYPOGRAPHY SYSTEM
Use a clean modern sans-serif (Inter / Manrope / Helvetica-inspired) for headlines, benefit labels,
usage steps, and CTA. Use SemiBold/Bold weight for prices, making the sale price significantly larger
and bolder than the original price. Keep typography mobile-readable, high-contrast against the
background, and never decorative/script.

Design characteristics:
- premium e-commerce advertising
- modern and clean
- mobile-first
- suitable for Shopee
- realistic commercial product photography
- strong visual hierarchy
- readable typography
- generous spacing
- professional promotional design
Keep all important content inside safe margins.

PRODUCT DATA
Brand: {{brand_name}}
Product Name: {{product_name}}
English Product Name: {{product_name_en}}
Category: {{category}}
Headline: {{headline}}
Short Description: {{short_description}}
Benefit 1: {{benefit_1}}
Benefit 1 Description: {{benefit_desc_1}}
Benefit 2: {{benefit_2}}
Benefit 2 Description: {{benefit_desc_2}}
Benefit 3: {{benefit_3}}
Benefit 3 Description: {{benefit_desc_3}}
Usage Step 1: {{usage_step_1}}
Usage Step 2: {{usage_step_2}}
Usage Step 3: {{usage_step_3}}
Recommended For: {{recommended_for}}
Original Price: {{original_price}}
Sale Price: {{sale_price}}
Discount Rate: {{discount_rate}}
Currency: {{currency}}
Promotion: {{promotion_text}}
CTA: {{cta}}
Target Language (every rendered text field above MUST be written in this language only, never Korean): {{target_language}}

IMAGE INPUTS
Primary Product Image: {{product_image}}
Detail Image: {{detail_image}}
Brand Logo (the real uploaded logo — reproduce it exactly if supplied; leave the brand area empty if not): {{brand_logo}}
Preserve the actual product's packaging shape, proportions, brand identity, logo, major colors,
label structure, and recognizable package characteristics. Do not create a fictional replacement
product.

CARD TYPE
{{card_type}}
Available values: CARD_01_HERO_PRICE, CARD_02_BENEFITS, CARD_03_USAGE, CARD_04_PROMOTION
Generate only the selected CARD_TYPE's composition below.

CARD 01 - HERO + PRICE
Purpose: the primary sales image. A viewer must immediately read WHAT THE PRODUCT IS + WHY IT IS
ATTRACTIVE + HOW MUCH IT COSTS within seconds.
Render with this visual-weight priority (largest/most dominant first):
1. PRODUCT IMAGE (visually dominant, center)
2. PRODUCT NAME: {{product_name_en}}
3. SALE PRICE: {{sale_price}} {{currency}} (must read as significantly more prominent than the original price)
4. HEADLINE: {{headline}}
5. DISCOUNT RATE: {{discount_rate}} (small badge)
6. ORIGINAL PRICE: {{original_price}} {{currency}} (small, secondary, may use a strikethrough)
7. BRAND: small logo area — reproduce the supplied {{brand_logo}} exactly if provided; leave empty if not
Recommended layout: TOP 10-15% brand/logo -> TOP-MIDDLE 15-30% product-name/headline -> CENTER 30-72%
large hero product -> BOTTOM 72-95% price area (sale price largest/boldest, original price smaller,
discount as a compact badge placed close to the sale price). Positions may adapt slightly to the
product image.
If {{original_price}} or {{discount_rate}} is empty, per the EMPTY FIELD RULE simplify the bottom area
accordingly rather than leaving a placeholder.

CARD 02 - KEY BENEFITS
Purpose: communicate the three strongest product selling points.
Headline: WHY YOU'LL LOVE IT
Render exactly: {{benefit_1}} / {{benefit_desc_1}}, {{benefit_2}} / {{benefit_desc_2}}, {{benefit_3}} /
{{benefit_desc_3}}. Display using clearly separated visual sections (three cards, three icons, three
circular elements, or vertically/horizontally arranged blocks) sized for mobile readability. Only
render as many benefit items as have actual supplied values — never invent additional benefits.

CARD 03 - HOW TO USE
Purpose: explain how the customer should use the product.
Headline: HOW TO USE
Render: 01 {{usage_step_1}}, 02 {{usage_step_2}}, 03 {{usage_step_3}}, and Recommended For:
{{recommended_for}}. Use a simple visual flow 01 -> 02 -> 03. Use {{detail_image}} as a supporting
visual reference when available; the product may appear again as a supporting element. If no usage
steps are supplied, fall back to a clean lifestyle/usage-context photograph instead of rendering
empty numbered steps — never invent usage instructions.

CARD 04 - PROMOTION & CTA
Purpose: the strongest final purchase-conversion image.
Render with this priority: 1) Promotion: {{promotion_text}}, 2) Sale price: {{sale_price}} {{currency}},
3) Discount: {{discount_rate}}, 4) Product, 5) Original price: {{original_price}} {{currency}}, 6) CTA:
{{cta}}. This card may be more visually energetic/bold than CARD 01 while remaining part of the same
campaign design system.

PRICE DATA RULES
{{original_price}}, {{sale_price}}, and {{discount_rate}} must always reference the same underlying
values across CARD 01 and CARD 04. Never independently invent, estimate, or calculate any price or
discount that was not supplied.

EMPTY FIELD RULE
If any field is empty, null, missing, or unavailable: DO NOT invent content, and never render "N/A",
"NULL", or a placeholder. Remove that visual element and let the layout rebalance naturally. For
example, if {{discount_rate}} is empty, show original+sale price only (or just the sale price if the
original is also empty).

DATA INTEGRITY
Every rendered fact must be traceable to PRODUCT_DATA. Never invent prices, discounts, ingredients,
certifications, awards, clinical results, or effectiveness claims that were not supplied.

DESIGN CONSISTENCY
CARD 01-04 must look like one unified Shopee campaign: consistent typography, spacing, graphic-element
style, corner radius, background treatment, product photography, shadows, and visual tone — while
each card keeps its own distinct information purpose (01 = product+price, 02 = benefits, 03 = usage,
04 = promotion+CTA).

FINAL VALIDATION
Before generating, verify: output is exactly 1:1; only the requested CARD_TYPE is rendered; every
rendered word is spelled correctly and fully legible; empty fields were omitted, not shown as
placeholders; product packaging remains recognizable; text is readable on mobile; the result reads as
professional Shopee e-commerce advertising, not a generic AI template."""


def _shopee_card_prompt(card_type: str, values: dict, style_hint: str = "", extra: str = "") -> str:
    prompt = _apply_prompt_template(CARD_NEWS_SHOPEE_PROMPT, {**values, "card_type": card_type})
    prompt = f"{prompt}{_style_line(style_hint)}"
    if extra:
        prompt = f"{prompt}\n\n{extra}"
    return prompt


# "클린 & 에디토리얼" 카드뉴스 전용 프롬프트 — 다른 카드뉴스 스타일과 달리 전용 4페이지 캠페인
# 구조(히어로/체험/디테일/브랜드 클로징)를 쓴다. 다른 card-news 프롬프트(CARD_NEWS_SHOPEE_PROMPT)와
# 마찬가지로 실제 문구(헤드라인·태그라인·가격 등)는 AI가 이미지 픽셀에 직접 렌더링한다. 브랜드 표시는
# 계정 프로필의 회사명이 아니라 스탭 1에서 실제로 업로드한 로고 이미지만 쓴다 — 있으면 그 로고를 그대로
# 재현하고, 없으면 브랜드 영역을 비워둔다. 모든 렌더링 문구는 target_language 언어로만 쓰고 한글은 절대
# 섞지 않는다(언어가 "ko"/미지정이면 한국어).
CLEAN_EDITORIAL_CARD_NEWS_PROMPT = """ROLE
You are a senior commercial art director and editorial product photographer specializing in premium e-commerce campaigns, beauty advertising, lifestyle products, and clean editorial design.
Create ONE square page (the requested PAGE_NUMBER) from a cohesive 4-page square product card-news campaign, based on the product data and reference assets provided below.
The campaign concept is CLEAN & EDITORIAL. The four pages must feel like one professionally art-directed advertising campaign while each page serves a different communication purpose.

IMPORTANT SYSTEM RULE
Gemini renders the actual typography directly into the image — the headline, product name, tagline,
description excerpt, and price are real rendered text, not reserved empty space.
Render every supplied field's ACTUAL value exactly as given — do not paraphrase, translate, or invent
wording. Every rendered text field must be written in {{target_language}} only — never mix in Korean or
any other language. This is a hard requirement with zero exceptions: absolutely no Korean characters may
appear anywhere in the rendered image. If you are not fully confident that a piece of text is already
written in {{target_language}} (not Korean), do not render it at all — omit that text element entirely
rather than risk any Korean leaking through. Do not invent headlines, slogans, prices, product
descriptions, promotional messages, ingredient claims, certification claims, CTA text, website addresses,
social media handles, or decorative pseudo-text. If a field is empty, omit that element (no placeholder,
no blank box) rather than leaving a broken gap. Keep every line of rendered text crisp, correctly
spelled, and fully legible — never render smudged, warped, doubled, or half-formed letterforms.

INPUT DATA
The application may provide:
Company logo (the real uploaded logo — reproduce it exactly if supplied, do not redesign or distort it;
leave the brand area empty if not supplied; never invent a substitute logo or render any company name
as text instead): {{company_logo}}
Company slogan / tagline: {{company_slogan}}
Product name: {{product_name}}
Product description: {{product_description}}
Product image: {{product_images}}
Regular price: {{regular_price}}
Promotion price: {{promotion_price}}
Product category: {{product_category}}
Use only available information. If a field is missing, do not invent information.

PRODUCT PRESERVATION — CRITICAL
When a reference product image is provided, preserve the real product identity as accurately as possible:
packaging shape, package proportions, container type, cap shape, bottle or tube structure, packaging
color, recognizable graphic elements, existing label appearance, brand identity, distinctive product
characteristics. Do NOT redesign the packaging, change the product color, replace it with another product,
create a fictional brand, add new packaging claims, change the container, or create additional product
variants unless requested. The generated campaign must clearly feature the same product supplied.

GLOBAL VISUAL DIRECTION
Create a sophisticated premium editorial advertising aesthetic: clean, refined, spacious, calm, premium,
contemporary, sophisticated, trustworthy, editorial, naturally luxurious. Think premium skincare
editorials, modern lifestyle magazines, minimalist product photography, high-end commercial campaigns.
Avoid the appearance of a generic marketplace banner.

COLOR ADAPTATION
Analyze the supplied product image, packaging color, company logo, and existing brand identity to
dynamically create a harmonious campaign palette: dominant product color, supporting brand color, neutral
background color, subtle contrasting accent. Recommended balance: 70% neutral tones / 20% product-derived
tones / 10% accent tones. Preferred neutral backgrounds: warm white, ivory, cream, soft beige, light
stone, very pale gray, subtle warm neutral. Example directions (adapt dynamically, do not copy blindly):
green product -> ivory + sage + deep green; blue -> warm white + slate blue + navy; pink -> cream + dusty
pink + muted burgundy; orange -> ivory + muted orange + deep brown; black -> warm white + charcoal +
subtle gold. Avoid excessive saturation unless the product identity strongly requires it.

PHOTOGRAPHIC STYLE
Use premium commercial product photography. Possible supporting materials: stone, marble, ceramic, linen,
matte paper, subtle fabric, natural wood, minimal botanical elements, soft organic forms. Use soft natural
daylight, diffused studio lighting, realistic shadows, subtle depth, realistic materials, sophisticated
composition. Decorative elements must never overpower the product. Avoid excessive props.

TYPOGRAPHY SYSTEM
Render headline/product-name/tagline text in an elegant high-contrast editorial serif (Didot / Bodoni /
Cormorant Garamond / DM Serif Display / Playfair Display feeling). Render supporting-information text
(description excerpts, prices) in a clean modern sans-serif (Inter / Manrope / Noto Sans / Pretendard /
Helvetica feeling), SemiBold/Bold for prices. Do not place complex objects, faces, hands, bright
highlights, or strong patterns behind rendered text — maintain strong foreground/background contrast so
every word stays legible.

SAFE AREA & GRID
Each output is 1:1 square format. Maintain approximately 6-8% safe margin from every edge. Use a
sophisticated editorial grid: asymmetric composition, a clear visual anchor, generous negative space,
strong alignment, balanced proportions. Avoid centering everything or filling every corner. Whitespace is
an intentional design element.

PAGE_NUMBER
{{page_number}}
Available values: PAGE_01_PRODUCT_HERO, PAGE_02_PRODUCT_EXPERIENCE, PAGE_03_PRODUCT_DETAIL, PAGE_04_BRAND_CLOSING
Generate only the composition for the requested page below.

PAGE_01_PRODUCT_HERO
Purpose: immediately introduce the product and establish the brand. Render directly in the image: product
name ({{product_name}}), tagline ({{company_slogan}}), regular price ({{regular_price}}), promotional
price ({{promotion_price}}). Visual priority: 1) product, 2) product presentation, 3) rendered typography,
4) supporting environment. The actual product image should be the hero visual, occupying approximately
40-60% of the visual attention. Use a premium editorial still-life composition: warm neutral studio, stone
pedestal, marble slab, soft linen, subtle botanical accent, soft natural shadows. Do not overcrowd the
scene. Render the product name, tagline, price, and promotional price in approximately 30-40% of the
composition, plus a small clean area featuring the supplied {{company_logo}} — reproduce that exact logo
faithfully if provided, or leave the area empty if not. Omit any field that is empty rather than showing a
placeholder.

PAGE_02_PRODUCT_EXPERIENCE
Purpose: visually communicate the first major part of {{product_description}} through a realistic usage
experience. Analyze {{product_description}}, {{product_category}}, and the product image to determine a
realistic usage situation. If the product is naturally used by a person, generate a realistic human model
using the actual product (e.g. skincare -> naturally applying to face/hand/skin; sunscreen -> applying
before going outside or during a bright lifestyle scene; haircare -> naturally applying or using with
hair; food or beverage -> naturally eating, drinking, serving, or enjoying; lifestyle goods -> naturally
using in an appropriate real-life environment; fashion/accessories -> naturally wearing or interacting).
Do not force a human model if human usage is inappropriate — instead show the product in its natural use
environment.
HUMAN MODEL QUALITY (when a human model is generated): create a photorealistic commercial lifestyle
photograph. The person should appear natural, contemporary, approachable, professionally photographed,
realistically posed, not overly glamorous, not artificial. Pay particular attention to realistic hands,
correct fingers, realistic skin, natural facial proportions, realistic interaction with the product, and
correct product scale. Avoid uncanny faces, plastic-looking skin, excessive beauty retouching, impossible
poses, malformed hands, distorted product packaging, or exaggerated advertising poses. The result should
resemble a real commercial photoshoot rather than an obvious AI image.
Text: render the first key portion of {{product_description}} directly in the image, in approximately
35-45% of the composition. A preferred composition is text on one side / human or usage scene on the
other side — dynamically choose left or right depending on the product and scene. Condense the text if
needed to keep it short and fully legible; never render a long unbroken paragraph.

PAGE_03_PRODUCT_DETAIL
Purpose: communicate the second major part of {{product_description}}. Page 02 focused on experience; this
page focuses on the product itself and its characteristics. Return the product to the main visual focus.
Create a premium editorial product shot emphasizing appropriate details such as packaging, material,
texture, product form, product components, usage environment, or other relevant visual characteristics
that support {{product_description}}. Do not invent ingredients, materials, benefits, or characteristics
not present in the supplied data. Examples: beauty product -> close product composition, subtle texture,
sophisticated studio environment; food -> product plus realistic food texture or serving context;
lifestyle product -> product plus relevant material or usage environment; fashion -> material detail,
product detail, or restrained styling.
Text: render the second portion of {{product_description}} directly in the image, in approximately 35-45%
of the composition. Page 02 and Page 03 should not use exactly the same layout — create visual rhythm
(e.g. Page 02: text left / lifestyle visual right; Page 03: product visual left / text right — a
recommendation, not an absolute rule; choose what best fits the actual product). If {{product_description}}
is too short to support two distinct concepts, Page 02 should prioritize realistic product usage and Page
03 should prioritize premium product photography with a shorter rendered text excerpt — never fabricate
additional benefits merely to differentiate the pages.

PAGE_04_BRAND_CLOSING
Purpose: end the campaign with a memorable, sophisticated brand impression. Render directly in the image:
the tagline ({{company_slogan}}), the supplied {{company_logo}} (reproduce it exactly if provided, leave
that area empty if not — never invent a substitute), and optionally a restrained product image. This
should be the most minimal page in the campaign. Create maximum breathing room: subtle brand colors, soft
lighting, simple background, minimal product presence, refined composition. Render the tagline as a large
uninterrupted editorial headline and the logo in a separate clean area. The product may appear subtly but
should not dominate as strongly as Page 01. Omit the tagline entirely if {{company_slogan}} is empty —
never invent one. Do not add a CTA, URL, social handle, promotional badge, company name text, or any other
rendered text beyond the tagline.

4-PAGE CAMPAIGN FLOW
PAGE 01 - PRODUCT: what is the product? Hero product introduction.
PAGE 02 - EXPERIENCE: how does the product fit into real life? Human usage or realistic lifestyle
experience.
PAGE 03 - DETAIL: what should the customer know about the product? Product-focused editorial detail.
PAGE 04 - BRAND: what should the customer remember? Tagline and brand impression.

CAMPAIGN CONSISTENCY
All four pages must share the same visual identity, color palette, lighting philosophy, photography
quality, editorial aesthetic, spacing logic, margin system, and overall mood. Do NOT duplicate the exact
same composition four times — each page should feel distinct while clearly belonging to the same
campaign, progressing Product -> Experience -> Detail -> Brand.

VISUAL RESTRICTIONS
Do NOT create: generic marketplace banners, fake promotional text, fake logos, meaningless letters,
excessive gradients, neon effects, excessive drop shadows, random stickers, cartoon graphics, excessive
icons, promotional badges, fake certifications, fake ingredients, fake product claims, fake discounts,
excessive decorative props, unrelated products, or visual clutter. Avoid obvious AI-generated aesthetics.
The result should resemble a professionally art-directed commercial campaign.

FINAL QUALITY CHECK
Before generating each page, verify: the output is 1:1 square; the actual supplied product remains
recognizable; every rendered word is spelled correctly and fully legible; no product facts have been
invented; empty fields were omitted, not shown as placeholders; the composition follows Clean & Editorial
aesthetics; the palette harmonizes with the actual product; the scene is photorealistic; Page 02 represents
real product usage when appropriate; Page 03 focuses on product details; Page 04 remains intentionally
minimal; all four pages visually belong to the same campaign."""


def _clean_editorial_card_prompt(page_number: str, values: dict, style_hint: str = "", extra: str = "") -> str:
    prompt = _apply_prompt_template(CLEAN_EDITORIAL_CARD_NEWS_PROMPT, {**values, "page_number": page_number})
    prompt = f"{prompt}{_style_line(style_hint)}"
    if extra:
        prompt = f"{prompt}\n\n{extra}"
    return prompt


def _detail_hero_prompt(description: str, style_hint: str = "") -> str:
    return f"""상세페이지 상단에 들어갈 대형 히어로 상품 사진을 가로로 넓은 비율로 만들어주세요.
상품 설명: {description or '(설명 없음)'}
상품이 화면을 압도적으로 채우는 임팩트 있는 구도. 참고 사진 속 실제 상품 형태·색상·재질을 정확히 유지하세요.
고급스럽고 시선을 사로잡는 상업광고 사진 스타일.{_style_line(style_hint)}
{NO_TEXT_INSTRUCTION}"""


def _detail_feature_prompt(caption: dict, style_hint: str = "") -> str:
    return f"""아래 주제를 시각적으로 표현하는 상품 사진을 정사각형에 가까운 비율로 만들어주세요.
주제: {caption.get('eyebrow', '')} — {caption.get('heading', '')}
참고 설명: {caption.get('description', '')}
참고 사진 속 실제 상품을 등장시키고, 이 주제에 맞는 디테일(소재 질감·기능 부위·사용 장면)을 클로즈업 또는 연출 컷으로 보여주세요.{_style_line(style_hint)}
{NO_TEXT_INSTRUCTION}"""


def _detail_angle_prompt(angle_label: str, style_hint: str = "") -> str:
    return f"""첨부된 참고 사진은 이 상품의 정면 실제 사진입니다. 이 상품과 동일한 형태·색상·재질·디자인을 유지한 채,
카메라 앵글을 {angle_label}으로 상상하여 생성해주세요.
실제 상품 사진처럼 사실적인 스튜디오 제품 사진 스타일(깨끗한 배경, 균일한 조명)로, 참고 사진과 동일한 상품임을 알아볼 수 있도록 디자인 일관성을 유지하세요.{_style_line(style_hint)}
{NO_TEXT_INSTRUCTION}"""


CARD_NEWS_COPY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "features": {"type": "ARRAY", "items": {"type": "STRING"}},
        "promoLine": {"type": "STRING"},
    },
    "required": ["features", "promoLine"],
}

DETAIL_CAPTIONS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "captions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "eyebrow": {"type": "STRING"},
                    "heading": {"type": "STRING"},
                    "description": {"type": "STRING"},
                },
                "required": ["eyebrow", "heading", "description"],
            },
        }
    },
    "required": ["captions"],
}


def _card_news_copy_prompt(product_name: str, description: str, target_language: str = "ko") -> str:
    # 이 문구는 카드뉴스 이미지 픽셀에 그대로 렌더링되므로, 반드시 실제 요청 언어로 써야 한다 —
    # 여기서 한국어로 만들고 화면에서만 나중에 번역하면 이미지 속 글자는 한글로 남는다.
    if target_language and target_language != "ko" and target_language in TRANSLATE_LANGUAGE_NAMES:
        lang_name = TRANSLATE_LANGUAGE_NAMES[target_language]
        language_note = f'반드시 "{lang_name}" 언어로만 작성하세요 — 한국어를 절대 섞지 마세요.'
    else:
        language_note = "상품명이 영어 등 다른 언어로 적혀 있어도 문구는 반드시 한국어로 작성하세요."
    return f"""당신은 이커머스 카드뉴스 카피라이터입니다.
상품명: {product_name}
상품 설명: {description or '(설명 없음)'}

{language_note} 언어 변경은 화면의 "이미지 언어 설정하기" 버튼으로 사용자가 직접 선택할 때만 이뤄집니다.

features: 상품 설명에서 도출한 핵심 특징 2~4개, 각 8~14자 내외의 짧은 문구 (설명에 근거하여, 지어내지 마세요).
promoLine: 마지막 장 CTA용 15자 내외 짧고 임팩트 있는 홍보 문구.

"+", "&", "/" 같은 기호로 단어를 잇지 말고 자연스러운 단어(and 등)로 풀어 쓰세요
(제품 스펙 표기처럼 의미가 바뀌는 경우는 예외)."""


def _detail_captions_prompt(product_name: str, description: str) -> str:
    return f"""당신은 이커머스 상세페이지 카피라이터입니다.
상품명: {product_name}
상품 설명: {description or '(설명 없음)'}

상품명이 영어 등 다른 언어로 적혀 있어도 문구는 반드시 한국어로 작성하세요(eyebrow의 영문 대문자
표기 관례는 유지). 언어 변경은 화면의 "이미지 언어 설정하기" 버튼으로 사용자가 직접 선택할 때만 이뤄집니다.

상세페이지 '특징 소개' 섹션에 들어갈 3개의 캡션 세트를 작성하세요 — 소재/기능/디자인 등 서로 다른 3가지 매력 포인트를 각각 다루도록.
각 세트: eyebrow(영문 대문자 2~3단어, 예: 'PREMIUM QUALITY'), heading(굵은 한글 소제목 6~12자),
description(1~2문장 한글, 상품 설명에 근거하여 자연스럽게 확장, 지어내지 마세요)."""


# "럭셔리 & 프리미엄" 포스터 템플릿 전용 — 사용자가 직접 작성해서 넘겨준 데이터 기반 광고 프롬프트를
# 그대로 쓴다. {{변수}}는 우리 서비스가 실제로 가진 정보(상품명/설명/태그라인/가격/회사명)로만 채우고,
# 없는 정보(가격 할인, 원산지, CTA 문구 등)는 빈 문자열로 둔다 — 프롬프트 자체가 "데이터가 없으면
# 지어내지 말고 그 자리를 비워두라"는 규칙(8번 항목)을 포함하고 있어서 안전하다.
LUXURY_PREMIUM_POSTER_PROMPT = """GEMINI 2.5 FLASH IMAGE
PREMIUM FIXED EDITORIAL PRODUCT CAMPAIGN MASTER PROMPT

01. ROLE
You are a senior brand design director, luxury editorial art director, commercial product photographer, and typography designer with 15+ years of experience working for major consumer brands.
Create ONE finished premium product advertising image using:
1. the PRODUCT IMAGE supplied by the user,
2. the PRODUCT INFORMATION supplied by the user,
3. the FIXED EDITORIAL DESIGN SYSTEM defined below.
This is NOT a free-form image generation task.
This is a FIXED DESIGN SYSTEM + DYNAMIC PRODUCT MOOD advertising system.
The final result must be immediately usable as a professional product promotion without additional design editing.

02. CORE PRINCIPLE
FIXED
The following must remain consistent across every generated advertisement:
● canvas ratio
● overall composition
● typography style
● typography hierarchy
● typography positions
● hero word position
● hero product position
● benefit position
● description position
● CTA position
● negative-space structure
● editorial spacing
● overall visual hierarchy
DYNAMIC
The following must automatically adapt to each supplied product:
● product image
● product information
● hero word content
● background palette
● lighting mood
● supporting ingredients
● props
● surface material
● atmospheric depth
● shadow character
● accent color
The goal is:
SAME DESIGN SYSTEM.
DIFFERENT PRODUCT PERSONALITY.
Do NOT redesign the layout when the product changes.
Instead:
KEEP THE DESIGN SYSTEM AND CHANGE THE WORLD AROUND THE PRODUCT.

03. INPUT DATA
The user supplies the product image and product information.
Use ONLY the supplied data as factual product information.
PRODUCT_REFERENCE_IMAGE:
{{product_image}}

BRAND_NAME:
{{brand_name}}

PRODUCT_NAME:
{{product_name}}

PRODUCT_CATEGORY:
{{product_category}}

PRODUCT_BENEFIT:
{{product_benefit}}

PRODUCT_DESCRIPTION:
{{product_description}}

KEY_INGREDIENTS:
{{key_ingredients}}

PRODUCT_CAPACITY:
{{product_capacity}}

TOP_EDITORIAL_COPY:
{{tagline}}

HERO_WORD:
{{hero_word}}

CTA_TEXT:
{{cta_text}}

PRIMARY_COLOR:
{{primary_color}}

SECONDARY_COLOR:
{{secondary_color}}

ACCENT_COLOR:
{{accent_color}}

TARGET_MARKET:
{{target_market}}

The PRODUCT_REFERENCE_IMAGE and structured product information are the SINGLE SOURCE OF TRUTH.

04. PRODUCT DATA INTEGRITY
Never invent factual product information.
DO NOT invent:
● brand names
● product names
● ingredients
● benefits
● specifications
● capacities
● certifications
● origins
● SPF values
● functional claims
● medical claims
● marketing claims
Never infer factual claims only from the visual appearance of the product.
If information is not supplied:
DO NOT DISPLAY IT.
Never show:
● NULL
● N/A
● undefined
● variable names
● placeholder text
● empty boxes
Use negative space instead.

05. PRODUCT IMAGE — ABSOLUTE PRESERVATION
The supplied {{product_image}} is the HERO and the visual source of truth.
Preserve as accurately as possible:
● exact package silhouette
● container shape
● proportions
● cap
● pump
● dropper
● package color
● package material
● logo placement
● label structure
● visible brand identity
● distinctive package characteristics
DO NOT:
● redesign the product
● create another bottle
● invent a different package
● change the cap
● change proportions
● recolor the product
● create duplicate products
● invent a new logo
● intentionally replace the existing label
● add fake certifications
● add fake package claims
Build the advertisement AROUND the supplied product.
Do not redesign the product to fit the advertisement.

06. FORMAT
Create ONE vertical premium editorial product advertisement.
Aspect ratio:
{{aspect_label}} portrait
Recommended output:
high-resolution vertical commercial creative.
Maintain approximately:
5–7% safe margin
around the edges.
The visual should resemble a professionally photographed full-page advertisement from a premium fashion, beauty, lifestyle, or design magazine.

06B. TEXT IS RENDERED IN THIS IMAGE
Unlike a generic product photo, THIS template renders its own typography directly into the image —
the editorial copy, the giant hero word, the benefit/description labels, the bottom headline/price
block, and the CTA are all real rendered typography, not reserved empty space.
Render every text field's ACTUAL supplied value exactly as given — do not paraphrase, translate, or
invent wording. Every rendered text field must be written in {{target_language}} only — never mix in
Korean or any other language. This is a hard requirement with zero exceptions: absolutely no Korean
characters may appear anywhere in the rendered image. If you are not fully confident that a piece of
text is already written in {{target_language}} (not Korean), do not render it at all — omit that text
element entirely rather than risk any Korean leaking through. If a field is empty, per rule 32 simply
omit that element (no placeholder, no blank box) rather than leaving broken negative space.
Keep every line of rendered text crisp, correctly spelled, and fully legible — never render smudged,
warped, doubled, or illegible letterforms. If you are not confident a string of text will render
cleanly, shorten it rather than risk illegible characters.

07. FIXED MASTER COMPOSITION
Maintain this design structure for EVERY product:
┌───────────────────────────────┐
│ SMALL EDITORIAL COPY          │
│                               │
│   HUGE EDITORIAL HERO WORD    │
│   ─────────────────────────   │
│                               │
│ BENEFIT                       │
│                               │
│          HERO PRODUCT         │
│                               │
│     PRODUCT-RELATED PROPS     │
│                               │
│───────────────────────────────│
│ REFLECTIVE SURFACE       CTA  │
└───────────────────────────────┘
Do NOT convert this layout into:
● an e-commerce detail page
● a UI dashboard
● a card grid
● an icon-heavy infographic
● a marketplace banner
The result is a PREMIUM EDITORIAL ADVERTISEMENT.

08. TOP EDITORIAL COPY
Position:
X = approximately 5–8%
Y = approximately 4–10%
Render:
{{tagline}}
Maximum 2 short lines. Typeface: elegant editorial serif (see 14), thin/regular weight, wide
letter-spacing, small and restrained — a subtle editorial introduction, not the main headline. Use a
color with strong contrast against the background. If {{tagline}} is empty, omit this element.

09. GIANT HERO TYPOGRAPHY
This is the signature visual element. Render ONE short evocative word (English preferred) BEHIND the
product:
{{hero_word}}
Position: approximately 10–38% of canvas height, centered. Scale: approximately 85–110% of canvas
width — it may extend slightly beyond the canvas edges. Typeface: elegant high-contrast editorial
serif (see 14) — Didot/Bodoni/Cormorant-inspired, huge, thin hairlines, sophisticated proportions.
The word sits BEHIND the product; the product may obscure roughly 20–40% of the letters, but the
rest must stay clearly legible. If {{hero_word}} is empty, derive one short conceptual English word
from {{product_benefit}} or {{product_description}} — never leave this zone blank.

10. HERO WORD RULE
Prefer one short English conceptual word, ideally 3–8 characters. This word is emotional/editorial
language, not a new factual claim — do not invent unrelated or meaningless English.

11. HERO PRODUCT POSITION
Place:
{{product_image}}
approximately:
X = 50%
Y = 58–64%
Recommended scale:
approximately 35–45% of canvas width.
The product should dominate the central composition.
It may slightly overlap the giant hero word.
No other rendered text may overlap the product itself.
Adapt product scale slightly according to package shape, but DO NOT change the overall composition.

12. LEFT LABEL — PRODUCT BENEFIT
Position:
X = approximately 5–22%
Y = approximately 38–50%
Render a small heading "PRODUCT BENEFITS" followed by:
{{product_benefit}}
Typeface: clean modern sans-serif (see 14), small, understated. Maximum 2–3 short lines. If
{{product_benefit}} is empty, omit this entire element (heading included) rather than showing an
empty label.

13B. BOTTOM BLOCK — TAGLINE / PRODUCT NAME / PRICE / CTA
Reserve the bottom ~20–28% of the canvas as a grounded surface (matches the reflective-surface zone
in section 24) and render this stacked block, left-aligned, on top of it:
1. A one-line marketing tagline in small tracked uppercase (may reuse {{tagline}} again or a short
   restatement of {{product_benefit}} if {{tagline}} was already used in zone 08 — keep it brief).
2. {{product_name}} — the PRODUCT NAME — in the BEBAS NEUE typeface (see 14), large, bold, single
   line whenever possible.
3. {{price}} directly below the product name, in a warm gold/amber accent color, bold, smaller than
   the product name but still prominent. Omit entirely if {{price}} is empty.
4. {{cta_text}} small and understated, bottom-right of this block. Omit if empty.
Keep strong contrast against the surface behind this block (a soft dark gradient/vignette is fine)
so every line stays fully legible.

14. TYPOGRAPHY SYSTEM
Use exactly THREE typography families, rendered as real legible glyphs:

TYPE A — ELEGANT EDITORIAL SERIF
Used for: the top editorial copy (08), the giant hero word (09).
Visual direction: Didot / Bodoni / Cormorant-inspired — high stroke contrast, thin elegant
hairlines, refined kerning, sophisticated luxury-magazine character.

TYPE B — MODERN CLEAN SANS-SERIF
Used for: the "PRODUCT BENEFITS" label and its content (12), the small tracked tagline inside the
bottom block (13B), and the CTA (13B).
Visual direction: Helvetica Neue / Neue Haas Grotesk-inspired — clean, neutral, restrained.

TYPE C — BEBAS NEUE (bottom product-name headline)
Used for: {{product_name}} inside the bottom block (13B) — this is the single most important
rendered word in the whole image and must use BEBAS NEUE specifically: a tall, bold, condensed,
all-caps (or large-caps) geometric display sans-serif, exactly like the reference typeface named
"Bebas Neue". Render it large, bold, and unmistakably in this condensed display style.

Do NOT introduce any other decorative font (no handwriting, no script, no bubble/rounded playful
fonts) anywhere in the image.

15. TYPOGRAPHY POSITION IS FIXED
Across different products, do NOT move typography to arbitrary positions. Maintain:
TOP LEFT → editorial copy (08)
UPPER BACKGROUND, BEHIND PRODUCT → giant hero word (09)
CENTER LEFT → product benefit label (12)
BOTTOM, GROUNDED BLOCK → tagline / product name (Bebas Neue) / price / CTA (13B)
Typography size may adapt slightly for word length, but position and hierarchy stay consistent.

15. TYPOGRAPHY POSITION IS FIXED
Across different products:
DO NOT move typography to arbitrary positions.
Maintain:
TOP LEFT
→ editorial copy
UPPER BACKGROUND
→ giant hero word
CENTER LEFT
→ benefit
BOTTOM RIGHT
→ CTA
Typography size may adapt slightly for word length.
Typography POSITION and visual hierarchy should remain consistent.

16. PRODUCT-SPECIFIC MOOD ANALYSIS
BEFORE generating the advertisement, internally analyze:
1. product category
2. package shape
3. dominant package colors
4. secondary package colors
5. package material
6. key ingredients
7. product benefits
8. product description
9. target-market impression
10. appropriate emotional atmosphere
Then create a product-specific ART DIRECTION.
Do NOT ask the user to specify the mood unless necessary.
Infer the visual mood from the supplied product image and factual product data.

17. AUTOMATIC COLOR DIRECTION
The layout remains fixed.
The COLOR PALETTE changes according to the product.
First analyze the supplied product image.
If:
{{primary_color}}
{{secondary_color}}
{{accent_color}}
are supplied, prioritize them.
If they are empty:
derive a sophisticated complementary palette from the product image.
Use approximately:
70% neutral/environment tone
20% product-derived supporting tone
10% accent tone
Do NOT simply fill the entire background with the product's dominant color.
Create tonal variation.

18. COLOR QUALITY
Colors must feel:
● curated
● restrained
● sophisticated
● slightly muted when appropriate
● editorial
● physically photographed
Avoid:
● neon
● excessive saturation
● artificial digital gradients
● excessive orange
● excessive green
● arbitrary complementary colors
Examples of palette logic:
green package
→ sage / olive / cream / deep botanical tone
blue package
→ pale blue-gray / slate / silver / ivory
yellow package
→ warm ivory / butter / sand / muted amber
pink package
→ dusty rose / warm cream / muted burgundy
black package
→ charcoal / warm gray / stone
white package
→ ivory / soft beige / architectural gray
These are mood directions, not fixed palettes.

19. PRODUCT CATEGORY MOOD
Automatically adapt the atmosphere.
BEAUTY / SKINCARE
Use:
● refined studio light
● translucent materials
● subtle moisture
● botanical ingredients only when relevant
● polished stone or glass
● soft editorial atmosphere

SUNCARE
Use:
● warm directional sunlight
● ivory / sand / subtle sky tones
● sophisticated summer light
● subtle architectural sun shadows
Avoid cliché tropical-beach styling.

FOOD / BEVERAGE
Use:
● natural appetizing side light
● realistic ingredient styling
● tactile physical surfaces
● warm material texture
Do NOT use skincare-style serum droplets.

TRADITIONAL KOREAN FOOD
Use:
● modern Korean heritage mood
● hanji-inspired texture
● ceramic
● natural wood
● restrained traditional color accents
● warm daylight
Make it contemporary, not old-fashioned.

HOME / LIFESTYLE
Use:
● architectural negative space
● natural stone
● subtle wood
● linen
● controlled daylight

TECH / ELECTRONICS
Use:
● precision studio lighting
● metal
● glass
● graphite
● silver
● cool neutral environment
● controlled architectural geometry
Do NOT add botanical elements unless relevant.

20. SUPPORTING PROPS
Select supporting objects from:
{{key_ingredients}}
{{product_category}}
and supplied product information.
Use approximately:
2–4 supporting elements maximum.
Create an asymmetric composition.
Preferred:
LEFT:
one larger supporting element.
RIGHT:
one secondary element.
LOWER FOREGROUND:
one small physical detail.
Supporting objects must strengthen the product story.
Do NOT decorate randomly.

21. INGREDIENT ACCURACY
If:
Aloe is supplied
→ aloe may appear.
Citrus is supplied
→ citrus may appear.
Rice is supplied
→ rice may appear.
Honey is supplied
→ honey may appear.
Green tea is supplied
→ tea leaves may appear.
If NO ingredient information exists:
DO NOT invent ingredients.
Instead use category-appropriate neutral materials such as:
● stone
● glass
● wood
● ceramic
● metal
● paper
● fabric
● water

22. LIGHTING MOOD
Maintain directional premium studio lighting across the entire series.
Default direction:
large diffused light from upper-left.
But adapt the CHARACTER of the lighting.
Hydrating:
→ soft cool diffused light
Suncare:
→ warm directional daylight
Botanical:
→ filtered organic light
Luxury:
→ dramatic controlled studio light
Food:
→ warm appetizing side light
Technology:
→ precise cool directional light
All objects must share the same physically plausible lighting environment.

23. BACKGROUND
Create a physically believable studio environment.
Do NOT use a flat digital background.
Use:
● subtle tonal depth
● directional illumination
● natural shadow falloff
● restrained atmospheric variation
● realistic studio backdrop texture
The background should support the product without competing with it.

24. REFLECTIVE LOWER SURFACE
Maintain the reflective lower surface as a signature template element.
Position:
bottom approximately 15–25%.
Adapt MATERIAL according to the product.
Beauty:
→ polished glass / acrylic / stone
Food:
→ polished stone / ceramic / subtle wood
Traditional food:
→ ceramic / lacquer / stone
Lifestyle:
→ architectural stone / wood
Tech:
→ glass / metal / dark acrylic
Create a subtle physically plausible reflection.
Do NOT create a perfect digital mirror.

25. CTA
{{cta_text}} renders inside the bottom block — see 13B. If empty, omit it; do not invent generic
phrases like "SHOP NOW" unless {{cta_text}} actually supplied one. Do NOT create shopping buttons,
orange buttons, rounded rectangles, shopping-cart icons, or marketplace UI — it must read as
typography integrated into a magazine advertisement, not a UI element.

26. NEGATIVE SPACE
Maintain approximately 25–35% visually calm space outside the rendered typography and product.
Negative space is part of the design. Do NOT fill empty areas with icons, circles, particles,
decorative quotation marks, floating graphics, unnecessary lines, or extra badges. The composition
should breathe.

27. TEXT RENDERING QUALITY RULE
TEXT ACCURACY IS MORE IMPORTANT THAN DECORATION.
Every rendered word must be spelled exactly as supplied, fully formed, and legible — no smudged,
warped, doubled, or half-formed letterforms anywhere, including the giant hero word. Keep external
text concise; do not render long paragraphs or unnecessary micro-copy. Maintain strong
foreground/background contrast behind every text zone. If a string is too long to render cleanly at
a readable size, shorten it while preserving its factual meaning rather than letting it become
illegible.

28. DO NOT GENERATE UNSUPPLIED TEXT
Every rendered word must come from one of the supplied fields in section 03 (tagline, hero word,
product benefit, product name, price, CTA) or the fixed label "PRODUCT BENEFITS". Do NOT render
{{product_description}} as on-image text — it is factual context only, not typography; use it (if
needed) only to help choose the hero word (09), never to render as its own text block. Do NOT add
fake English descriptions, decorative sentences,
invented product claims, fake scientific terminology, random numbers, or random certifications.
Less text is better than inaccurate text.

29. NO E-COMMERCE TEMPLATE STYLING
STRICTLY AVOID:
● discount circles
● 20% OFF badges
● large price stickers
● shopping cart icons
● CTA buttons
● icon benefit grids
● rounded UI cards
● multiple bordered boxes
● infographic layouts
● Amazon-style layouts
● Shopee-style promotional banners
This template is a BRAND CAMPAIGN CARD.
Not a marketplace detail image.

30. REMOVE AI-GENERATED AESTHETICS
STRICTLY AVOID:
● excessive floating ingredients
● excessive water droplets
● glowing glass spheres
● random bokeh
● giant quotation marks
● meaningless letters
● fake decorative English
● oversaturated colors
● excessive lens flare
● unrealistic plants
● plastic-looking ingredients
● duplicate products
● warped packages
● distorted caps
● fake logos
● perfect CGI reflections
● excessive symmetry
● generic social-media-template appearance
The image must feel HUMAN ART-DIRECTED.

31. HUMAN ART DIRECTION
Use subtle asymmetry.
Use optical balance rather than mathematical symmetry.
Allow:
● slight cropping
● natural object overlap
● realistic imperfections
● controlled shadow variation
● restrained texture
● imperfect reflections
The result should feel photographed and designed by a professional creative team.

32. CONDITIONAL DATA HANDLING
If a field is empty:
REMOVE that content.
Do NOT:
● display placeholder text
● display variable names
● leave empty frames
● create empty boxes
● invent replacement copy
Rebalance using negative space while keeping the main layout intact.

33. CONSISTENCY ACROSS PRODUCTS
When multiple product advertisements are viewed together, they must clearly belong to the same campaign family.
ALWAYS KEEP:
● {{aspect_label}} format
● editorial typography system
● top-left editorial copy
● oversized serif hero word
● central product
● left benefit label
● lower reflective surface
● bottom, grounded tagline/product-name(Bebas Neue)/price/CTA block
● restrained information density
● luxury spacing
ALWAYS ADAPT:
● product
● color
● ingredient
● props
● material
● lighting mood
● atmosphere
● reflection character
The design should feel consistent.
The mood should feel product-specific.

34. FINAL INTERNAL CHECK
Before generating the image, verify:
DATA
Is every factual statement supported by supplied data?
PRODUCT
Does the hero product preserve the supplied product image?
TYPOGRAPHY
Is the hierarchy consistent?
Is every important word readable?
Is there any random or corrupted text?
LAYOUT
Does the composition match the fixed editorial template?
MOOD
Does the environment genuinely match THIS product?
COLOR
Does the palette complement rather than simply copy the package color?
PROPS
Are all ingredients and objects relevant?
PHOTOGRAPHY
Do the lighting, shadows, materials, and reflections look physically real?
QUALITY
Would this image look credible as a professionally art-directed full-page brand advertisement?
If not:
REMOVE unnecessary elements.
REDUCE text.
INCREASE negative space.
REFINE the palette.
IMPROVE product lighting.
SIMPLIFY supporting props.

35. FINAL GENERATION INSTRUCTION
Generate ONE finished ultra-premium {{aspect_label}} vertical editorial product campaign image using Gemini 2.5 Flash Image.
The supplied PRODUCT IMAGE and PRODUCT INFORMATION are authoritative.
Do NOT change the factual product information.
Do NOT redesign the supplied product.
Do NOT create a new layout.
Render every supplied text field as real, crisp, correctly-spelled typography per rule 06B — this
template's signature feature is its own rendered typography, not a photo-only composition.
Use the fixed editorial design system.
The template structure is:
SMALL TOP-LEFT EDITORIAL COPY (08)
↓
OVERSIZED HIGH-CONTRAST SERIF HERO WORD BEHIND THE PRODUCT (09)
↓
CENTRAL HERO PRODUCT (11)
with
LEFT "PRODUCT BENEFITS" LABEL (12)
↓
CURATED PRODUCT-RELATED INGREDIENTS / PROPS
↓
PHYSICALLY REALISTIC REFLECTIVE SURFACE, WITH A GROUNDED BOTTOM BLOCK RENDERING THE TAGLINE, THE
PRODUCT NAME IN BEBAS NEUE, THE PRICE, AND THE CTA (13B)
Keep the layout and typography language consistent across all products.
Automatically adapt the color palette, background atmosphere, lighting, supporting objects, ingredients, materials, shadows, and reflections to the supplied product.
The final result should look like each product received its own professional art direction while remaining unmistakably part of the same premium campaign series.
The final image must be:
PHOTOREALISTIC.
EDITORIAL.
PREMIUM.
MINIMAL.
CONTEMPORARY.
PRODUCT-SPECIFIC.
TYPOGRAPHICALLY REFINED, WITH EVERY RENDERED WORD PERFECTLY LEGIBLE.
READY FOR IMMEDIATE COMMERCIAL USE.
Do not make it look AI-generated.
Do not make it look like a template.
Do not make it look like an e-commerce marketplace banner.
Make it look like a real campaign photographed by an experienced brand design team in a professional commercial studio."""


MINIMAL_CLEAN_POSTER_PROMPT = """ROLE
You are a senior commercial advertising art director and product photographer specializing in premium beauty, skincare, lifestyle, and e-commerce campaign posters.
Create exactly ONE professionally art-directed commercial product poster based on the supplied product image, product information, brand assets, and selected aspect ratio.
The design concept is:
MINIMAL & CLEAN — COMMERCIAL CAMPAIGN
IMPORTANT:
"Minimal & Clean" does NOT mean an empty white background, excessive blank space, a small centered product, or a simple product catalog image.
Instead, interpret Minimal & Clean as:
clean information hierarchy
strong commercial photography
full-frame visual composition
large hero product
bold headline placement
sophisticated color coordination
controlled number of visual elements
modern advertising layout
polished e-commerce campaign quality
The poster should feel like a professionally art-directed seasonal beauty or lifestyle campaign.

REFERENCE DESIGN PRINCIPLE
Follow the supplied reference image primarily for its:
full-frame photographic background
immersive lifestyle environment
large product presentation
strong visual hierarchy
oversized headline area
clearly separated promotional information
confident use of color
commercial advertising composition
balanced relationship between photography and typography
visually complete canvas with no accidental empty areas
The reference should guide the design density and advertising hierarchy, not the exact product, colors, wording, props, or background.
DO NOT copy the reference literally.
Adapt its advertising principles to the supplied product.

CRITICAL OUTPUT RULE
Generate exactly ONE poster.
Output aspect ratio:
{{selected_aspect_ratio}}
Possible values:
4:5
or
9:16
The entire composition must be designed natively for the selected aspect ratio.
Do NOT generate a square composition and crop it.
Do NOT stretch a 4:5 composition into 9:16.
Do NOT place the poster inside a mockup.
Do NOT create a collage.

CRITICAL — NO LARGE EMPTY AREA
Do NOT create a composition with a large empty lower half, empty white gradient, unused background, or visually unfinished area.
Every section of the canvas must feel intentionally designed.
This does NOT mean filling the canvas with random decoration.
Instead, use:
photographic environment
product
natural surfaces
subtle texture
lighting
shadow
restrained props
product-related contextual elements
to create a visually complete commercial composition.
The poster should feel full and immersive while remaining clean and organized.

INPUT DATA
Use available application data:
{{product_image}}
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{product_description}}
{{price}}
{{promotion_price}}
{{product_category}}
{{selected_aspect_ratio}}
Never invent missing product information.

ON-IMAGE TYPOGRAPHY SYSTEM
Gemini renders the entire poster — photography AND typography — directly into the final image, exactly
like the supplied reference. There is no separate frontend text overlay for this template; every visible
word must be rendered by you as real, crisp pixels.
Render the actual supplied values for:
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{price}}
{{promotion_price}}
Do NOT render {{product_description}} as on-image text — it is factual context only, never its own
typography block.
Render every text field's ACTUAL supplied value exactly as given — do not paraphrase, translate loosely,
or invent wording. Every rendered text field must be written in {{target_language}} only — never mix in
Korean or any other language, even if the source data looks like it could be Korean. Keep every line of
rendered text crisp, correctly spelled, and fully legible — never render smudged, warped, doubled, or
illegible letterforms. If you are not confident a string of text will render cleanly, shorten it rather
than risk illegible characters. If you are not confident whether a supplied value is already written in
{{target_language}} or is still Korean, omit that text element entirely rather than guess or render it in
the wrong language.
Do NOT generate:
fake headline
fake product name
fake tagline
fake price
fake discount
fake CTA
fake URL
random text not supplied in the input data
pseudo typography
If a field is empty, null, missing, or unavailable, omit that element and let the layout rebalance
naturally — never render a placeholder, "N/A", or blank box for it.
If a {{company_logo}} reference image is supplied, faithfully reproduce that EXACT logo graphic — do not
redesign, distort, restyle, or replace it. If none is supplied, leave the brand area empty.
However, preserve authentic text already printed on the supplied physical product packaging as part of the product image.

DESIGN THE IMAGE AROUND THE TEXT
The composition must reserve real typographic space for the rendered text, not just imply it.
Do NOT simply create a product photo and leave random blank space.
Design intentional editorial zones for:
COMPANY LOGO
LARGE PRODUCT NAME
TAGLINE
PRICE / PROMOTIONAL PRICE
These zones must feel like part of the advertising composition, exactly as in the reference image.

TYPOGRAPHIC HIERARCHY
The intended final poster should visually support typography similar to the reference campaign.
PRODUCT NAME
The product name is the dominant typographic element.
Reserve enough space for a:
very large
bold
modern
clean
high-impact
headline.
Intended font feeling:
Helvetica Neue Bold
Neue Haas Grotesk
Archivo Black
Inter ExtraBold
Montserrat ExtraBold
similar modern commercial sans-serif
The headline may occupy approximately 20-30% of the visual hierarchy.
Do NOT reserve a tiny text box.
The product name must have enough room to appear dramatically large.

TAGLINE
Reserve an area immediately above or below the product name.
The tagline should feel like supporting campaign copy.
Use enough space for approximately:
1-2 lines.

PRICE
Price must be treated as a strong commercial element.
Render the actual supplied value for {{price}}, and when available {{promotion_price}}, inside a
distinct high-contrast area.
The price area may visually use:
a clean rounded badge
restrained geometric shape
contrasting solid block
simple high-contrast area
The promotional price should be capable of appearing significantly larger than the regular price.
Render the real supplied price text exactly as given — never invent, estimate, or alter a price.

PRODUCT — HERO VISUAL
The supplied product must be one of the strongest elements in the poster.
The product should generally occupy approximately:
35-55% of the visual attention.
Avoid a small isolated product floating in the center.
The product should feel integrated into a professionally photographed campaign environment.
Depending on the product, it may:
stand prominently in the foreground
rest on a relevant surface
overlap part of the photographic background
appear slightly off-center
interact naturally with the environment
The product must remain immediately recognizable.

PRODUCT PRESERVATION
Use the supplied product image as the source of truth.
Preserve:
packaging shape
proportions
container
cap
packaging color
label placement
recognizable graphics
distinctive product identity
DO NOT:
redesign the packaging
replace the product
change packaging color
alter product proportions
create a fictional variant
duplicate the product unless specifically requested
replace authentic product graphics with AI-generated graphics

FULL-BLEED PHOTOGRAPHIC BACKGROUND
The background should generally extend across the entire canvas.
Avoid plain empty white or beige backgrounds unless the supplied product genuinely requires a studio campaign.
Prefer a full-bleed photographic environment appropriate to the product.
Examples:
Sunscreen
sunlit pool
beach
summer water
bright outdoor setting
sunlit stone
vacation environment
clean summer lifestyle
Skincare
water
stone
soft botanical environment
bright bathroom
clean vanity
natural daylight studio
Beverage
ice
water
cafe environment
ingredient-related setting
refreshing lifestyle environment
Food
table setting
ingredient-related scene
natural kitchen environment
premium serving context
Lifestyle product
relevant real-life environment
architectural background
contemporary lifestyle scene
Choose the environment based on actual product information.

BACKGROUND MUST SUPPORT THE PRODUCT
The environment should make the product feel desirable but should not overpower it.
Use depth:
foreground
-> hero product
-> contextual surface
-> softly detailed environment
The product should remain sharper and more visually prominent than the background.

HUMAN MODELS — OPTIONAL AND CONTROLLED
Do NOT automatically place large blurred people behind every product.
Use human models only when they genuinely improve the product story.
If models are appropriate:
place them naturally in the environment
keep them secondary to the product
use realistic proportions
create authentic lifestyle photography
avoid obvious AI faces
avoid awkward hands
avoid artificial advertising poses
For products such as sunscreen, a subtle summer lifestyle context may be appropriate.
However, the product must remain the visual hero.

IMPORTANT — DO NOT USE BLUR AS A SUBSTITUTE FOR DESIGN
Do not create a generic blurred stock-photo background simply to fill the canvas.
If people appear in the background, their placement must feel intentional.
Use depth of field naturally.
Avoid excessively blurred anonymous figures that make the poster look like a cheap composite.
The background itself should still have attractive photographic value.

COLOR SYSTEM
Analyze the actual:
product packaging
logo
brand colors
product category
and build the poster palette around them.
Use approximately:
60% environmental / dominant campaign color
25% product-derived supporting color
15% contrast / promotional accent
This template may use more color than a traditional minimalist poster.
However, the palette should remain controlled and sophisticated.

EXAMPLE COLOR LOGIC
Yellow sunscreen packaging:
-> clear aqua / sky blue environment
-> warm cream or sand
-> yellow accent
Pink skincare:
-> water blue / soft pink / white
Green skincare:
-> ivory / botanical green / muted stone
Blue product:
-> water / pale blue / white / warm contrasting accent
Orange product:
-> blue / aqua / cream / restrained orange accent
Do not mechanically apply these examples.
Analyze the actual product.

COMPOSITION — 4:5
When:
{{selected_aspect_ratio}} = 4:5
Design specifically for a 4:5 commercial poster.
Recommended hierarchy:
TOP 25-35%
-> logo
-> tagline
-> LARGE product name
MIDDLE 35-45%
-> hero product
-> photographic environment
SIDE OR LOWER-MIDDLE
-> price / promotion area
BOTTOM
-> supporting visual environment
The composition should remain visually complete from top to bottom.
Do NOT leave the lower 30-50% empty.

COMPOSITION — 9:16
When:
{{selected_aspect_ratio}} = 9:16
Design specifically for a tall mobile advertising poster.
Recommended hierarchy:
TOP
-> logo / brand space
UPPER
-> tagline
UPPER-MIDDLE
-> VERY LARGE product name
CENTER
-> hero product
CENTER-LOWER
-> supporting photographic environment
LOWER
-> price / promotional price
BOTTOM
-> subtle campaign finishing area / environmental continuation
Use the entire vertical canvas intentionally.
Do NOT simply put everything at the top and leave the lower half empty.

ASPECT RATIO ADAPTATION
4:5 and 9:16 should share the same:
campaign concept
palette
product treatment
photography style
typography hierarchy
But they must NOT use identical coordinates.
Recompose:
product scale
headline zone
price zone
background elements
for each ratio.

INFORMATION DENSITY
This is a commercial poster, not a minimalist art print.
The final design should feel approximately:
75-90% visually intentional / occupied
while still maintaining clean separation between elements.
Avoid both extremes:
BAD:
Too empty
-> product floating in blank space
BAD:
Too crowded
-> every area filled with props and graphics
GOOD:
Full photographic environment
large product
strong headline zone
clear promotion zone
controlled supporting information

VISUAL HIERARCHY TARGET
The viewer should perceive the final poster in approximately this order:
PRODUCT NAME
PRODUCT IMAGE
PROMOTIONAL PRICE / PRICE
TAGLINE
LOGO
The photographic background supports this hierarchy rather than competing with it.

REFERENCE-LIKE ADVERTISING ENERGY
The target should have the confidence of a professional seasonal campaign.
Think:
large headline
immersive photography
large product
strong promotional badge or price area
clean supporting information
Do not interpret "clean" as "empty."
Interpret "clean" as:
CLEAR HIERARCHY + CONTROLLED ELEMENTS + STRONG ALIGNMENT.

DO NOT
Do NOT create:
huge blank lower areas
empty beige gradients
tiny centered products
generic catalog photography
anonymous blurred stock imagery dominating the background
weak product hierarchy
tiny headline zones
excessive whitespace
random props
unrelated ingredients
fake text
fake prices
fake claims
fake certifications
fake discount percentages
mockup frames
multiple poster variations inside one image

FINAL QUALITY CHECK
Before generating, verify:
Exactly ONE poster is generated.
The selected 4:5 or 9:16 ratio is respected.
The composition is designed natively for that ratio.
The canvas feels visually complete from top to bottom.
There is NO large accidental empty area.
The product is large and immediately recognizable.
The background is a full commercial photographic environment.
The product name has a LARGE typography-safe zone.
The tagline has a clear supporting zone.
Price / promotional price has a strong dedicated zone.
Logo space exists.
The product packaging is preserved.
No unsupported product claims are invented.
No fake advertising typography is generated.
The visual hierarchy is strong.
The poster feels like a real professionally art-directed commercial campaign.
The design is clean because it is organized — NOT because it is empty.
FINAL TARGET
Create a visually complete, premium commercial product campaign poster with the advertising impact of the supplied reference.
The final design should combine:
FULL-BLEED LIFESTYLE PHOTOGRAPHY
LARGE HERO PRODUCT
OVERSIZED HEADLINE SPACE
STRONG PRICE / PROMOTION AREA
PRODUCT-ADAPTIVE COLOR
CLEAN INFORMATION HIERARCHY
The result should feel designed, complete, commercial, and immediately usable as a finished poster — all typography and the logo are already rendered in the image, in {{target_language}} only."""


POP_COLORFUL_POSTER_PROMPT = """ROLE
You are a senior commercial advertising art director specializing in bold, energetic, high-impact product campaigns for beauty, food, beverage, fashion, lifestyle, and e-commerce brands.
Create exactly ONE professionally art-directed commercial product poster based on the supplied product image, product information, brand assets, and selected aspect ratio.
DESIGN CONCEPT
POP & COLORFUL — BOLD GRAPHIC COMMERCIAL CAMPAIGN
This concept must be visually and structurally different from Minimal & Clean, Luxury & Premium, and Emotional & Mood designs.
The defining characteristics are:
BOLD COLOR + OVERSIZED TYPOGRAPHY + GRAPHIC SHAPES + DYNAMIC PRODUCT PLACEMENT + HIGH VISUAL ENERGY
The result should immediately feel energetic, youthful, contemporary, playful, graphic, and attention-grabbing.
Think of a modern social-media advertising campaign, pop-art-inspired commercial poster, Gen-Z beauty campaign, contemporary beverage campaign, or bold editorial product advertisement.

CRITICAL STYLE SEPARATION
DO NOT interpret Pop & Colorful as:
a minimalist poster with brighter colors
a clean product photograph with one colorful background
a luxury composition with saturated colors
a centered product on a simple gradient
a traditional catalog advertisement
a restrained editorial composition
Instead, the entire layout system itself must become more dynamic and expressive.
Compared with Minimal & Clean, this design must use:
stronger asymmetry
dramatically larger graphic elements
more aggressive cropping
overlapping layers
bold geometric composition
vivid contrasting colors
dynamic product positioning
graphic depth
energetic visual rhythm
promotional shapes
editorial-scale typography zones
The difference must be immediately recognizable even when viewed as a small thumbnail.

INPUT DATA
Use available application data:
{{product_image}}
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{product_description}}
{{price}}
{{promotion_price}}
{{product_category}}
{{selected_aspect_ratio}}
Never invent missing product information.

ON-IMAGE TYPOGRAPHY SYSTEM
There is no separate frontend text overlay for this template. Gemini renders the entire poster —
photography, graphics, AND typography — directly into the final image. Render the actual supplied
values for:
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{price}}
{{promotion_price}}
Do NOT render {{product_description}} as on-image text — it is factual context only, never its own
typography block.
Render every text field's ACTUAL supplied value exactly as given — do not paraphrase, translate loosely,
or invent wording. Every rendered text field must be written in {{target_language}} only — never mix in
Korean or any other language, even if the source data looks like it could be Korean. Keep every line of
rendered text crisp, correctly spelled, and fully legible — never render smudged, warped, doubled, or
illegible letterforms. If you are not confident a string of text will render cleanly, shorten it rather
than risk illegible characters. If you are not confident whether a supplied value is already written in
{{target_language}} or is still Korean, omit that text element entirely rather than guess or render it in
the wrong language.
Therefore, do NOT generate fake advertising copy, random English words, fake prices, fake discount percentages, URLs, CTAs, or pseudo typography.
If a field is empty, null, missing, or unavailable, omit that element and let the layout rebalance
naturally — never render a placeholder, "N/A", or blank box for it.
If a {{company_logo}} reference image is supplied, faithfully reproduce that EXACT logo graphic — do not
redesign, distort, restyle, or replace it. If none is supplied, leave the brand area empty.
Preserve authentic text already printed on the physical product packaging.
The generated visual composition must build real graphic typography zones into the composition itself —
do not create generic empty text boxes.

POP COLOR SYSTEM — CRITICAL
Color is one of the PRIMARY design elements.
Analyze the supplied product packaging and automatically create a bold complementary campaign palette.
Use approximately 3-5 coordinated high-impact colors.
Recommended structure:
45-55% dominant vivid campaign color
20-30% contrasting secondary color
10-20% product-derived color
5-10% accent color
Use strong combinations when appropriate, such as:
orange + electric blue + cream
cobalt blue + vivid yellow + white
hot pink + red + pale pink
lime green + purple + cream
coral + turquoise + yellow
red + cobalt + warm ivory
The palette must remain commercially sophisticated rather than random.
Avoid muted beige-dominant palettes.
Avoid gray-dominant palettes.
Avoid pale minimalist palettes.
Avoid monochromatic luxury palettes.
At thumbnail size, the poster should immediately communicate COLOR.

BACKGROUND DESIGN
Do NOT default to realistic full-frame lifestyle photography.
Unlike Minimal & Clean, the background may function as an active graphic design element.
Use combinations of:
bold solid color fields
contrasting color blocks
oversized circles
geometric shapes
abstract waves
curved panels
stripes
checkerboard details
graphic shadows
oversized cropped shapes
gradient blobs
halftone-inspired textures
playful editorial patterns
Photography may be incorporated when appropriate, but it should interact with the graphic system rather than dominate the entire canvas.
The background must feel intentionally art-directed.

HERO PRODUCT — DYNAMIC PLACEMENT
The supplied product must remain immediately recognizable and visually dominant.
The hero product should occupy approximately 35-60% of visual attention.
DO NOT automatically center the product vertically.
Instead, consider:
oversized product cropping
diagonal positioning
asymmetric placement
product breaking through graphic shapes
product overlapping typography-safe zones
product emerging from a colored panel
dynamic shadow beneath product
floating product with controlled graphic depth
product partially extending beyond a graphic boundary
The product may be slightly rotated when visually appropriate.
The composition should feel active rather than static.

PRODUCT PRESERVATION
Use the supplied product image as the source of truth.
Preserve:
packaging shape
proportions
container
cap
packaging color
label placement
recognizable graphics
distinctive product identity
DO NOT redesign the packaging.
DO NOT replace the product.
DO NOT change its packaging color.
DO NOT create fictional variants.
DO NOT distort its proportions.

OVERSIZED TYPOGRAPHY COMPOSITION
Typography must be treated as a MAJOR GRAPHIC ELEMENT — render {{product_name}} directly as real pixels.
Reserve a dramatically large zone for {{product_name}}.
The product name should be capable of occupying approximately 20-35% of the total composition.
Think:
HUGE DISPLAY TYPE
not:
small conventional advertising headline.
Allow the headline zone to:
span almost the full width
use 1-3 stacked lines
partially sit behind the product
interact with graphic shapes
extend close to canvas edges
use aggressive editorial scale
The final composition should support bold condensed or grotesk typography such as:
Anton
Archivo Black
Bebas Neue
League Spartan
Montserrat Black
Arial Black
or a similar high-impact commercial display sans-serif.

GRAPHIC LAYERING
Use controlled overlapping layers.
Possible visual depth:
BACKGROUND COLOR
-> LARGE GRAPHIC SHAPE
-> OVERSIZED HEADLINE ZONE
-> PRODUCT
-> SMALL ACCENT GRAPHICS
-> PROMOTIONAL BADGE
The product may visually overlap part of the headline area.
Graphic elements may partially leave the canvas.
Shapes should not all remain safely inside margins.
Use edge cropping deliberately.
This creates the feeling of a professionally designed editorial advertisement rather than a template.

PROMOTIONAL PRICE AREA
Price and promotional price must feel highly visible.
Create a strong promotional graphic element such as:
circular sticker
starburst
oversized circle
contrasting rectangular block
speech-bubble-inspired shape
bold corner badge
irregular pop-art badge
The promotional area should feel intentionally louder than in Minimal & Clean.
If both regular and promotional prices exist, visually support:
regular price = secondary
promotional price = dominant.
Render the real supplied price text exactly as given — never invent, estimate, or alter a price.

DECORATIVE GRAPHICS
Use approximately 3-7 supporting graphic elements where appropriate.
Examples:
stars
spark shapes
circles
dots
arrows
curved lines
geometric fragments
checkerboard patterns
outlined shapes
oversized quotation-like marks
sticker-style shapes
graphic fruit/ingredient silhouettes when directly relevant
These elements should create visual rhythm.
They must NEVER appear as random decoration.
Each should support either:
the product,
typography,
promotion,
visual movement.

COMPOSITION — 4:5
When:
{{selected_aspect_ratio}} = 4:5
create a compact, high-impact social-commerce poster.
Suggested visual structure:
TOP / UPPER:
-> small logo zone
-> supporting tagline zone
-> VERY LARGE product-name typography zone
CENTER:
-> oversized hero product
-> overlapping graphic shapes
SIDE / CENTER:
-> promotional badge
LOWER:
-> secondary product information
-> continued graphic composition
The design should occupy approximately 85-95% of the canvas visually.
Use deliberate edge cropping.
Avoid large blank margins.

COMPOSITION — 9:16
When:
{{selected_aspect_ratio}} = 9:16
recompose the campaign specifically for vertical mobile viewing.
Do NOT simply stretch the 4:5 design.
Use the tall format to create visual movement from top to bottom.
Suggested flow:
TOP
-> logo + graphic accent
UPPER
-> oversized headline zone
UPPER-MIDDLE
-> hero product entering or overlapping headline
CENTER
-> product + strong graphic composition
CENTER-LOWER
-> promotional badge
LOWER
-> supporting information
BOTTOM
-> graphic continuation / pattern / color block
Maintain strong visual activity across the entire vertical canvas.

ASYMMETRY — IMPORTANT
Perfectly centered layouts should NOT be the default.
Prefer a controlled asymmetric grid.
For example:
large headline aligned left
hero product shifted right
promotion badge breaking into the opposite side
large cropped background circle
small accent graphics creating directional movement.
The composition should feel balanced without being symmetrical.

VISUAL ENERGY TARGET
The viewer should perceive approximately:
LARGE PRODUCT NAME
HERO PRODUCT
PROMOTIONAL PRICE
BOLD COLOR COMBINATION
TAGLINE
LOGO
The overall impression should be:
LOUD BUT DESIGNED.
PLAYFUL BUT PROFESSIONAL.
COLORFUL BUT COORDINATED.
DYNAMIC BUT READABLE.

STRICTLY AVOID
Do NOT create:
minimalist white advertising layouts
beige luxury layouts
centered product catalog images
subtle neutral gradients
huge empty spaces
tiny products
tiny headline zones
conventional symmetric layouts
restrained corporate layouts
generic studio product photography
photographic background dominating the entire canvas
random rainbow colors
excessive decorative clutter
childish clip-art aesthetics
fake typography
fake prices
fake discounts
fake claims
mockup frames
multiple poster variations inside one image

CRITICAL DIFFERENTIATION TEST
Before generating, mentally compare this result with a hypothetical Minimal & Clean version of the same product.
If both posters would have:
similar product placement
similar background structure
similar typography scale
similar spacing
similar promotional badge
similar composition
then the Pop & Colorful design has FAILED.
Recompose it.
The Pop & Colorful version must have visibly stronger:
COLOR CONTRAST
ASYMMETRY
OVERSIZED TYPOGRAPHY
GRAPHIC SHAPES
OVERLAPPING
PROMOTIONAL ENERGY
EDGE CROPPING
VISUAL RHYTHM

FINAL QUALITY CHECK
Before generating, verify:
Exactly ONE poster is generated.
The selected 4:5 or 9:16 ratio is respected.
The design is natively composed for that ratio.
High-saturation color is immediately noticeable.
At least one strong complementary color contrast exists.
The product is large and recognizable.
The product packaging remains accurate.
The headline zone is dramatically oversized.
The composition uses meaningful graphic layering.
The layout is intentionally asymmetric.
The promotion area has strong visual presence.
The canvas feels approximately 85-95% visually designed.
Edge cropping or off-canvas graphic elements are used where appropriate.
No large accidental blank areas exist.
No unsupported claims are invented.
No fake advertising text is generated.
The design does NOT resemble Minimal & Clean.
The result feels like a professionally art-directed modern pop commercial campaign.
FINAL TARGET
Create a bold, high-energy, contemporary commercial product poster combining:
VIVID CONTRASTING COLORS
OVERSIZED DISPLAY TYPOGRAPHY
LARGE HERO PRODUCT
ASYMMETRIC COMPOSITION
GRAPHIC SHAPES
OVERLAPPING LAYERS
BOLD PROMOTIONAL BADGE
EDGE-CROPPED ELEMENTS
HIGH VISUAL DENSITY
The result should look like a professionally art-directed social-commerce campaign that immediately stands apart from Minimal & Clean, Luxury & Premium, and Emotional & Mood templates — all typography and the logo are already rendered in the image, in {{target_language}} only."""


def _pop_colorful_poster_prompt(
    product_name: str, description: str, tagline: str, price: str, aspect_ratio: str,
    logo_render_note: str = "", target_language: str = "ko",
) -> str:
    values = {
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "company_logo": logo_render_note,
        "product_name": product_name,
        "company_slogan_or_tagline": tagline,
        "product_description": description,
        "price": price,
        "promotion_price": "",
        "product_category": "",
        "selected_aspect_ratio": aspect_ratio,
        "target_language": TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean",
    }
    return _apply_prompt_template(POP_COLORFUL_POSTER_PROMPT, values)


EMOTIONAL_MOOD_POSTER_PROMPT = """ROLE
You are a senior commercial art director, fashion editorial designer, and lifestyle photographer specializing in emotional beauty campaigns, premium lifestyle advertising, warm editorial photography, and sophisticated brand storytelling.
Create exactly ONE premium emotional product advertising poster based on the supplied product image, brand information, product information, and selected aspect ratio.
The design concept is:
EMOTIONAL & MOOD
Create a visually sophisticated advertising poster that evokes emotion through:
warm color tones
atmospheric photography
intimate lifestyle imagery
cinematic lighting
editorial composition
strong visual storytelling
sophisticated typography-aware layout
premium brand mood
The poster should feel like a professionally art-directed beauty or lifestyle campaign from a contemporary fashion or beauty magazine.
It must feel emotional and atmospheric, but still work as a clear commercial product advertisement.

CORE DESIGN PHILOSOPHY
IMPORTANT:
"Emotional & Mood" does NOT mean:
empty beige background
simple product catalog photography
generic flowers beside a product
excessive blank space
blurry stock photography
overly romantic decoration
Instead, interpret Emotional & Mood as:
ATMOSPHERIC PHOTOGRAPHY
HUMAN EMOTION OR LIFESTYLE STORY
WARM COLOR GRADING
LARGE EDITORIAL TYPOGRAPHY SPACE
PRODUCT INTEGRATION
STRONG BRAND MOOD
The image should make the viewer feel something before reading the information.

REFERENCE STYLE
Use the supplied reference image as inspiration for:
warm editorial color grading
intimate human close-up photography
large facial or lifestyle imagery
oversized headline composition
product layered over or integrated with the scene
sophisticated beauty campaign mood
strong vertical hierarchy
warm shadows
modern fashion editorial aesthetic
product and typography visually interacting
full-frame composition
Do NOT copy:
the exact people
exact faces
exact product
exact wording
exact headline
exact brand
exact layout
exact colors
Reinterpret the visual philosophy according to the actual product.

OUTPUT
Generate exactly:
ONE advertising poster
Use:
{{selected_aspect_ratio}}
Possible values:
4:5
9:16
The entire composition must be designed natively for the selected aspect ratio.
Do NOT:
generate multiple posters
generate a collage
create a mockup
create a square image
generate 4:5 and crop it into 9:16
stretch an existing composition

ASPECT RATIO — 4:5
If:
{{selected_aspect_ratio}} = 4:5
Create a balanced vertical editorial advertising poster.
Use a compact but emotionally powerful composition.
Recommended visual hierarchy:
TOP
-> logo / small brand area
UPPER TO CENTER
-> large product-name typography-safe area
CENTER
-> emotional lifestyle image + product interaction
LOWER-MIDDLE
-> tagline area
LOWER
-> price area
Use the entire frame intentionally.
The poster should work especially well for:
social feed advertising
e-commerce campaign imagery
product promotion
brand campaign content
Do NOT leave a large empty lower area.

ASPECT RATIO — 9:16
If:
{{selected_aspect_ratio}} = 9:16
Create a tall cinematic editorial poster.
Use the additional vertical space for storytelling.
Recommended flow:
TOP
-> logo / atmospheric opening
UPPER
-> large product-name area
UPPER-MIDDLE / CENTER
-> emotional lifestyle visual
CENTER
-> hero product
LOWER-MIDDLE
-> tagline
LOWER
-> price / promotional price
BOTTOM
-> subtle continuation of the photographic environment
The result should feel specifically designed for:
Stories
Reels
vertical mobile advertising
full-screen campaign content
Do NOT simply extend a 4:5 background.
Recompose the visual specifically for 9:16.

INPUT DATA
Use available application data:
{{product_image}}
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{product_description}}
{{price}}
{{promotion_price}}
{{product_category}}
{{selected_aspect_ratio}}
Use only information that is actually supplied.
Never invent missing information.

ON-IMAGE TYPOGRAPHY SYSTEM
There is no separate frontend text overlay for this template. Gemini is responsible for photography,
model or lifestyle scene, product integration, background, lighting, shadows, atmospheric elements,
composition, AND typography — the entire poster is rendered directly into the final image.
Render the actual supplied values for:
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{price}}
{{promotion_price}}
Do NOT render {{product_description}} as on-image text — it is factual context only, never its own
typography block.
Render every text field's ACTUAL supplied value exactly as given — do not paraphrase, translate loosely,
or invent wording. Every rendered text field must be written in {{target_language}} only — never mix in
Korean or any other language, even if the source data looks like it could be Korean. Keep every line of
rendered text crisp, correctly spelled, and fully legible — never render smudged, warped, doubled, or
illegible letterforms. If you are not confident a string of text will render cleanly, shorten it rather
than risk illegible characters. If you are not confident whether a supplied value is already written in
{{target_language}} or is still Korean, omit that text element entirely rather than guess or render it in
the wrong language.
Therefore:
Do NOT create:
fake product names
fake slogans
fake prices
fake discount percentages
fake CTA
website addresses
social media handles
random English words
meaningless letters
pseudo typography
fake logos
If a field is empty, null, missing, or unavailable, omit that element and let the layout rebalance
naturally — never render a placeholder, "N/A", or blank box for it.
If a {{company_logo}} reference image is supplied, faithfully reproduce that EXACT logo graphic — do not
redesign, distort, restyle, or replace it. If none is supplied, leave the brand area empty.
Preserve only authentic text already physically printed on the supplied product packaging.

IMPORTANT — TYPOGRAPHY-AWARE COMPOSITION
The visual composition must be designed around bold editorial typography that you render directly.
Do NOT simply leave a blank rectangle for text.
Instead, create a composition where the typography feels intentionally integrated into the photography.
The final composition must render:
1. PRODUCT NAME
Very large and visually dominant.
2. TAGLINE
Emotional supporting message.
3. PRICE / PROMOTIONAL PRICE
Clear commercial information.
4. COMPANY LOGO
Small but independent brand signature.

PRODUCT NAME AREA — CRITICAL
The product name must be one of the strongest elements in the poster.
Reserve enough visual space for an oversized headline.
Intended typography:
bold condensed sans-serif
editorial grotesk
modern fashion display type
ExtraBold / Black
strong vertical presence
tight line spacing
dramatic scale
Typography feeling similar to:
Anton
Archivo Black
Bebas Neue
Helvetica Neue Condensed Bold
League Gothic
Neue Haas Grotesk Display
The headline may occupy approximately:
20-35% of the visual hierarchy.
Render the product name in 2-3 large lines similar to a fashion editorial cover.

TYPOGRAPHY AND SUBJECT LAYERING
Inspired by high-end editorial design, allow the composition to support controlled layering between:
product
typography
model
background
For example:
the product may visually overlap part of the headline area,
or
the headline may appear behind part of the product,
while remaining readable.
However:
Do NOT place typography directly over important facial features such as:
eyes
nose
mouth
Protect important human features.
The composition should feel intentionally layered, not randomly overlapped.

EMOTIONAL LIFESTYLE PHOTOGRAPHY
Whenever appropriate for the product category, create an emotional lifestyle scene.
For beauty, skincare, fashion, wellness, or personal-care products, human presence is strongly encouraged.
Possible visual approaches:
intimate facial close-up
two or more people naturally interacting
warm skin close-up
model touching face naturally
quiet candid moment
mirror reflection
soft beauty portrait
natural lifestyle interaction
relaxed emotional expression
The image should feel like a real editorial photoshoot.
Avoid obvious stock-photo posing.

HUMAN MODEL STYLE
Models should feel:
natural
confident
intimate
contemporary
sophisticated
approachable
emotionally expressive
Use realistic:
skin texture
facial proportions
hair
hands
eyes
lighting
Avoid:
plastic skin
excessive retouching
uncanny faces
malformed hands
artificial smiles
exaggerated beauty filters
generic AI influencer appearance
The people should look professionally photographed rather than AI-generated.

IMPORTANT — MODEL ADAPTATION
Do NOT force human models for every category.
If a human model is inappropriate for the supplied product, create emotional storytelling through:
atmospheric environment
natural materials
warm lighting
tactile close-ups
lifestyle context
intimate product photography
The emotional mood is mandatory.
Human presence is conditional.

PRODUCT — HERO ROLE
The supplied product must remain commercially important.
Even when a large human portrait is used, the product cannot become an insignificant accessory.
The product should occupy approximately:
25-45% of visual attention
depending on the composition.
The product may:
appear prominently in the foreground
float naturally over the editorial image
be held naturally by a model
appear close to the face
rest on a relevant surface
overlap the headline typography
integrate into the photographic story
The product should feel intentionally art-directed.

PRODUCT PRESERVATION — CRITICAL
Use {{product_image}} as the source of truth.
Preserve:
package shape
container proportions
cap
bottle or tube structure
packaging colors
recognizable label placement
brand graphics
distinctive product characteristics
Do NOT:
redesign the product
change packaging colors
replace the product
invent another product variant
distort the product
change container proportions
create fake packaging claims
The final product must remain recognizable as the supplied product.

MOOD & COLOR
Build the color palette from the actual product and brand.
The overall color treatment should be:
warm
cohesive
atmospheric
sophisticated
emotionally rich
slightly cinematic
Possible palette families include:
Warm Neutral
cream + caramel + warm brown + ivory
Warm Rose
dusty rose + nude + terracotta + cream
Golden
warm beige + amber + honey + deep brown
Soft Natural
sage + warm ivory + muted olive + skin tone
Warm Peach
peach + coral + cream + soft brown
These are examples only.
Do NOT force brown or beige onto every product.

PRODUCT-ADAPTIVE COLOR RULE
The Emotional & Mood template must adapt to the actual product.
For example:
Pink cosmetic
-> dusty rose + nude + warm cream
Green skincare
-> muted sage + ivory + warm olive
Blue skincare
-> muted blue-gray + cream + warm skin tones
Orange product
-> terracotta + warm peach + cream
Black product
-> espresso brown + charcoal + warm beige
White product
-> ivory + caramel + subtle brand accent
The final palette should remain warm and emotionally cohesive.

COLOR GRADING
Apply cinematic editorial color grading.
Prefer:
warm highlights
slightly muted saturation
rich skin tones
soft blacks
gentle contrast
warm shadows
natural film-like depth
Avoid:
neon colors
overly saturated pop colors
cold clinical lighting
harsh pure white backgrounds
excessive HDR
artificial orange skin
The result should feel premium and photographic.

LIGHTING
Use emotionally expressive natural or studio lighting.
Preferred:
golden-hour light
warm window light
diffused sunlight
soft side lighting
gentle backlight
warm studio light
subtle shadow patterns
Use light to create mood.
Do NOT make every area equally bright.
Allow controlled shadows and depth.

BACKGROUND
Prefer a full-frame photographic environment.
Possible environments:
close-up human portrait
warm interior
soft bedroom light
vanity
sunlit wall
linen
warm stone
wood
subtle nature
beach at golden hour
softly lit bathroom
contemporary lifestyle space
The background should contribute emotionally to the campaign.
Avoid generic blurred stock backgrounds.

FULL-FRAME COMPOSITION
Use the entire canvas intentionally.
The reference design feels powerful because the photograph extends throughout the poster.
Therefore:
Do NOT create:
large unused white areas
empty lower half
huge plain beige gradient
isolated small product
product floating in empty space
Aim for approximately:
75-90% visually intentional composition
while keeping information hierarchy clean.

TAGLINE AREA
Render the actual supplied value for:
{{company_slogan_or_tagline}}
The tagline should feel emotional and aspirational.
It should appear smaller than the product name.
Provide enough space for approximately:
1-2 lines.

PRICE AREA
Render the actual supplied value for:
{{price}}
and when available:
{{promotion_price}}
Unlike the Pop & Colorful template, the price should NOT dominate through a bright sale badge.
Instead, integrate it elegantly.
Possible treatment:
clean typography area
subtle outlined pill
restrained solid shape
elegant corner placement
small contrasting block
The price must remain noticeable but should not destroy the emotional mood.
Render the real supplied price text exactly as given — never invent, estimate, or alter a price.

LOGO AREA
Render the actual supplied value for:
{{company_logo}}
Possible placements:
top center
top left
top right
The logo should feel like a subtle brand signature.
Do not make it visually dominant.

COMPOSITION STYLE
Strong compositions may include:
OPTION A — EDITORIAL PORTRAIT
Large human portrait fills the background.
Oversized product-name area integrated around the face.
Product placed prominently near center.
Tagline lower.
Price subtly placed.
OPTION B — INTIMATE PRODUCT + MODEL
Close crop of model skin / hand / face.
Product appears naturally in foreground.
Large headline uses surrounding negative visual zones.
OPTION C — ATMOSPHERIC PRODUCT STORY
No model.
Full-frame warm lifestyle environment.
Large product integrated into environment.
Strong editorial headline zone.
Atmospheric lighting and texture create emotion.
Choose intelligently according to product category.

VISUAL DIFFERENTIATION
This template must clearly differ from:
MINIMAL & CLEAN
Do NOT rely primarily on neutral studio backgrounds and isolated product shots.
POP & COLORFUL
Do NOT use:
loud complementary colors
playful stickers
graphic bursts
cartoon shapes
excessive promotional badges
energetic pop-art graphics
Emotional & Mood should instead communicate:
WARMTH + HUMANITY + ATMOSPHERE + STORY + EDITORIAL BEAUTY.

DO NOT
Do NOT generate:
fake text
fake logo
fake price
fake discounts
fake certifications
fake ingredients
fake product claims
generic stock photography
excessive flowers
random decorative props
empty beige backgrounds
tiny centered product
cold clinical design
loud pop graphics
excessive promotional stickers
artificial AI-looking models

FINAL QUALITY CHECK
Before generating, verify:
Exactly ONE poster is generated.
The selected aspect ratio is exactly 4:5 or 9:16.
The composition is designed specifically for that ratio.
The entire frame feels intentionally composed.
The supplied product remains recognizable.
The product has strong commercial presence.
The visual feels emotional and atmospheric.
Warm editorial color grading is present.
Human models look realistic when used.
Product-name space is large and dramatic.
Tagline space is clearly available.
Price space is clearly available.
Logo space is available.
No fake advertising typography is generated.
No unsupported product information is invented.
The result does NOT resemble Minimal & Clean.
The result does NOT resemble Pop & Colorful.
The poster resembles a professionally art-directed fashion, beauty, or lifestyle campaign.
The final image creates an emotional response while still clearly selling the product.
FINAL GOAL
Create a premium Emotional & Mood commercial poster that combines:
WARM EDITORIAL PHOTOGRAPHY
EMOTIONAL STORYTELLING
HUMAN OR LIFESTYLE PRESENCE
LARGE TYPOGRAPHY-AWARE COMPOSITION
PROMINENT PRODUCT
SOPHISTICATED PRICE PLACEMENT
CINEMATIC COLOR GRADING
STRONG BRAND MOOD
The final poster should feel intimate, stylish, warm, memorable, and professionally art-directed — with
PRODUCT NAME + TAGLINE + PRICE + LOGO already rendered directly in the image, in
{{target_language}} only."""


def _emotional_mood_poster_prompt(
    product_name: str, description: str, tagline: str, price: str, aspect_ratio: str,
    logo_render_note: str = "", target_language: str = "ko",
) -> str:
    values = {
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "company_logo": logo_render_note,
        "product_name": product_name,
        "company_slogan_or_tagline": tagline,
        "product_description": description,
        "price": price,
        "promotion_price": "",
        "product_category": "",
        "selected_aspect_ratio": aspect_ratio,
        "target_language": TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean",
    }
    return _apply_prompt_template(EMOTIONAL_MOOD_POSTER_PROMPT, values)


MODERN_BOLD_POSTER_PROMPT = """ROLE
You are a senior graphic designer and commercial art director specializing in bold editorial posters, Swiss-inspired graphic design, contemporary branding, geometric advertising, and high-impact product campaigns.
Create exactly ONE graphic advertising poster based on the supplied product image, product information, company branding, and selected aspect ratio.
The concept is:
MODERN & BOLD
This is a GRAPHIC POSTER DESIGN, NOT a photographic studio scene.
The design must be driven by:
bold 2D geometric structure
oversized typography-aware composition
strong light-dark contrast
limited color palette
large product cutout
asymmetric grid
flat color blocking
bold editorial hierarchy
strong graphic rhythm
The poster should feel like a professionally designed contemporary editorial poster.

ABSOLUTE PRIORITY
The final result must look like:
GRAPHIC DESIGN FIRST
PRODUCT CUTOUT SECOND
PHOTOGRAPHY ONLY AS PRODUCT MATERIAL
Do NOT interpret this as a luxury product photoshoot.
Do NOT build a realistic studio room around the product.
Do NOT create architectural 3D blocks.
Do NOT create a marble pedestal.
Do NOT create a dark photographic environment.
Do NOT create a cinematic product scene.
Do NOT create a beauty still-life photograph.
The background must primarily be a flat graphic composition.

OUTPUT
Generate exactly:
ONE poster
Aspect ratio:
{{selected_aspect_ratio}}
Possible values:
4:5
9:16
The design must be composed natively for the selected ratio.
Do NOT:
crop 4:5 into 9:16
stretch the layout
generate multiple versions
generate a collage
generate a mockup
create a square image

INPUT DATA
Use:
{{product_image}}
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{product_description}}
{{price}}
{{promotion_price}}
{{product_category}}
{{selected_aspect_ratio}}
Never invent missing information.

ON-IMAGE TYPOGRAPHY SYSTEM
There is no separate frontend text overlay for this template. Gemini generates the product cutout,
graphic background, geometric shapes, color blocks, layout structure, shadows only when necessary,
visual rhythm, AND typography — the entire poster is rendered directly into the final image.
Render the actual supplied values for:
{{company_logo}}
{{product_name}}
{{company_slogan_or_tagline}}
{{price}}
{{promotion_price}}
Do NOT render {{product_description}} as on-image text — it is factual context only, never its own
typography block.
Render every text field's ACTUAL supplied value exactly as given — do not paraphrase, translate loosely,
or invent wording. Every rendered text field must be written in {{target_language}} only — never mix in
Korean or any other language, even if the source data looks like it could be Korean. Keep every line of
rendered text crisp, correctly spelled, and fully legible — never render smudged, warped, doubled, or
illegible letterforms. If you are not confident a string of text will render cleanly, shorten it rather
than risk illegible characters. If you are not confident whether a supplied value is already written in
{{target_language}} or is still Korean, omit that text element entirely rather than guess or render it in
the wrong language.
Therefore:
Do NOT create:
fake headline
fake product name
fake tagline
fake company name
fake price
fake discount
random letters
random numbers
fake logo
CTA
URL
social media text
If a field is empty, null, missing, or unavailable, omit that element and let the layout rebalance
naturally — never render a placeholder, "N/A", or blank box for it.
If a {{company_logo}} reference image is supplied, faithfully reproduce that EXACT logo graphic — do not
redesign, distort, restyle, or replace it. If none is supplied, leave the brand area empty.
Preserve only authentic text already physically printed on the product packaging.

MOST IMPORTANT VISUAL RULE
The poster must NOT look like:
product photography
luxury skincare photography
dark studio scene
architectural set
realistic room
marble still life
black premium advertisement
Instead, the poster must look like:
A FLAT, HIGH-CONTRAST, GEOMETRIC GRAPHIC POSTER.

REFERENCE DESIGN LOGIC
Follow the reference poster for its design principles:
very large typography area
cream-colored graphic field
strong dark-blue graphic field
checkerboard fragments
rectangular modules
large quotation-mark graphics
bold product cutout
asymmetric placement
limited color palette
strong separation between information zones
large graphic shapes extending to canvas edges
graphic composition filling the entire frame
Do NOT reproduce the exact coffee poster.
Do NOT always use blue and cream.
Translate the same graphic intensity to the supplied product.

COLOR PALETTE
Use only:
2 dominant colors
+ 1 neutral
optional 1 accent color
Avoid many colors.
The palette must have strong contrast.
Examples:
White/yellow product
-> cream + deep navy + warm yellow
Orange product
-> cream + cobalt + orange
Pink product
-> pale blush + deep burgundy + cream
Green product
-> ivory + forest green + black
Blue product
-> cream + navy + bright blue
Black product
-> warm white + black + one vivid accent
Adapt to the actual product.
Do NOT default to black backgrounds.

GRAPHIC BACKGROUND — CRITICAL
At least 60-80% of the canvas should be visibly structured by flat graphic elements.
Use:
large rectangles
cropped squares
checker fragments
diagonal color fields
thick horizontal bars
vertical blocks
corner modules
quotation-mark-inspired shapes
circles
repeated geometric patterns
flat grid modules
Shapes must be large enough to affect the whole composition.
Do NOT use tiny decorative geometry.
Do NOT place one small checker pattern in a corner and call the design geometric.
The geometry must form the architecture of the poster.

FLAT GRAPHIC STYLE
Prefer:
flat solid colors
subtle matte texture
paper-like surface
crisp edges
clean intersections
simple hard boundaries
bold color fields
Avoid:
realistic walls
realistic rooms
photographic architecture
marble slabs
glass pedestals
3D exhibition stands
excessive gradients
The poster should feel designed in Illustrator or InDesign rather than photographed in a studio.

PRODUCT CUTOUT
Use {{product_image}} as the source of truth.
Remove or isolate its original background.
Treat the product as a professionally cut-out commercial object.
Preserve:
exact shape
proportions
cap
packaging
packaging color
label placement
recognizable identity
Do NOT redesign the product.
Do NOT replace it.
Do NOT change its color.
Do NOT generate additional product variants.

PRODUCT SCALE
The product must occupy approximately:
35-50% of the poster's visual attention.
The product should feel large and assertive.
Do NOT place it as a small centered item.
Preferred placement:
center-right
lower-center
lower-right
overlapping central grid
partially crossing large color blocks
Allow the product to break the graphic grid.

PRODUCT AND GEOMETRY INTERACTION
The product should interact with the geometry.
For example:
product crosses from a light block into a dark block
product overlaps a large rectangle
product breaks through a checker module
product sits partially in front of a diagonal shape
product visually connects two color zones
Avoid simply placing the product on top of a finished background.
The product should feel structurally integrated into the poster.

TYPOGRAPHY-AWARE DESIGN
Render the actual supplied typography directly into the image. Design large areas that support:
PRODUCT NAME
The product name must be the dominant text element.
Reserve enough room for:
extremely large text
1-3 lines
bold or editorial type
tight line spacing
The headline area should occupy approximately:
25-35% of the visual hierarchy.
Do NOT reserve a small conventional headline box.
Make it large enough to function as a graphic element.

TYPOGRAPHY STYLE
The rendered typography may combine:
Editorial Serif
Bodoni
Didot
Cormorant Garamond
DM Serif Display
with
Bold Modern Sans Serif
Helvetica Neue Black
Neue Haas Grotesk
Archivo Black
Anton
Inter Black
Create strong contrast between typography roles.
Example visual principle:
VERY LARGE SERIF WORD
BOLD SANS-SERIF WORD
Render {{product_name}} using this typographic system, exactly as supplied.

TAGLINE AREA
Render the actual supplied value for:
{{company_slogan_or_tagline}}
It should align strongly with the graphic grid.
Possible placements:
directly beneath the headline
beside the product
inside a contrasting rectangular block

PRICE AREA — CRITICAL
Render the actual supplied value for:
{{price}}
and when available:
{{promotion_price}}
Use:
rectangle
side block
corner block
large numeric-safe field
horizontal banner
Avoid round sale badges.
Price treatment should feel:
graphic
structured
bold
modern
When promotional price exists:
regular price
-> smaller
promotional price
-> much larger
Render the real supplied price text exactly as given — never invent, estimate, or alter a price.

LOGO AREA
Render the actual supplied value for:
{{company_logo}}
Use:
top-left
top-right
small corner module
Do not create a fake logo.

SHADOW RULE
Use minimal realistic shadow.
The product may have:
small contact shadow
simple cast shadow
but shadow must NOT turn the composition into a photographic scene.
Avoid:
deep cinematic shadow
dramatic spotlight
moody black lighting
glossy luxury reflections
The poster must remain primarily graphic.

LIGHTING RULE
Use clean product lighting only.
Preferred:
clear frontal light
soft directional product highlight
controlled realistic material rendering
Do NOT use lighting as the main visual concept.
Geometry and color must remain dominant.

4:5 LAYOUT
If:
{{selected_aspect_ratio}} = 4:5
Use a compact graphic layout.
Recommended structure:
TOP 25-30%
-> logo
-> oversized product-name zone
CENTER 40-45%
-> large product cutout
-> diagonal or rectangular color blocks
-> geometric pattern
LOWER 25-30%
-> tagline
-> strong rectangular price module
The entire canvas must feel filled and intentional.
Do NOT leave an empty lower region.

9:16 LAYOUT
If:
{{selected_aspect_ratio}} = 9:16
Use a tall modular editorial grid.
Recommended structure:
TOP 20%
-> logo
-> oversized headline zone
UPPER-MIDDLE 20%
-> tagline
-> major geometric block
CENTER 30-35%
-> large product cutout crossing multiple color fields
LOWER-MIDDLE 15%
-> checker / geometric rhythm
BOTTOM 15-20%
-> strong rectangular price block
The bottom must visually complete the design.
Do NOT leave the bottom dark, empty, or photographic.

MANDATORY GEOMETRIC DENSITY
The composition must contain at least:
2 large color fields
2-4 major geometric blocks
1 repeating geometric motif or checker fragment
1 strong asymmetrical alignment
1 graphic module dedicated to price or information
1 oversized typography-safe region
These elements must be visibly important.
They must not be tiny decorations.

ASYMMETRY
The design must be asymmetrical.
Avoid:
product perfectly centered
equal left-right balance
standard centered catalog layout
Prefer:
offset product
uneven columns
cropped shapes
edge-aligned modules
intentional overlaps
The poster should feel designed, not templated.

NO PHOTOGRAPHIC ENVIRONMENT
Do NOT generate:
marble table
realistic interior
beach
bathroom
studio room
architectural blocks
lifestyle photography
human models
blurred photographic background
unless explicitly required by product data.
For this template, the default should always be:
GRAPHIC BACKGROUND + PRODUCT CUTOUT

DIFFERENTIATION
This design must NOT resemble:
MINIMAL & CLEAN
No soft neutral studio photography.
POP & COLORFUL
No stickers, splashes, cartoon bursts, or many saturated colors.
EMOTIONAL & MOOD
No cinematic portraits, warm lifestyle photography, or soft romantic lighting.
Modern & Bold must communicate:
STRUCTURE
CONTRAST
GEOMETRY
SCALE
CONFIDENCE

DO NOT
Do NOT create:
dark luxury photography
black studio backgrounds
marble pedestals
realistic architectural sets
tiny centered product
excessive empty space
soft lifestyle photography
random geometric decorations
round sale badges
neon effects
playful stickers
gradients as the main design
fake typography
fake prices
fake claims
fake logos

FINAL QUALITY CHECK
Before generating, confirm:
This looks like a GRAPHIC POSTER, not a product photoshoot.
Exactly ONE poster is generated.
The selected aspect ratio is respected.
4:5 and 9:16 are independently composed.
Flat graphic color fields dominate the background.
At least 60% of the canvas uses intentional geometric structure.
At least 2 major contrasting color fields are present.
The product is large and offset rather than small and centered.
The product overlaps or crosses geometric elements.
The typography-safe zone is extremely large.
The tagline zone is visible.
The price zone is a strong rectangular or geometric module.
The logo zone is clearly defined.
No large accidental blank area exists.
No dark luxury studio scene is present.
No marble pedestal or architectural set is present.
No fake text is generated.
No unsupported product claims are invented.
The final composition feels bold, modern, graphic, structured, and high-impact.
FINAL GOAL
Create a MODERN & BOLD GRAPHIC PRODUCT POSTER built from:
LARGE PRODUCT CUTOUT
OVERSIZED TYPOGRAPHY STRUCTURE
LIMITED HIGH-CONTRAST PALETTE
LARGE FLAT COLOR FIELDS
ASYMMETRIC GRID
GEOMETRIC MODULES
STRONG RECTANGULAR PRICE AREA
CLEAN INFORMATION BLOCKS
The final poster should look like it was professionally designed in a contemporary graphic design studio.
It must NOT look like a studio product photograph with text placed on top — all typography and the logo
are already rendered directly in the graphic composition, in {{target_language}} only."""


def _modern_bold_poster_prompt(
    product_name: str, description: str, tagline: str, price: str, aspect_ratio: str,
    logo_render_note: str = "", target_language: str = "ko",
) -> str:
    values = {
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "company_logo": logo_render_note,
        "product_name": product_name,
        "company_slogan_or_tagline": tagline,
        "product_description": description,
        "price": price,
        "promotion_price": "",
        "product_category": "",
        "selected_aspect_ratio": aspect_ratio,
        "target_language": TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean",
    }
    return _apply_prompt_template(MODERN_BOLD_POSTER_PROMPT, values)


def _apply_prompt_template(template: str, values: dict[str, str]) -> str:
    """{{token}} 형태의 자리표시자를 실제 값으로 치환한다. 값이 없는 항목은 빈 문자열로 남겨서,
    프롬프트 자체가 갖고 있는 "데이터 없으면 지어내지 말고 비워두라"는 규칙이 그대로 작동하게 한다."""
    result = template
    for key, value in values.items():
        result = result.replace("{{" + key + "}}", value or "")
    return result


def _luxury_premium_poster_prompt(
    product_name: str, description: str, tagline: str, price: str, brand_name: str, aspect_ratio: str,
    target_language: str = "ko",
) -> str:
    values = {
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "brand_name": brand_name,
        "product_name": product_name,
        "product_category": "",
        "product_benefit": "",
        "product_description": description,
        "key_ingredients": "",
        "product_capacity": "",
        "tagline": tagline,
        "hero_word": "",
        "price": price,
        "cta_text": "",
        "primary_color": "",
        "secondary_color": "",
        "accent_color": "",
        "target_market": "",
        "aspect_label": aspect_ratio,
        "target_language": TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean",
    }
    return _apply_prompt_template(LUXURY_PREMIUM_POSTER_PROMPT, values)


def _minimal_clean_poster_prompt(
    product_name: str, description: str, tagline: str, price: str, aspect_ratio: str,
    logo_render_note: str = "", target_language: str = "ko",
) -> str:
    values = {
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "company_logo": logo_render_note,
        "product_name": product_name,
        "company_slogan_or_tagline": tagline,
        "product_description": description,
        "price": price,
        "promotion_price": "",
        "product_category": "",
        "selected_aspect_ratio": aspect_ratio,
        "target_language": TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean",
    }
    return _apply_prompt_template(MINIMAL_CLEAN_POSTER_PROMPT, values)


# 포스터 템플릿이 고를 수 있는 세로 비율 — 피드용(4:5)과 스토리/모바일 전면(9:16) 중 사용자가 고른다.
POSTER_ASPECT_RATIOS = {"4:5", "9:16"}
DEFAULT_POSTER_ASPECT_RATIO = "4:5"


def _with_notes(prompt: str, *notes: str) -> str:
    """logo_note/model_note처럼 프롬프트 앞에 덧붙이는 부가 지시문들을 안전하게 이어붙인다
    (빈 문자열은 건너뛴다)."""
    parts = [n for n in notes if n] + [prompt]
    return "\n\n".join(parts)


def _generate_poster(
    user_id, gen_id, reference_images, product_name, description, must_have_photo,
    style_hint="", template_id="", tagline="", price="", brand_name="", logo_note="",
    aspect_ratio=DEFAULT_POSTER_ASPECT_RATIO, model_note="", target_language="ko",
):
    if aspect_ratio not in POSTER_ASPECT_RATIOS:
        aspect_ratio = DEFAULT_POSTER_ASPECT_RATIO

    # 이 템플릿에 참고 디자인 이미지가 등록돼 있으면(TEMPLATE_STYLE_REFERENCE_IMAGES) 상품 사진/로고
    # 뒤에 맨 마지막으로 덧붙여서, 실제 톤·구도·밀도를 예시로 보여준다.
    style_ref = TEMPLATE_STYLE_REFERENCE_IMAGES.get(template_id)
    gen_reference_images = [*reference_images, style_ref] if style_ref else reference_images
    style_ref_note = STYLE_REFERENCE_NOTE if style_ref else ""

    # 럭셔리&프리미엄을 제외한 모든 포스터 템플릿은 카드뉴스처럼 문구(상품명·태그라인·가격)와 로고를
    # 이미지 픽셀에 직접 그려 넣는다 — 프론트는 더 이상 텍스트를 오버레이하지 않는다. 그래서 로고도
    # "문자·워터마크처럼 렌더링하지 말라"는 LOGO_REFERENCE_NOTE(logo_note) 대신, 실제 업로드된 로고를
    # 그대로 재현하라는 지시를 프롬프트 값 자체에 심는다(카드뉴스의 logo_render_note와 동일한 패턴).
    # 럭셔리만 로고 대신 브랜드명 텍스트(brand_name)를 쓰므로 예외로 둔다.
    logo_render_note = (
        "(첨부된 참고 이미지 속 실제 로고입니다 — 다른 로고를 지어내지 말고 이 로고를 그대로 재현해서 "
        "작은 브랜드 영역에 배치하세요)"
        if logo_note
        else ""
    )

    if template_id == "tpl-poster-luxury":
        prompt = _luxury_premium_poster_prompt(
            product_name, description, tagline, price, brand_name, aspect_ratio, target_language
        )
        prompt = _with_notes(prompt, logo_note, model_note, style_ref_note)
    elif template_id == "tpl-poster-minimal":
        prompt = _minimal_clean_poster_prompt(
            product_name, description, tagline, price, aspect_ratio, logo_render_note, target_language
        )
        prompt = _with_notes(prompt, model_note, style_ref_note)
    elif template_id == "tpl-poster-pop":
        prompt = _pop_colorful_poster_prompt(
            product_name, description, tagline, price, aspect_ratio, logo_render_note, target_language
        )
        prompt = _with_notes(prompt, model_note, style_ref_note)
    elif template_id == "tpl-poster-emotional":
        prompt = _emotional_mood_poster_prompt(
            product_name, description, tagline, price, aspect_ratio, logo_render_note, target_language
        )
        prompt = _with_notes(prompt, model_note, style_ref_note)
    elif template_id == "tpl-poster-modern":
        prompt = _modern_bold_poster_prompt(
            product_name, description, tagline, price, aspect_ratio, logo_render_note, target_language
        )
        prompt = _with_notes(prompt, model_note, style_ref_note)
    else:
        prompt = _poster_prompt(
            product_name, description, must_have_photo, style_hint, aspect_ratio, tagline, price,
            logo_render_note, target_language, model_note == AI_MODEL_ON_NOTE,
        )
        prompt = _with_notes(prompt, model_note, style_ref_note)
    image_bytes, mime = _generate_image(prompt, gen_reference_images, aspect_ratio)
    return {"images": [_upload_generated_image(user_id, gen_id, "poster", image_bytes, mime)]}


def _generate_card_news(
    user_id, gen_id, reference_images, product_name, description, must_have_photo, style_hint="",
    logo_note="", tagline="", price="", brand_name="", target_language="ko", template_id="", model_note="",
):
    # 카드 장수는 4장으로 고정한다 — 레이아웃마다 다른 건 카드 수가 아니라 프롬프트에 얹는 스타일 톤이다.
    # 여기서 만드는 features/promoLine은 이미지 픽셀에 그대로 구워지므로, 반드시 실제 요청 언어로
    # 생성해야 한다 — 한국어로 만들어놓고 나중에 화면에서만 번역하면 이미지 속 글자는 그대로 한글로 남는다.
    target_language_name = TRANSLATE_LANGUAGE_NAMES.get(target_language) or "Korean"
    copy = _generate_copy_json(
        _card_news_copy_prompt(product_name, description, target_language), CARD_NEWS_COPY_SCHEMA
    )
    features = copy.get("features") or []
    promo_line = copy.get("promoLine") or ""
    benefit_slots = (features + ["", "", ""])[:3]
    # 로고는 계정 프로필의 회사명이 아니라 Step 1에서 실제로 올린 로고 이미지만 쓴다 — 있으면 그대로
    # 재현하고, 없으면 브랜드 영역을 비워둔다.
    logo_render_note = (
        "(첨부된 참고 이미지 속 실제 로고입니다 — 다른 로고를 지어내지 말고 이 로고를 그대로 재현해서 "
        "작은 브랜드 영역에 배치하세요)"
        if logo_note
        else ""
    )

    if template_id == "tpl-cardnews-minimal":
        # "클린 & 에디토리얼"만 예외로, 전용 4페이지 캠페인 프롬프트(CLEAN_EDITORIAL_CARD_NEWS_PROMPT)를 쓴다.
        clean_values = {
            "company_logo": logo_render_note,
            "company_slogan": tagline,
            "product_name": product_name,
            "product_description": description,
            "product_category": "",
            "regular_price": "",
            "promotion_price": price,
            "product_images": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
            "target_language": target_language_name,
        }
        slot_prompts = [
            ("card-1", _clean_editorial_card_prompt("PAGE_01_PRODUCT_HERO", clean_values, style_hint)),
            ("card-2", _clean_editorial_card_prompt("PAGE_02_PRODUCT_EXPERIENCE", clean_values, style_hint)),
            ("card-3", _clean_editorial_card_prompt("PAGE_03_PRODUCT_DETAIL", clean_values, style_hint)),
            ("card-4", _clean_editorial_card_prompt("PAGE_04_BRAND_CLOSING", clean_values, style_hint)),
        ]
        slot_prompts = [(slot, _with_notes(prompt, model_note)) for slot, prompt in slot_prompts]
        images = _generate_slots_parallel(user_id, gen_id, slot_prompts, reference_images, "1:1")
        return {"images": images, "copy": {"features": features, "promoLine": promo_line}}

    values = {
        "brand_name": brand_name,
        "product_name": product_name,
        "product_name_en": "",
        "category": "",
        "headline": tagline,
        "short_description": description,
        "benefit_1": benefit_slots[0],
        "benefit_desc_1": "",
        "benefit_2": benefit_slots[1],
        "benefit_desc_2": "",
        "benefit_3": benefit_slots[2],
        "benefit_desc_3": "",
        "usage_step_1": "",
        "usage_step_2": "",
        "usage_step_3": "",
        "recommended_for": "",
        "original_price": "",
        "sale_price": price,
        "discount_rate": "",
        "currency": "",
        "promotion_text": promo_line,
        "cta": "",
        "target_language": target_language_name,
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "detail_image": "",
        "brand_logo": logo_render_note,
    }

    # 사용자가 "꼭 들어갔으면 하는 사진"에 사람이 등장하는 장면을 적어도(예: "사람이 사용하는 모습"),
    # "AI 모델 적용" 토글이 꺼져 있으면 사람 없이 표현해야 한다 — 안 그러면 이 문구가 "우선한다"고
    # 강조돼 있어서 뒤에 붙는 AI_MODEL_OFF_NOTE보다 이 지시를 따라 사람을 그려 넣을 수 있다.
    use_ai_model = model_note == AI_MODEL_ON_NOTE
    must_have_note = ""
    if must_have_photo.strip():
        must_have_note = (
            f"MUST-HAVE SCENE (from the user, take priority over the generic usage-context fallback above): "
            f"{must_have_photo.strip()}"
        )
        if not use_ai_model:
            must_have_note += (
                " (단, 이 장면에 사람이 등장한다는 내용이어도 AI 모델 연출이 꺼져 있으므로 사람 없이 "
                "상품/손·소품만으로 그 상황을 표현하세요.)"
            )
    slot_prompts = [
        ("card-1", _shopee_card_prompt("CARD_01_HERO_PRICE", values, style_hint)),
        ("card-2", _shopee_card_prompt("CARD_02_BENEFITS", values, style_hint)),
        ("card-3", _shopee_card_prompt("CARD_03_USAGE", values, style_hint, must_have_note)),
        ("card-4", _shopee_card_prompt("CARD_04_PROMOTION", values, style_hint)),
    ]

    slot_prompts = [(slot, _with_notes(prompt, model_note)) for slot, prompt in slot_prompts]
    images = _generate_slots_parallel(user_id, gen_id, slot_prompts, reference_images, "1:1")

    return {"images": images, "copy": {"features": features, "promoLine": promo_line}}


def _generate_detail(
    user_id, gen_id, reference_images, product_name, description, style_hint="", logo_note="", model_note="",
    template_id="",
):
    captions_result = _generate_copy_json(_detail_captions_prompt(product_name, description), DETAIL_CAPTIONS_SCHEMA)
    captions = (captions_result.get("captions") or [])[:3]
    while len(captions) < 3:
        captions.append({"eyebrow": "", "heading": "", "description": ""})

    # 이 템플릿에 참고 디자인 이미지가 등록돼 있으면(TEMPLATE_STYLE_REFERENCE_IMAGES) 상품 사진/로고
    # 뒤에 맨 마지막으로 덧붙여서, style_hint 텍스트만으로는 전달하기 어려운 실제 톤·구도를 예시로 보여준다.
    style_ref = TEMPLATE_STYLE_REFERENCE_IMAGES.get(template_id)
    gen_reference_images = [*reference_images, style_ref] if style_ref else reference_images
    style_ref_note = STYLE_REFERENCE_NOTE if style_ref else ""

    angle_slots = [
        ("angle-front", "정면에서 본 모습"),
        ("angle-back", "후면에서 본 모습"),
        ("angle-top", "위에서 내려다본 모습"),
    ]
    slot_prompts = [
        ("hero", _with_notes(_detail_hero_prompt(description, style_hint), logo_note, model_note, style_ref_note), "16:9"),
        *[
            (f"feature-{i}", _with_notes(_detail_feature_prompt(caption, style_hint), logo_note, model_note, style_ref_note))
            for i, caption in enumerate(captions, start=1)
        ],
        *[
            (slot, _with_notes(_detail_angle_prompt(label, style_hint), logo_note, model_note, style_ref_note))
            for slot, label in angle_slots
        ],
    ]
    # 히어로(16:9) + 특징 3장 + 각도 3장, 총 7장을 순서대로 기다리지 않고 한 번에 병렬 요청한다
    # (앞서 정의한 _generate_slots_parallel 참고) — 이게 "상세페이지 생성이 유독 오래 걸린다"는
    # 체감의 가장 큰 원인이었다.
    images = _generate_slots_parallel(user_id, gen_id, slot_prompts, gen_reference_images, "1:1")

    return {"images": images, "copy": {"captions": captions}}


MARKETING_IMAGES_RECENT_LIMIT = 9


@app.get("/marketing/images")
def list_marketing_images(authorization: str | None = Header(None)):
    """이 사용자가 만든 마케팅 이미지 중 최근 9장 + 북마크된 것들만 서명 URL을 만들어 돌려준다.
    사용자가 이미지를 계속 만들수록 GCS 오브젝트가 무한정 쌓이는데, 예전엔 전부 매번 서명 URL을
    새로 만들어서(건당 GCS API 호출 1번) 목록을 새로고침할 때마다 부담이 계속 커졌다 — 최근
    9장으로 캡을 걸고, 그 밖에서 보고 싶은 건 북마크로 남기게 바꿨다. 북마크 여부는 별도 DB
    테이블 없이 GCS 오브젝트의 커스텀 메타데이터(bookmarked=true)로 저장한다 - 업로드 경로 자체가
    marketing-images/{user_id}/{gen_id}/{slot}.ext 구조라 목록 자체도 이미 DB 없이 GCS만으로
    재구성하고 있어서 같은 방식을 그대로 따른다."""
    user_id = require_user(authorization)
    prefix = f"marketing-images/{user_id}/"
    bucket = _gcs_client.bucket(GENERATED_BUCKET)

    all_images = []
    for blob in _gcs_client.list_blobs(bucket, prefix=prefix):
        rel = blob.name[len(prefix):]
        parts = rel.split("/")
        if len(parts) != 2:
            continue
        gen_id, filename = parts
        slot = filename.rsplit(".", 1)[0]
        all_images.append({
            "gen_id": gen_id,
            "slot": slot,
            "path": blob.name,
            "created_at": blob.time_created,
            "bookmarked": bool((blob.metadata or {}).get("bookmarked")),
        })

    all_images.sort(key=lambda i: i["created_at"] or datetime.min, reverse=True)

    recent = all_images[:MARKETING_IMAGES_RECENT_LIMIT]
    bookmarked_extra = [i for i in all_images[MARKETING_IMAGES_RECENT_LIMIT:] if i["bookmarked"]]
    included = recent + bookmarked_extra

    for img in included:
        img["created_at"] = img["created_at"].isoformat() if img["created_at"] else None
        signed = gcs.from_(GENERATED_BUCKET).create_signed_url(img["path"], 3600)
        img["url"] = signed.get("signedURL")

    return {"images": included}


class SetMarketingImageBookmarkRequest(BaseModel):
    path: str
    bookmarked: bool


@app.post("/marketing/images/bookmark")
def set_marketing_image_bookmark(req: SetMarketingImageBookmarkRequest, authorization: str | None = Header(None)):
    """마케팅 이미지 하나를 북마크하거나 해제한다. /marketing/images와 동일하게 별도 DB 테이블
    없이 GCS 오브젝트 커스텀 메타데이터로 상태를 저장한다."""
    user_id = require_user(authorization)
    prefix = f"marketing-images/{user_id}/"
    if not req.path.startswith(prefix):
        raise HTTPException(status_code=403, detail="본인이 만든 이미지만 북마크할 수 있습니다.")

    bucket = _gcs_client.bucket(GENERATED_BUCKET)
    blob = bucket.blob(req.path)
    blob.reload()
    meta = dict(blob.metadata or {})
    if req.bookmarked:
        meta["bookmarked"] = "true"
    else:
        meta.pop("bookmarked", None)
    blob.metadata = meta
    blob.patch()
    return {"bookmarked": req.bookmarked}


@app.post("/marketing/generate")
def generate_marketing_images(
    layout: str = Form(...),
    product_name: str = Form(...),
    tagline: str = Form(""),
    description: str = Form(""),
    must_have_photo: str = Form(""),
    price: str = Form(""),
    style_hint: str = Form(""),
    template_id: str = Form(""),
    target_language: str = Form("ko"),
    aspect_ratio: str = Form(DEFAULT_POSTER_ASPECT_RATIO),
    use_ai_model: bool = Form(False),
    product_images: list[UploadFile] = File(...),
    logo: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    """상품 정보 + 상품 사진(여러 장 가능) + 기업 로고(선택)를 바탕으로 AI 마케팅 이미지를 생성한다
    (포스터 1장 / 카드뉴스 4장 / 상세설명 7장). layout이 "poster"(tpl-poster-luxury 제외)나 "detail"이면
    이미지에는 문구를 렌더링하지 않고 실제 문구는 프론트엔드가 오버레이한다. 반면 layout이
    "card-news"이거나 template_id가 "tpl-poster-luxury"이면 Gemini가 문구(태그라인·헤드라인·가격·
    CTA 등)를 이미지 픽셀에 직접 렌더링한다 — target_language로 실제 렌더링 언어를 명시해야 한글이
    섞여 들어가지 않는다(특히 카드뉴스는 benefit/promo 문구를 서버에서 새로 만들어 굽기 때문에 이 값이
    없으면 항상 한국어로 나온다). 로고는 계정 프로필의 회사명이 아니라 Step 1에서 실제로 업로드한
    로고 이미지만 쓴다 — 있으면 그대로 재현하고 없으면 브랜드 영역을 비워둔다(LOGO_REFERENCE_NOTE,
    CARD_NEWS_SHOPEE_PROMPT, CLEAN_EDITORIAL_CARD_NEWS_PROMPT 참고. LUXURY_PREMIUM_POSTER_PROMPT만
    예외로 계정 프로필의 회사명 텍스트(brand_name)를 그대로 쓴다). style_hint는 프롬프트에 얹는 스타일
    톤이고, template_id가 "tpl-poster-luxury"면 전용 데이터 기반 광고 프롬프트(LUXURY_PREMIUM_POSTER_PROMPT)를,
    "tpl-cardnews-minimal"이면 전용 4페이지 캠페인 프롬프트(CLEAN_EDITORIAL_CARD_NEWS_PROMPT)를 대신 쓴다."""
    user_id = require_user(authorization)

    if layout not in {"poster", "card-news", "detail"}:
        raise HTTPException(status_code=400, detail="layout 값이 올바르지 않습니다.")
    if not product_images:
        raise HTTPException(status_code=400, detail="상품 사진을 업로드해주세요.")
    for img in product_images:
        if (img.content_type or "") not in ALLOWED_PRODUCT_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
    if logo is not None and (logo.content_type or "") not in ALLOWED_PRODUCT_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="로고는 JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
    if not product_name.strip():
        raise HTTPException(status_code=400, detail="상품명을 입력해주세요.")

    reference_images = [(img.file.read(), img.content_type) for img in product_images]
    logo_note = ""
    if logo is not None:
        reference_images.append((logo.file.read(), logo.content_type))
        logo_note = LOGO_REFERENCE_NOTE
    model_note = AI_MODEL_ON_NOTE if use_ai_model else AI_MODEL_OFF_NOTE
    gen_id = uuid.uuid4().hex

    try:
        # 브랜드 이름(brand_name)은 계정 프로필의 회사명인데, 이건 카드뉴스가 실제로 마케팅하려는
        # 그 상품의 브랜드와 무관할 수 있다(예: 데모/테스트 계정 이름) — 그래서 카드뉴스는 이 값을
        # 전혀 쓰지 않고, Step 1에서 실제로 올린 로고 이미지만 브랜드 표시에 쓴다. tpl-poster-luxury만
        # 예외로 이 프로필 회사명을 그대로 쓴다(전용 프롬프트가 로고가 아니라 회사명 텍스트를 쓰도록
        # 설계되어 있음).
        brand_name = ""
        if layout == "poster" and template_id == "tpl-poster-luxury":
            profile = (
                db.table("users").select("company").eq("id", user_id).maybe_single().execute().data
            ) or {}
            brand_name = profile.get("company") or ""

        if layout == "poster":
            result = _generate_poster(
                user_id, gen_id, reference_images, product_name, description, must_have_photo,
                style_hint, template_id, tagline, price, brand_name, logo_note, aspect_ratio, model_note,
                target_language,
            )
        elif layout == "card-news":
            result = _generate_card_news(
                user_id, gen_id, reference_images, product_name, description, must_have_photo,
                style_hint, logo_note, tagline, price, brand_name, target_language, template_id, model_note,
            )
        else:
            result = _generate_detail(
                user_id, gen_id, reference_images, product_name, description, style_hint, logo_note, model_note,
                template_id,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"이미지 생성에 실패했습니다: {friendly_ai_error(e)}")

    return {"layout": layout, "template_id": template_id, **result}


# 슬롯별로 생성 시 사용한 종횡비 — 수정(edit) 시에도 같은 비율을 유지해야 레이아웃이 깨지지 않는다.
SLOT_ASPECT_RATIO = {
    "poster": "9:16",
    "card-1": "1:1",
    "card-2": "1:1",
    "card-3": "1:1",
    "card-4": "1:1",
    "hero": "16:9",
    "feature-1": "1:1",
    "feature-2": "1:1",
    "feature-3": "1:1",
    "angle-front": "1:1",
    "angle-back": "1:1",
    "angle-top": "1:1",
}


def _edit_image_prompt(user_prompt: str) -> str:
    return f"""첨부된 이미지를 다음 지시에 따라 자연스럽게 수정해주세요: {user_prompt.strip()}
상품의 형태·색상·재질 등 핵심 정체성과 전체 구도는 최대한 유지한 채로 지시된 부분만 수정하세요.
{NO_TEXT_INSTRUCTION}"""


class MarketingEditImageRef(BaseModel):
    slot: str
    path: str


class MarketingEditRequest(BaseModel):
    layout: str
    prompt: str
    images: list[MarketingEditImageRef]


@app.post("/marketing/edit")
def edit_marketing_images(payload: MarketingEditRequest, authorization: str | None = Header(None)):
    """이미 생성된 마케팅 이미지들을, 사용자가 직접 쓴 프롬프트에 따라 전부 다시 수정한다.
    새 상품 사진을 참고하는 대신 '현재 생성된 이미지'를 참고 이미지로 넘겨서 그 위에 수정을 가한다."""
    user_id = require_user(authorization)

    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="수정할 내용을 입력해주세요.")
    if not payload.images:
        raise HTTPException(status_code=400, detail="수정할 이미지가 없습니다.")

    gen_id = uuid.uuid4().hex
    edit_prompt = _edit_image_prompt(payload.prompt)

    try:
        edited_images = []
        for img in payload.images:
            existing_bytes = gcs.from_(GENERATED_BUCKET).download(img.path)
            existing_mime = "image/png" if img.path.lower().endswith(".png") else "image/jpeg"
            aspect_ratio = SLOT_ASPECT_RATIO.get(img.slot, "1:1")
            image_bytes, mime = _generate_image(edit_prompt, [(existing_bytes, existing_mime)], aspect_ratio)
            edited_images.append(_upload_generated_image(user_id, gen_id, img.slot, image_bytes, mime))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"이미지 수정에 실패했습니다: {friendly_ai_error(e)}")

    return {"layout": payload.layout, "images": edited_images}
