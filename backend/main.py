import io
import json
import os
import re
import subprocess
import tempfile
import uuid
import xml.etree.ElementTree as ET
from urllib.parse import quote
from datetime import datetime, timezone
from pathlib import Path

import httpx
from docx import Document
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from google import genai
from google.genai import types
from pydantic import BaseModel
from supabase import Client, create_client

from fill_docx import apply_blank_field, detect_blank_candidates, extract_docx_fields, fill_document

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
DATA_GO_KR_TRADE_SERVICE_KEY = os.environ["DATA_GO_KR_TRADE_SERVICE_KEY"]
# 시장 분석은 서류 자동완성/챗봇과 별도의 Gemini 프로젝트(무료 티어 할당량 분리)를 쓸 수 있도록
# 전용 키가 있으면 그것을, 없으면 기존 GEMINI_API_KEY를 그대로 사용한다.
MARKET_ANALYSIS_GEMINI_API_KEY = os.environ.get("MARKET_ANALYSIS_GEMINI_API_KEY") or GEMINI_API_KEY

TEMPLATES_BUCKET = "templates"
GENERATED_BUCKET = "generated"
AI_FIELD_TYPES = {"long_text", "checkbox"}
VALID_FIELD_TYPES = {"text", "number", "date", "select", "checkbox", "textarea", "long_text"}

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
market_gemini_client = genai.Client(api_key=MARKET_ANALYSIS_GEMINI_API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


CHATBOT_SYSTEM_PROMPT = """당신은 전북 지역 소상공인의 해외 수출을 돕는 JB-XPORT 서비스의 AI 챗봇입니다.
수출 서류, 정부 지원사업, 관세·통관, 해외 시장 진출 관련 질문에 친절하고 간결하게 한국어로 답변하세요.
확실하지 않은 법률·세무 정보는 단정짓지 말고 전문가 상담을 권하세요."""


@app.post("/chat")
def chat(req: ChatRequest):
    history_text = "\n".join(
        f"{'사용자' if h.role == 'user' else 'AI'}: {h.message}" for h in req.history[-6:]
    )
    prompt = f"{CHATBOT_SYSTEM_PROMPT}\n\n{history_text}\n사용자: {req.message}\nAI:"

    response = gemini_client.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
    )
    return {"answer": (response.text or "").strip()}


# --- 시장 분석: 관세청 품목별 국가별 수출입실적(GW) 연동 + Gemini 코멘터리 ---

TRADE_API_URL = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

MARKET_CATEGORIES = {
    "cosmetics": {"label": "화장품", "hsCode": "3304.99", "hsSgn": "330499"},
    "food": {"label": "식품", "hsCode": "2106.90", "hsSgn": "210690"},
    "electronics": {"label": "전자기기", "hsCode": "8517.62", "hsSgn": "851762"},
    "fashion": {"label": "패션잡화", "hsCode": "4202.92", "hsSgn": "420292"},
    "household": {"label": "생활용품", "hsCode": "3924.90", "hsSgn": "392490"},
}

MARKET_COUNTRIES = {
    "베트남": "VN",
    "태국": "TH",
    "인도네시아": "ID",
    "필리핀": "PH",
    "말레이시아": "MY",
    "싱가포르": "SG",
}

MARKET_QUARTERS = {
    "q1": {"label": "1분기 (1~3월)", "months": [1, 2, 3]},
    "q2": {"label": "2분기 (4~6월)", "months": [4, 5, 6]},
    "q3": {"label": "3분기 (7~9월)", "months": [7, 8, 9]},
    "q4": {"label": "4분기 (10~12월)", "months": [10, 11, 12]},
}

MONTH_LABELS = [f"{m}월" for m in range(1, 13)]


class MarketAnalysisRequest(BaseModel):
    query: str
    category_id: str
    country_ids: list[str]
    quarter_ids: list[str]


def fetch_trade_stats(hs_sgn: str, cnty_cd: str, strt_yymm: str, end_yymm: str) -> list[dict]:
    """관세청_품목별 국가별 수출입실적(GW) API를 호출해 월별 {month, exp_dlr} 목록을 반환한다.
    API 실패/무응답 시에는 예외를 던지지 않고 빈 목록을 반환한다 (다른 국가 조회는 계속 진행되어야 하므로)."""
    url = (
        f"{TRADE_API_URL}?serviceKey={DATA_GO_KR_TRADE_SERVICE_KEY}"
        f"&strtYymm={strt_yymm}&endYymm={end_yymm}&hsSgn={hs_sgn}&cntyCd={cnty_cd}"
    )
    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
    except (httpx.HTTPError, ET.ParseError):
        return []

    result_code = root.findtext(".//resultCode")
    if result_code not in (None, "00", "0"):
        return []

    rows = []
    for item in root.iter("item"):
        year_month = (item.findtext("year") or "").strip()  # 예: "2025.09"
        try:
            month = int(year_month.split(".")[1])
            exp_dlr = int(item.findtext("expDlr") or "0")
        except (IndexError, ValueError):
            continue
        rows.append({"month": month, "exp_dlr": exp_dlr})
    return rows


def _shift_yymm(year: int, month: int, delta_months: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta_months
    return idx // 12, idx % 12 + 1


def trailing_12_month_range() -> tuple[str, str]:
    """관세청 통계는 약 15일 지연으로 확정되므로, 최신 확정 월부터 과거 12개월을 조회 범위로 잡는다."""
    now = datetime.now(timezone.utc)
    end_year, end_month = _shift_yymm(now.year, now.month, -2)
    start_year, start_month = _shift_yymm(end_year, end_month, -11)
    return f"{start_year:04d}{start_month:02d}", f"{end_year:04d}{end_month:02d}"


def build_hs_code_prompt(query, category_label, default_hs_sgn):
    return f"""당신은 한국 관세청 수출입무역통계에서 쓰이는 HS 품목분류 전문가입니다.
아래 상품을 관세청 수출입무역통계(HS 6단위 기준)로 조회하려고 합니다. 이 상품에 가장 적합한 HS 6자리 코드를 알려주세요.

검색 상품명: {query}
참고 카테고리: {category_label}
참고 카테고리의 기본 HS 6자리 코드: {default_hs_sgn}

규칙:
- hsSgn은 반드시 숫자 6자리 문자열이어야 합니다 (점 없이, 예: "210390").
- 상품명이 너무 모호하거나 적합한 HS코드를 확신할 수 없으면 참고 카테고리의 기본 코드를 그대로 반환하세요.
"""


def infer_hs_code(query, category_label, default_hs_sgn, default_hs_code):
    """검색어에 맞는 HS 6자리 코드를 Gemini로 추론한다. 실패/이상값이면 카테고리 기본 코드로 폴백한다."""
    try:
        response = market_gemini_client.models.generate_content(
            model="gemini-flash-latest",
            contents=build_hs_code_prompt(query, category_label, default_hs_sgn),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {"hsSgn": {"type": "STRING"}},
                    "required": ["hsSgn"],
                },
            ),
        )
        hs_sgn = "".join(ch for ch in json.loads(response.text).get("hsSgn", "") if ch.isdigit())
        if len(hs_sgn) == 6:
            return hs_sgn, f"{hs_sgn[:4]}.{hs_sgn[4:6]}"
    except Exception:
        pass
    return default_hs_sgn, default_hs_code


def build_market_analysis_prompt(query, category_label, hs_code, country_label, quarter_label, chart_data, has_data):
    monthly_lines = "\n".join(f"- {d['month']}: {d['value']:,} 달러" for d in chart_data)
    data_note = (
        ""
        if has_data
        else "\n(주의: 해당 조건의 관세청 수출 실적 데이터가 조회되지 않았습니다. "
        "데이터가 부족하다는 점을 감안해 단정적인 수치 언급 없이 일반적인 시장 정보 위주로 신중하게 서술하세요.)"
    )
    return f"""당신은 전북 소상공인의 해외 수출을 돕는 시장 분석 AI입니다.
아래는 관세청 수출입무역통계에서 조회한 최근 12개월 실제 수출금액(달러) 데이터입니다.

검색 상품: {query}
품목 카테고리: {category_label} (HS코드 {hs_code} 기준으로 조회함)
대상 국가: {country_label}
분석 분기: {quarter_label}

[월별 수출금액]
{monthly_lines}
{data_note}

위 실제 데이터를 근거로 아래를 작성하세요:
1. headline: "{query}"과(와) {country_label}, {quarter_label} 시장 상황을 한 문장으로 요약 (실제 수치 흐름을 반영)
2. body: 월별 수출 데이터 흐름을 근거로 한 2~3문장의 분석
3. keyMarketDrivers: 이 시장 진출에 참고할 핵심 동인 3가지. 각각 icon(growth/checkCircle/truck/globe/sparkle/analysis 중 선택), title(10자 내외), description(1~2문장)

모두 한국어로, 실제 데이터에 근거해 과장 없이 작성하세요.
"""


def call_gemini_market_analysis(query, category_label, hs_code, country_label, quarter_label, chart_data, has_data):
    prompt = build_market_analysis_prompt(query, category_label, hs_code, country_label, quarter_label, chart_data, has_data)

    response = market_gemini_client.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "headline": {"type": "STRING"},
                    "body": {"type": "STRING"},
                    "keyMarketDrivers": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "icon": {
                                    "type": "STRING",
                                    "enum": ["growth", "checkCircle", "truck", "globe", "sparkle", "analysis"],
                                },
                                "title": {"type": "STRING"},
                                "description": {"type": "STRING"},
                            },
                            "required": ["icon", "title", "description"],
                        },
                    },
                },
                "required": ["headline", "body", "keyMarketDrivers"],
            },
        ),
    )
    return json.loads(response.text)


@app.post("/market-analysis")
def market_analysis(req: MarketAnalysisRequest):
    query = (req.query or "").strip() or "이 상품"
    category_id = req.category_id if req.category_id in MARKET_CATEGORIES else "cosmetics"
    category = MARKET_CATEGORIES[category_id]

    is_all_countries = not req.country_ids or "all" in req.country_ids
    country_labels = (
        list(MARKET_COUNTRIES.keys())
        if is_all_countries
        else [c for c in req.country_ids if c in MARKET_COUNTRIES] or list(MARKET_COUNTRIES.keys())
    )
    country_label = "동남아시아 전역" if is_all_countries else "·".join(country_labels)

    selected_quarter_ids = [q for q in req.quarter_ids if q in MARKET_QUARTERS] or ["q1"]
    selected_quarters = [{"id": q, **MARKET_QUARTERS[q]} for q in selected_quarter_ids]
    is_all_quarters = len(selected_quarters) == len(MARKET_QUARTERS)
    quarter_label = (
        "전체(연중)" if is_all_quarters else ", ".join(q["label"].split(" ")[0] for q in selected_quarters)
    )
    highlighted_months = {m for q in selected_quarters for m in q["months"]}

    hs_sgn, hs_code = infer_hs_code(query, category["label"], category["hsSgn"], category["hsCode"])

    strt_yymm, end_yymm = trailing_12_month_range()

    month_totals = {m: 0 for m in range(1, 13)}
    has_data = False
    for label in country_labels:
        for row in fetch_trade_stats(hs_sgn, MARKET_COUNTRIES[label], strt_yymm, end_yymm):
            month_totals[row["month"]] += row["exp_dlr"]
            has_data = True

    chart_data = [
        {"month": MONTH_LABELS[m - 1], "value": month_totals[m], "highlighted": m in highlighted_months}
        for m in range(1, 13)
    ]

    try:
        narrative = call_gemini_market_analysis(query, category["label"], hs_code, country_label, quarter_label, chart_data, has_data)
    except Exception:
        narrative = {
            "headline": f'"{query}"의 {country_label} {quarter_label} 수출 동향',
            "body": "AI 코멘터리 생성 중 오류가 발생했습니다. 아래 월별 수출 데이터를 참고해주세요.",
            "keyMarketDrivers": [
                {
                    "icon": "analysis",
                    "title": "수출 데이터 직접 확인",
                    "description": "AI 코멘터리 생성에 실패했습니다. 아래 월별 수출 그래프를 참고해 직접 흐름을 확인해보세요.",
                },
                {
                    "icon": "globe",
                    "title": "현지 시장 조사 권장",
                    "description": f"{country_label} 현지 소비 트렌드·인증 요건은 KOTRA 등 별도 채널에서 추가로 확인해보세요.",
                },
                {
                    "icon": "checkCircle",
                    "title": "잠시 후 다시 시도",
                    "description": "AI 분석 서버가 일시적으로 응답하지 않았습니다. 잠시 후 다시 검색하면 정상적으로 표시됩니다.",
                },
            ],
        }

    return {
        "query": query,
        "category": {"id": category_id, "label": category["label"], "hsCode": category["hsCode"]},
        "productHsCode": hs_code,
        "countries": country_labels,
        "countryLabel": country_label,
        "quarters": selected_quarters,
        "quarterLabel": quarter_label,
        "headline": narrative.get("headline", ""),
        "body": narrative.get("body", ""),
        "chart": {
            "title": "월별 수출 규모 추이",
            "subtitle": f"{country_label} · 관세청 수출입무역통계 기준",
            "data": chart_data,
        },
        "keyMarketDrivers": narrative.get("keyMarketDrivers", []),
        "hasTradeData": has_data,
    }


@app.delete("/account")
def delete_account(authorization: str | None = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")

    token = authorization.split(" ", 1)[1]
    try:
        user_res = supabase.auth.get_user(token)
    except Exception:
        # 세션 만료/무효화 시 supabase-auth가 예외를 던진다 (정상적인 "토큰 없음" 응답이 아니라).
        raise HTTPException(status_code=401, detail="로그인 세션이 만료되었습니다. 다시 로그인해주세요.")
    if not user_res or not user_res.user:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    # profiles 행은 auth.users FK에 on delete cascade 로 걸려 있어 함께 삭제된다.
    supabase.auth.admin.delete_user(user_res.user.id)
    return {"deleted": True}


def require_user(authorization: str | None) -> str:
    """bearer 토큰을 검증하고 로그인한 사용자의 user_id를 반환한다 (관리자 권한은 요구하지 않는다)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")

    token = authorization.split(" ", 1)[1]
    try:
        user_res = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="로그인 세션이 만료되었습니다. 다시 로그인해주세요.")
    if not user_res or not user_res.user:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    return user_res.user.id


ADDITIONAL_DOC_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".hwp", ".jpg", ".jpeg", ".png"}


@app.get("/account/documents")
def list_additional_documents(authorization: str | None = Header(None)):
    """마이페이지에서 사용자가 업로드한 추가 기본 서류 목록을 조회한다."""
    user_id = require_user(authorization)
    folder = f"additional-docs/{user_id}"
    objects = supabase.storage.from_(TEMPLATES_BUCKET).list(folder)

    documents = []
    for obj in objects or []:
        # 폴더 자체를 나타내는 placeholder 항목은 제외한다.
        if not obj.get("id"):
            continue
        path = f"{folder}/{obj['name']}"
        signed = supabase.storage.from_(TEMPLATES_BUCKET).create_signed_url(path, 3600)
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
def upload_additional_document(file: UploadFile = File(...), authorization: str | None = Header(None)):
    """마이페이지에서 사용자가 추가 기본 서류를 업로드한다."""
    user_id = require_user(authorization)

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ADDITIONAL_DOC_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF, DOCX, HWP, JPG, PNG 파일만 업로드할 수 있습니다.")

    file_bytes = file.file.read()
    object_path = f"additional-docs/{user_id}/{uuid.uuid4().hex}_{file.filename}"
    try:
        supabase.storage.from_(TEMPLATES_BUCKET).upload(
            object_path, file_bytes, {"content-type": file.content_type or "application/octet-stream"}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    return {"path": object_path, "name": file.filename}


@app.delete("/account/documents")
def delete_additional_document(path: str, authorization: str | None = Header(None)):
    """마이페이지에서 업로드했던 추가 기본 서류를 삭제한다."""
    user_id = require_user(authorization)
    if not path.startswith(f"additional-docs/{user_id}/"):
        raise HTTPException(status_code=403, detail="본인이 업로드한 서류만 삭제할 수 있습니다.")

    supabase.storage.from_(TEMPLATES_BUCKET).remove([path])
    return {"deleted": True}


def require_admin(authorization: str | None) -> str:
    """bearer 토큰을 검증하고 profiles.account_type == 'admin'인지 확인한다.
    성공 시 user_id를 반환하고, 실패 시 HTTPException을 던진다."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")

    token = authorization.split(" ", 1)[1]
    try:
        user_res = supabase.auth.get_user(token)
    except Exception:
        # 세션 만료/무효화 시 supabase-auth가 예외를 던진다 (정상적인 "토큰 없음" 응답이 아니라).
        raise HTTPException(status_code=401, detail="로그인 세션이 만료되었습니다. 다시 로그인해주세요.")
    if not user_res or not user_res.user:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    user_id = user_res.user.id
    profile = (
        supabase.table("profiles").select("account_type").eq("id", user_id).maybe_single().execute().data
    )
    if not profile or profile.get("account_type") != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")

    return user_id


class CreateBusinessRequest(BaseModel):
    name: str
    description: str | None = None


@app.post("/admin/businesses")
def create_business(req: CreateBusinessRequest, authorization: str | None = Header(None)):
    require_admin(authorization)

    if not req.name.strip():
        raise HTTPException(status_code=400, detail="사업명을 입력해주세요.")

    row = (
        supabase.table("businesses")
        .insert({"name": req.name.strip(), "description": req.description})
        .execute()
        .data[0]
    )
    return row


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
        supabase.table("businesses").select("id").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    row = (
        supabase.table("businesses")
        .update({"name": req.name.strip()})
        .eq("id", business_id)
        .execute()
        .data[0]
    )
    return row


REFERENCE_DOC_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".hwp", ".jpg", ".jpeg", ".png"}


def build_basic_info_prompt(business_name):
    return f"""당신은 정부 지원사업 공고문(원본 서류)을 읽고, 신청자에게 보여줄 핵심 정보를 요약하는 어시스턴트입니다.
사업명: {business_name}

첨부된 문서를 읽고 아래 항목을 채워주세요:
- org: 주관기관 (예: 전북테크노파크)
- period: 접수기간 (예: 2026.08.01 ~ 2026.08.31)
- target: 지원대상
- support: 지원내용 (1~2문장 요약)
- contact: 문의처 (담당부서·전화번호 등)

문서에서 확인할 수 없는 항목은 빈 문자열("")로 두고, 추측해서 지어내지 마세요.
"""


def call_gemini_basic_info(business_name, file_bytes, mime_type):
    response = gemini_client.models.generate_content(
        model="gemini-flash-latest",
        contents=[
            types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            build_basic_info_prompt(business_name),
        ],
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
        supabase.table("businesses").select("*").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in REFERENCE_DOC_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF, DOCX, HWP, JPG, PNG 파일만 업로드할 수 있습니다.")

    file_bytes = file.file.read()
    object_path = f"reference/{business_id}/{uuid.uuid4().hex}{ext}"

    try:
        supabase.storage.from_(TEMPLATES_BUCKET).upload(object_path, file_bytes, {"upsert": "false"})
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
                supabase.table("businesses").update({"reference_file_path": object_path}).eq(
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
        basic_info = call_gemini_basic_info(business["name"], gemini_bytes, gemini_mime)
    except Exception as e:
        supabase.table("businesses").update({"reference_file_path": object_path}).eq("id", business_id).execute()
        raise HTTPException(status_code=502, detail=f"파일은 업로드됐지만 AI 정보 추출에 실패했습니다: {e}")

    row = (
        supabase.table("businesses")
        .update({"reference_file_path": object_path, "basic_info": basic_info})
        .eq("id", business_id)
        .execute()
        .data[0]
    )
    return row


@app.post("/admin/templates")
def create_template(
    business_id: str = Form(...),
    name: str = Form(...),
    form_number: str | None = Form(None),
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    require_admin(authorization)

    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="docx 파일만 업로드할 수 있습니다.")

    business = (
        supabase.table("businesses").select("id").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    file_bytes = file.file.read()
    # Supabase Storage 오브젝트 키는 비-ASCII(한글 등)를 허용하지 않아 InvalidKey로 거부한다.
    # 원본 파일명은 storage 경로에 쓰지 않고 templates.name(서식명)에만 사람이 읽을 형태로 남긴다.
    object_path = f"{business_id}/{uuid.uuid4().hex}.docx"

    try:
        supabase.storage.from_(TEMPLATES_BUCKET).upload(
            object_path,
            file_bytes,
            {
                "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "upsert": "false",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    row = (
        supabase.table("templates")
        .insert({
            "business_id": business_id,
            "name": name,
            "form_number": form_number,
            "original_file_path": object_path,
        })
        .execute()
        .data[0]
    )
    return row


@app.patch("/admin/templates/{template_id}")
def update_template(
    template_id: str,
    name: str = Form(...),
    form_number: str | None = Form(None),
    file: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    require_admin(authorization)

    template = (
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    if file is not None and file.filename:
        if not file.filename.lower().endswith(".docx"):
            raise HTTPException(status_code=400, detail="docx 파일만 업로드할 수 있습니다.")
        file_bytes = file.file.read()
        try:
            supabase.storage.from_(TEMPLATES_BUCKET).update(
                template["original_file_path"],
                file_bytes,
                {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    row = (
        supabase.table("templates")
        .update({"name": name, "form_number": form_number})
        .eq("id", template_id)
        .execute()
        .data[0]
    )
    return row


@app.delete("/admin/templates/{template_id}")
def delete_template(template_id: str, authorization: str | None = Header(None)):
    require_admin(authorization)

    template = (
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    submissions = (
        supabase.table("submissions").select("id").eq("template_id", template_id).execute().data or []
    )
    submission_ids = [s["id"] for s in submissions]

    if submission_ids:
        generated_docs = (
            supabase.table("generated_documents")
            .select("file_path")
            .in_("submission_id", submission_ids)
            .execute()
            .data
            or []
        )
        gen_paths = [g["file_path"] for g in generated_docs if g.get("file_path")]
        supabase.table("generated_documents").delete().in_("submission_id", submission_ids).execute()
        if gen_paths:
            try:
                supabase.storage.from_(GENERATED_BUCKET).remove(gen_paths)
            except Exception:
                pass

        supabase.table("submission_values").delete().in_("submission_id", submission_ids).execute()
        supabase.table("submissions").delete().eq("template_id", template_id).execute()

    supabase.table("template_fields").delete().eq("template_id", template_id).execute()
    supabase.table("templates").delete().eq("id", template_id).execute()
    try:
        supabase.storage.from_(TEMPLATES_BUCKET).remove([template["original_file_path"]])
    except Exception:
        pass  # storage 파일 삭제 실패는 무시 — DB 정리가 우선이다.

    return {"deleted": True}


@app.delete("/admin/businesses/{business_id}")
def delete_business(business_id: str, authorization: str | None = Header(None)):
    """지원사업(공고) 자체를 삭제한다. 서식 파일만 지우는 게 아니라, 연결된 서식/제출
    내역/생성된 문서/스토리지 파일까지 전부 함께 삭제한다."""
    require_admin(authorization)

    business = (
        supabase.table("businesses").select("*").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    templates = (
        supabase.table("templates")
        .select("id,original_file_path")
        .eq("business_id", business_id)
        .execute()
        .data
        or []
    )
    template_ids = [t["id"] for t in templates]

    if template_ids:
        submissions = (
            supabase.table("submissions").select("id").in_("template_id", template_ids).execute().data or []
        )
        submission_ids = [s["id"] for s in submissions]

        if submission_ids:
            generated_docs = (
                supabase.table("generated_documents")
                .select("file_path")
                .in_("submission_id", submission_ids)
                .execute()
                .data
                or []
            )
            gen_paths = [g["file_path"] for g in generated_docs if g.get("file_path")]
            supabase.table("generated_documents").delete().in_("submission_id", submission_ids).execute()
            if gen_paths:
                try:
                    supabase.storage.from_(GENERATED_BUCKET).remove(gen_paths)
                except Exception:
                    pass

            supabase.table("submission_values").delete().in_("submission_id", submission_ids).execute()
            supabase.table("submissions").delete().in_("template_id", template_ids).execute()

        supabase.table("template_fields").delete().in_("template_id", template_ids).execute()
        supabase.table("templates").delete().eq("business_id", business_id).execute()

        template_paths = [t["original_file_path"] for t in templates if t.get("original_file_path")]
        if template_paths:
            try:
                supabase.storage.from_(TEMPLATES_BUCKET).remove(template_paths)
            except Exception:
                pass

    if business.get("reference_file_path"):
        try:
            supabase.storage.from_(TEMPLATES_BUCKET).remove([business["reference_file_path"]])
        except Exception:
            pass

    supabase.table("businesses").delete().eq("id", business_id).execute()

    return {"deleted": True}


class TemplateFieldIn(BaseModel):
    field_key: str
    field_label: str
    field_type: str
    options: list | None = None


class CreateFieldsRequest(BaseModel):
    fields: list[TemplateFieldIn]


@app.post("/admin/templates/{template_id}/fields")
def create_template_fields(
    template_id: str, req: CreateFieldsRequest, authorization: str | None = Header(None)
):
    require_admin(authorization)

    template = (
        supabase.table("templates").select("id").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    if not req.fields:
        raise HTTPException(status_code=400, detail="추가할 필드가 없습니다.")

    rows = []
    for f in req.fields:
        if f.field_type not in VALID_FIELD_TYPES:
            raise HTTPException(status_code=400, detail=f"알 수 없는 field_type: {f.field_type}")
        if not f.field_key.strip():
            raise HTTPException(status_code=400, detail="field_key는 비워둘 수 없습니다.")
        rows.append({
            "template_id": template_id,
            "field_key": f.field_key.strip(),
            "field_label": f.field_label,
            "field_type": f.field_type,
            "options": f.options,
        })

    inserted = supabase.table("template_fields").insert(rows).execute().data
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
        model="gemini-flash-latest",
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
        model="gemini-flash-latest",
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


@app.post("/admin/templates/{template_id}/suggest-fields")
def suggest_template_fields(template_id: str, authorization: str | None = Header(None)):
    require_admin(authorization)

    template = (
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")
    business = (
        supabase.table("businesses").select("name").eq("id", template["business_id"]).maybe_single().execute().data
    )
    business_name = business["name"] if business else template["name"]

    file_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(template["original_file_path"])
    doc = Document(io.BytesIO(file_bytes))
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
            field_type = d.get("field_type") if d.get("field_type") in VALID_FIELD_TYPES else "text"
            seen_keys.add(key)
            apply_blank_field(candidates[idx], key)
            field_meta[key] = {
                "field_key": key,
                "field_label": d.get("field_label") or key,
                "field_type": field_type,
                "options": d.get("options") or None,
            }

        # 표 병합이 불규칙한 문서는 서로 다른 후보가 실제로는 같은 셀/문단을 가리킬 수 있어,
        # 나중에 쓴 값이 앞서 쓴 {{}}를 덮어쓸 수 있다. 최종 저장 전에 문서를 다시 스캔해서
        # 실제로 살아남은 {{field_key}}만 결과로 돌려준다 (반환값이 실제 문서와 항상 일치하도록).
        final_keys, _ = extract_docx_fields(doc)
        fields = [field_meta[k] for k in final_keys if k in field_meta]

        if fields:
            output = io.BytesIO()
            doc.save(output)
            supabase.storage.from_(TEMPLATES_BUCKET).update(
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
        field_type = s.get("field_type") if s.get("field_type") in VALID_FIELD_TYPES else "text"
        seen_keys.add(key)
        fields.append({
            "field_key": key,
            "field_label": s.get("field_label") or key,
            "field_type": field_type,
            "options": s.get("options") or None,
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

아래 필드들을 채워야 합니다. long_text는 새 문장을 작성하고, checkbox는 후보 중 하나를 선택하세요:
{chr(10).join(fields_desc)}

규칙:
- long_text 필드는 신청자 정보를 바탕으로 신청서 톤에 맞는 격식 있는 문장을 새로 작성하세요. 국문/영문 필드는 서로 번역이 아니라 각각 자연스럽게 작성하세요.
- checkbox 필드는 options 중 정확히 일치하는 값 하나만 선택하세요.
- 정보가 부족해 추측/일반화했거나, 후보 사이에서 애매하거나, 원본 정보에 모순이 있어 보이면 needs_review를 true로 하고 confidence_note에 이유를 짧게 남기세요. 그 외에는 needs_review를 false로, confidence_note는 빈 문자열로 두세요.
"""


def call_gemini(business_name, template_name, ai_fields, user_values):
    if not ai_fields:
        return []

    prompt = build_gemini_prompt(business_name, template_name, ai_fields, user_values)

    response = gemini_client.models.generate_content(
        model="gemini-flash-latest",
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
        model="gemini-flash-latest",
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
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서식을 찾을 수 없습니다.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        docx_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(template["original_file_path"])
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
        supabase.table("businesses").select("reference_file_path,name").eq("id", business_id).maybe_single().execute().data
    )
    if not business or not business.get("reference_file_path"):
        raise HTTPException(status_code=404, detail="등록된 기본서류가 없습니다.")

    object_path = business["reference_file_path"]
    ext = Path(object_path).suffix.lower()
    file_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(object_path)
    media_type = REFERENCE_DOC_MIME_TYPES.get(ext, "application/octet-stream")
    filename = f"{business['name']}_기본서류{ext}"

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@app.get("/businesses/{business_id}/reference-doc/preview-pdf")
def preview_reference_doc_pdf(business_id: str):
    """공고 상세페이지에서 기본서류를 PDF로 바로 미리보기 위한 공개 엔드포인트.
    이미지(jpg/png)는 그대로 반환하고, docx는 PDF로 변환한다. hwp는 변환을 지원하지 않는다."""
    business = (
        supabase.table("businesses").select("reference_file_path,name").eq("id", business_id).maybe_single().execute().data
    )
    if not business or not business.get("reference_file_path"):
        raise HTTPException(status_code=404, detail="등록된 기본서류가 없습니다.")

    object_path = business["reference_file_path"]
    ext = Path(object_path).suffix.lower()
    file_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(object_path)

    if ext == ".pdf":
        return Response(content=file_bytes, media_type="application/pdf")

    if ext in (".jpg", ".jpeg", ".png"):
        return Response(content=file_bytes, media_type=REFERENCE_DOC_MIME_TYPES[ext])

    if ext == ".docx":
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            docx_path = tmp_path / "reference.docx"
            docx_path.write_bytes(file_bytes)
            try:
                pdf_path = convert_to_pdf(docx_path, tmp_path)
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"PDF 미리보기 생성에 실패했습니다: {e}")
            return Response(content=pdf_path.read_bytes(), media_type="application/pdf")

    raise HTTPException(status_code=415, detail="이 파일 형식은 미리보기를 지원하지 않습니다. 다운로드해서 확인해주세요.")


@app.post("/generate")
def generate(req: GenerateRequest):
    submission_id = req.submission_id

    submission = (
        supabase.table("submissions").select("*").eq("id", submission_id).single().execute().data
    )
    if not submission:
        raise HTTPException(status_code=404, detail="submission을 찾을 수 없습니다.")

    template = (
        supabase.table("templates").select("*").eq("id", submission["template_id"]).single().execute().data
    )
    business = (
        supabase.table("businesses").select("*").eq("id", template["business_id"]).single().execute().data
    )
    fields = (
        supabase.table("template_fields").select("*").eq("template_id", template["id"]).execute().data
    )
    field_by_id = {f["id"]: f for f in fields}

    existing_values = (
        supabase.table("submission_values").select("*").eq("submission_id", submission_id).execute().data
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

    already_ai_filled = {v["field_id"] for v in existing_values if v["source"] == "ai_generated"}
    ai_fields = [f for f in fields if f["field_type"] in AI_FIELD_TYPES and f["id"] not in already_ai_filled]
    ai_field_by_key = {f["field_key"]: f for f in ai_fields}

    ai_results = call_gemini(business["name"], template["name"], ai_fields, user_values)

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
        supabase.table("submission_values").insert(new_rows).execute()

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

        template_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(template["original_file_path"])
        template_path = tmp_path / "template.docx"
        template_path.write_bytes(template_bytes)

        output_docx = tmp_path / "output.docx"
        fill_document(str(template_path), str(output_docx), values, checkbox_selections, review_fields)

        pdf_path = convert_to_pdf(output_docx, tmp_path)

        storage_path = f"{submission_id}/document.pdf"
        with open(pdf_path, "rb") as fh:
            supabase.storage.from_(GENERATED_BUCKET).upload(
                storage_path,
                fh.read(),
                {"content-type": "application/pdf", "upsert": "true"},
            )

    generated_doc = (
        supabase.table("generated_documents")
        .insert({
            "submission_id": submission_id,
            "file_path": storage_path,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
        .execute()
        .data[0]
    )

    supabase.table("submissions").update({"status": "generated"}).eq("id", submission_id).execute()

    return {
        "submission_id": submission_id,
        "file_path": storage_path,
        "generated_document_id": generated_doc["id"],
    }


@app.post("/review")
def review(req: ReviewRequest):
    submission_id = req.submission_id

    submission = (
        supabase.table("submissions").select("*").eq("id", submission_id).single().execute().data
    )
    if not submission:
        raise HTTPException(status_code=404, detail="submission을 찾을 수 없습니다.")

    template = (
        supabase.table("templates").select("*").eq("id", submission["template_id"]).single().execute().data
    )
    business = (
        supabase.table("businesses").select("*").eq("id", template["business_id"]).single().execute().data
    )
    fields = (
        supabase.table("template_fields").select("*").eq("template_id", template["id"]).execute().data
    )
    field_by_id = {f["id"]: f for f in fields}

    existing_values = (
        supabase.table("submission_values").select("*").eq("submission_id", submission_id).execute().data
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
        supabase.table("submissions")
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
        supabase.table("notifications").insert({
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
