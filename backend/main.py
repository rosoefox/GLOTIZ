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
import pymupdf
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
DATA_GO_KR_TRADE_SERVICE_KEY = os.environ["DATA_GO_KR_TRADE_SERVICE_KEY"]
# 모든 Gemini 호출은 Developer API 키가 아니라 Vertex AI를 통해 이뤄진다.
# GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 키 경로)는 google-auth ADC가 자동으로 읽는다.
VERTEX_AI_PROJECT_ID = os.environ["VERTEX_AI_PROJECT_ID"]
VERTEX_AI_LOCATION = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
IMAGE_GEN_MODEL = os.environ.get("IMAGE_GEN_MODEL", "gemini-2.5-flash-image")

TEMPLATES_BUCKET = "templates"
GENERATED_BUCKET = "generated"
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

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
gemini_client = genai.Client(vertexai=True, project=VERTEX_AI_PROJECT_ID, location=VERTEX_AI_LOCATION)
market_gemini_client = gemini_client
vertex_image_client = gemini_client

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
    allow_origin_regex=r"http://localhost:\d+",
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


CHATBOT_SYSTEM_PROMPT = """당신은 전북 지역 수출지원사업 공고를 담당하는 지자체 직원입니다. 공고의 안내사항
(주관기관, 접수기간, 지원대상, 지원내용, 제출서류, 문의처 등)과 수출 서류, 관세·통관, 해외 시장 진출
관련 사항을 정확히 숙지하고 있는 실무자로서, 민원인에게 직접 말하듯 답변하세요.

답변 형식(반드시 지키세요, 예외 없음):
- 문서·목록 형식이 아니라, 사람이 직접 대답하는 자연스러운 대화체 문장으로 답하세요.
- "~에 대해 궁금하시군요" 같은 인사말·서론 없이, 최대한 간단하게 핵심만 바로 말하세요. 불필요한 배경 설명은 빼세요.
- 문장은 짧게 2~4개 정도로 끊어 말하고, 장황하게 늘어놓지 마세요.
- **, *, # 같은 마크다운 기호는 절대 쓰지 마세요(그대로 글자로 보입니다).
- 확실하지 않은 법률·세무 정보는 단정짓지 말고 전문가 상담이 필요하다고 짧게 알려주세요.
- 답변 맨 마지막은 항상 자연스러운 후속 질문 한 문장으로 마무리하세요 (예: "혹시 더 궁금하신 정보 있으신가요?" 같은 식으로, 매번 표현을 조금씩 바꿔서).

예시:
사용자: 이번 수출바우처 공고 접수기간이랑 지원대상 알려줘
AI: 접수기간은 2026년 3월 1일부터 31일까지고요, 수출 초보·유망 중소기업이면 신청하실 수 있어요. 자세한 건 전북경제통상진흥원 수출지원팀으로 문의하시면 됩니다. 혹시 더 궁금하신 정보 있으신가요?"""


@app.post("/chat")
def chat(req: ChatRequest):
    history_text = "\n".join(
        f"{'사용자' if h.role == 'user' else 'AI'}: {h.message}" for h in req.history[-6:]
    )
    prompt = f"{CHATBOT_SYSTEM_PROMPT}\n\n{history_text}\n사용자: {req.message}\nAI:"

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return {"answer": (response.text or "").strip()}


FAQ_SUGGEST_PROMPT = """당신은 GLOTIZ(전북 소상공인의 해외 수출을 돕는 서비스: 수출지원사업 매칭,
서류 자동작성·번역, AI 마케팅 이미지 생성, 쇼피 등 해외 플랫폼 입점 가이드 제공) 고객지원 담당자입니다.

이 서비스를 처음 쓰는 소상공인 사장님이 가장 헷갈려하거나 어려워할 만한 질문 5개를 스스로 떠올려서,
자주 묻는 질문(FAQ) 형태로 만들어주세요. 각 답변은 2문장 이내로 친절하고 구체적으로 작성하세요.
"""


@app.get("/faq/suggest")
def suggest_faq():
    """고객지원 페이지의 '자주 묻는 질문'을, 사용자가 가장 어려워할 만한 주제로 AI가 스스로
    골라 채운다. 실패하면 프런트에서 mockData의 고정 FAQ로 대체한다."""
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=FAQ_SUGGEST_PROMPT,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "question": {"type": "STRING"},
                            "answer": {"type": "STRING"},
                        },
                        "required": ["question", "answer"],
                    },
                },
            ),
        )
        faqs = json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FAQ 추천에 실패했습니다: {friendly_ai_error(e)}")
    return {"faqs": faqs}


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
            model="gemini-2.5-flash",
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
        model="gemini-2.5-flash",
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
    # 원본 파일명을 그대로 스토리지 키에 넣으면 한글/대괄호/공백 때문에 Supabase Storage가
    # "Invalid key"로 거부한다. 키는 안전한 uuid+확장자로만 만들고, 원본 이름은 별도로 반환한다.
    object_path = f"additional-docs/{user_id}/{uuid.uuid4().hex}{ext}"
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
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
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
        supabase.storage.from_(TEMPLATES_BUCKET).upload(
            object_path, file_bytes, {"content-type": file.content_type or "application/octet-stream"}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"파일 업로드에 실패했습니다: {e}")

    # submissions.status는 'filled'/'generated'만 허용한다(체크 제약) — "uploaded"는 없는 값이라
    # insert가 매번 500으로 죽었었다. 사용자가 올린 파일 자체가 최종 산출물이니 'generated'로 넣는다.
    row = (
        supabase.table("submissions")
        .insert({"template_id": template_id, "user_id": user_id, "status": "generated", "file_path": object_path})
        .execute()
        .data[0]
    )
    return row


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


def next_business_sort_order() -> int | None:
    """sort_order 컬럼은 backend/sql/reorder_and_uploads.sql 마이그레이션 실행 후에 생긴다.
    아직 실행 전이라면 조회 자체가 에러이므로, None을 반환해 호출부가 그 컬럼 없이 진행하게 한다."""
    try:
        existing = (
            supabase.table("businesses")
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

    row = supabase.table("businesses").insert(payload).execute().data[0]
    return row


class UpdateOrderRequest(BaseModel):
    sort_order: int


@app.patch("/admin/businesses/{business_id}/order")
def reorder_business(business_id: str, req: UpdateOrderRequest, authorization: str | None = Header(None)):
    require_admin(authorization)
    try:
        row = (
            supabase.table("businesses")
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
        model="gemini-2.5-flash",
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
        raise HTTPException(
            status_code=502, detail=f"파일은 업로드됐지만 AI 정보 추출에 실패했습니다: {friendly_ai_error(e)}"
        )

    row = (
        supabase.table("businesses")
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
            supabase.table("templates")
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
    file: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    require_admin(authorization)

    business = (
        supabase.table("businesses").select("id").eq("id", business_id).maybe_single().execute().data
    )
    if not business:
        raise HTTPException(status_code=404, detail="해당 사업을 찾을 수 없습니다.")

    object_path = None
    if not user_upload_required:
        if not file or not file.filename or not file.filename.lower().endswith(".docx"):
            raise HTTPException(status_code=400, detail="docx 파일만 업로드할 수 있습니다.")

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

    payload = {
        "business_id": business_id,
        "name": name,
        "form_number": None if user_upload_required else form_number,
        "original_file_path": object_path,
        "user_upload_required": user_upload_required,
    }
    sort_order = next_template_sort_order(business_id, user_upload_required)
    if sort_order is not None:
        payload["sort_order"] = sort_order

    try:
        row = supabase.table("templates").insert(payload).execute().data[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"서류 양식 저장에 실패했습니다: {e}")
    return row


@app.patch("/admin/templates/{template_id}/order")
def reorder_template(template_id: str, req: UpdateOrderRequest, authorization: str | None = Header(None)):
    require_admin(authorization)
    try:
        row = (
            supabase.table("templates")
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
        model="gemini-2.5-flash",
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

    if template["business_id"] == VIETNAM_EXPO_BUSINESS_ID and template["name"].strip() == "참가 신청서":
        apply_vietnam_application_placeholders(doc)
        output = io.BytesIO()
        doc.save(output)
        # 같은 Storage 경로를 덮어쓰면 CDN 캐시 때문에 직전 원본이 다시 내려올 수 있어
        # 고정 필드를 심은 파일은 새 경로로 올리고 template 포인터를 교체한다.
        patched_path = f"{template['business_id']}/{uuid.uuid4().hex}.docx"
        supabase.storage.from_(TEMPLATES_BUCKET).upload(
            patched_path,
            output.getvalue(),
            {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
        )
        supabase.table("templates").update({"original_file_path": patched_path}).eq("id", template_id).execute()
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


@app.post("/templates/{template_id}/extract-from-uploads")
def extract_from_uploads(template_id: str, authorization: str | None = Header(None)):
    """작성 중인 서류 화면에서 '업로드한 서류에서 불러오기'를 누르면, 이 사용자가 예전에
    포털에 업로드했던 서류(사업자등록증 등) 파일을 AI(Gemini)가 직접 읽어서 지금 서식의
    빈 칸에 채울 수 있는 값을 뽑아 돌려준다. ai-fill과 마찬가지로 미리보기 용도라
    submission을 만들거나 저장하지 않는다."""
    user_id = require_user(authorization)

    template = (
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서류를 찾을 수 없습니다.")

    fields = (
        supabase.table("template_fields").select("*").eq("template_id", template_id).execute().data or []
    )
    if not fields:
        return {"fields": []}

    all_submissions = (
        supabase.table("submissions")
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

    parts = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for row in picked:
            path = row["file_path"]
            ext = Path(path).suffix.lower()
            try:
                file_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(path)
            except Exception:
                continue

            if ext in (".docx", ".hwp"):
                try:
                    src_path = tmp_path / f"{row['id']}{ext}"
                    src_path.write_bytes(file_bytes)
                    pdf_path = convert_to_pdf(src_path, tmp_path)
                    parts.append(types.Part.from_bytes(data=pdf_path.read_bytes(), mime_type="application/pdf"))
                except Exception:
                    continue
            elif ext in DOC_PART_MIME_BY_EXT:
                parts.append(types.Part.from_bytes(data=file_bytes, mime_type=DOC_PART_MIME_BY_EXT[ext]))

    if not parts:
        return {"fields": []}

    try:
        results = call_gemini_extract_from_docs(template["name"], fields, parts)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"업로드한 서류에서 정보를 불러오지 못했습니다: {friendly_ai_error(e)}"
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
        supabase.table("businesses")
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
    file_bytes = supabase.storage.from_(TEMPLATES_BUCKET).download(object_path)
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


def build_translate_fields_prompt(fields, lang_name):
    lines = "\n".join(f"- {k}: {v}" for k, v in fields.items())
    return f"""다음은 한국어로 작성된 해외 이커머스 플랫폼(쇼피 등) 상품 등록 정보입니다.
아래 각 항목의 값을 자연스럽고 상업적으로 매력적인 {lang_name}로 번역해주세요.
브랜드명 등 고유명사는 발음을 살려 표기하고, 이커머스 상품 페이지에 바로 쓸 수 있는 문체로 작성하세요.

{lines}

반드시 원본과 동일한 키를 사용한 JSON 객체로만 응답하세요.
"""


@app.post("/translate-fields")
def translate_fields(req: TranslateFieldsRequest):
    """쇼피 입점 폼에 입력한 한국어 값들을 선택한 언어(영/태국/베트남)로 한번에 번역한다."""
    lang_name = TRANSLATE_LANGUAGE_NAMES.get(req.target_lang)
    if not lang_name:
        raise HTTPException(status_code=400, detail="지원하지 않는 언어입니다.")

    non_empty = {k: v for k, v in req.fields.items() if (v or "").strip()}
    if not non_empty:
        return {"translated": {k: "" for k in req.fields}}

    prompt = build_translate_fields_prompt(non_empty, lang_name)
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {k: {"type": "STRING"} for k in non_empty},
                    "required": list(non_empty.keys()),
                },
            ),
        )
        translated = json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"번역에 실패했습니다: {friendly_ai_error(e)}")

    return {"translated": {k: translated.get(k, "") for k in req.fields}}


PRICE_MARKET_INFO = {
    "en": {"currency": "USD", "label": "Global (English-speaking markets)"},
    "th": {"currency": "THB", "label": "Thailand"},
    "vi": {"currency": "VND", "label": "Vietnam"},
}


class PriceSuggestionRequest(BaseModel):
    product_name: str
    category: str = ""
    description: str = ""
    brand: str = ""
    krw_price: str = ""
    target_market: str  # "en" | "th" | "vi"


def build_price_suggestion_prompt(req: PriceSuggestionRequest, market):
    krw_note = f"현재 국내(원화) 판매가: {req.krw_price}원" if req.krw_price else "국내 판매가 정보 없음"
    return f"""당신은 한국 소상공인의 상품을 해외 이커머스 플랫폼(쇼피 등)에 등록하는 것을 돕는 가격 책정 전문가입니다.
아래 상품을 {market['label']} 시장에 판매할 때 적정한 Global SKU Price를 {market['currency']} 통화로 추천해주세요.

상품명: {req.product_name}
카테고리: {req.category}
브랜드: {req.brand}
상품 설명: {req.description}
{krw_note}

고려 사항:
- 원화 가격이 있다면 최근 환율 감각으로 환산한 금액을 기준으로, 현지 동종 상품 시세와 구매력을 반영해 조정하세요.
- 플랫폼 수수료, 배송비, 관세 등을 고려해 판매자에게 남는 마진이 있도록 다소 여유있게 책정하세요.
- suggestedPrice는 숫자만(콤마 없이) 문자열로 반환하세요.

아래 JSON으로 응답하세요:
- suggestedPrice: 추천 가격(숫자 문자열)
- currency: "{market['currency']}"
- reasoning: 추천 근거를 2~3문장의 한국어로 설명
"""


@app.post("/price-suggestion")
def suggest_price(req: PriceSuggestionRequest):
    """쇼피 입점 폼의 Global SKU Price 필드에서, 선택한 시장 통화 기준 적정가를 AI가 추천한다."""
    market = PRICE_MARKET_INFO.get(req.target_market)
    if not market:
        raise HTTPException(status_code=400, detail="지원하지 않는 시장입니다.")
    if not req.product_name.strip():
        raise HTTPException(status_code=400, detail="상품명을 먼저 입력해주세요.")

    prompt = build_price_suggestion_prompt(req, market)
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "suggestedPrice": {"type": "STRING"},
                        "currency": {"type": "STRING"},
                        "reasoning": {"type": "STRING"},
                    },
                    "required": ["suggestedPrice", "currency", "reasoning"],
                },
            ),
        )
        data = json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"가격 추천에 실패했습니다: {friendly_ai_error(e)}")

    return data


@app.post("/marketing/ai-fill")
def marketing_ai_fill(
    product_name: str = Form(...),
    product_images: list[UploadFile] = File(...),
    authorization: str | None = Header(None),
):
    """AI 이미지 생성 페이지의 '상품 정보 입력'에서 'AI로 채우기'를 누르면, 사용자가 이미 업로드한
    상품 사진(여러 장 가능)을 실제로 보고 상품명에 맞춰 나머지 정보(태그라인/설명/가격/필수 장면)를 채워준다.
    상품명은 사용자가 직접 쓴 값을 그대로 존중하고 AI가 덮어쓰지 않는다."""
    require_user(authorization)

    if not product_name.strip():
        raise HTTPException(status_code=400, detail="상품명을 입력해야 작성 가능합니다.")
    if not product_images:
        raise HTTPException(status_code=400, detail="먼저 상품 사진을 넣어주세요.")
    for img in product_images:
        if (img.content_type or "") not in ALLOWED_PRODUCT_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")

    image_parts = [
        types.Part.from_bytes(data=img.file.read(), mime_type=img.content_type) for img in product_images
    ]
    prompt = f"""당신은 소상공인의 해외 수출 마케팅 자료 작성을 돕는 어시스턴트입니다.
첨부된 사진{'들' if len(product_images) > 1 else ''}은 실제로 판매할 상품 사진입니다. 사진 속 상품의 실제 형태·색상·재질·특징을 자세히 보고,
아래 상품명에 맞는 마케팅 정보를 채워주세요. 사진만으로 알 수 없는 항목(가격 등)만 합리적으로 추정하세요.

상품명: {product_name.strip()}

다음 항목을 채워주세요 (상품명이 영어 등 다른 언어로 적혀 있어도 반드시 한국어로 작성하세요.
언어 변경은 화면의 "이미지 언어 설정하기" 버튼으로 사용자가 직접 선택할 때만 이뤄집니다):
- tagline: 한 줄 홍보 문구
- description: 상품 설명 (2~3문장, 사진에 실제로 보이는 특징을 반영)
- price: 가격 (예: "29,000원" 형식)
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
                        "must_have_photo": {"type": "STRING"},
                    },
                    "required": ["tagline", "description", "price", "must_have_photo"],
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
        supabase.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not template:
        raise HTTPException(status_code=404, detail="해당 서류를 찾을 수 없습니다.")
    business = (
        supabase.table("businesses").select("name").eq("id", template["business_id"]).maybe_single().execute().data
    )
    business_name = business["name"] if business else template["name"]

    fields = (
        supabase.table("template_fields").select("*").eq("template_id", template_id).execute().data or []
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


def _generate_image(
    prompt: str, reference_images: list[tuple[bytes, str]], aspect_ratio: str
) -> tuple[bytes, str]:
    """Vertex AI 이미지 생성 모델을 호출해 (이미지 bytes, mime_type)을 반환한다.
    reference_images는 (bytes, mime_type) 튜플 목록 — 상품 사진을 여러 장 올렸으면 전부 같이
    넘겨서, 여러 각도/구성을 참고해 더 정확한 이미지를 만들도록 한다."""
    response = vertex_image_client.models.generate_content(
        model=IMAGE_GEN_MODEL,
        contents=[
            *[types.Part.from_bytes(data=b, mime_type=m) for b, m in reference_images],
            prompt,
        ],
        config=types.GenerateContentConfig(
            image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
        ),
    )
    if response.candidates:
        for part in response.candidates[0].content.parts:
            if getattr(part, "inline_data", None) is not None:
                return part.inline_data.data, part.inline_data.mime_type
    raise RuntimeError("이미지가 생성되지 않았습니다.")


def _generate_copy_json(prompt: str, schema: dict) -> dict:
    """문구(JSON) 생성 — Vertex AI gemini_client를 재사용한다."""
    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema),
    )
    return json.loads(response.text)


def _upload_generated_image(user_id: str, gen_id: str, slot: str, image_bytes: bytes, mime_type: str) -> dict:
    ext = "png" if "png" in mime_type else "jpg"
    path = f"marketing-images/{user_id}/{gen_id}/{slot}.{ext}"
    supabase.storage.from_(GENERATED_BUCKET).upload(
        path, image_bytes, {"content-type": mime_type, "upsert": "true"}
    )
    signed = supabase.storage.from_(GENERATED_BUCKET).create_signed_url(path, 3600)
    return {"slot": slot, "path": path, "url": signed.get("signedURL")}


def _style_line(style_hint: str) -> str:
    return f"\n스타일 톤: {style_hint.strip()}" if style_hint and style_hint.strip() else ""


def _poster_prompt(description: str, must_have_photo: str, style_hint: str = "", aspect_ratio: str = "4:5") -> str:
    scene = must_have_photo.strip() or "상품을 돋보이게 하는 매력적인 장면을 자유롭게 구성하세요."
    return f"""당신은 상업 광고 사진작가입니다. 아래 정보를 바탕으로 마케팅 포스터용 배경 이미지를 만들어주세요.
상품 설명: {description or '(설명 없음)'}
반드시 포함되어야 하는 장면: {scene}

요구사항: 첨부된 참고 사진 속 실제 상품과 동일한 형태·색상·재질로 등장시키세요.
세로로 긴 {aspect_ratio} 비율로 구성하고,
화면 하단 1/3 지점에 나중에 제목/태그라인/가격 문구가 얹힐 수 있도록 그 부분의 배경이 너무 산만하지 않게 여백과 대비를 의도적으로 남겨주세요.
실제 스튜디오에서 촬영한 것처럼 사실적인 조명·그림자·반사를 살려서, AI가 생성한 티가 나지 않는 고급 상업광고 포스터 사진 스타일로 만들어주세요.{_style_line(style_hint)}
{NO_TEXT_INSTRUCTION}"""


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
warped, doubled, or illegible letterforms. If a supplied {{brand_logo}} reference image exists, you
may feature that actual supplied logo graphic as a real photographed object/sticker/label element —
but never invent a logo, and never typeset the brand name yourself unless {{brand_name}} is the field
being rendered.

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
Target Language (for the copy that will be added outside this image later): {{target_language}}

IMAGE INPUTS
Primary Product Image: {{product_image}}
Detail Image: {{detail_image}}
Brand Logo: {{brand_logo}}
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
7. BRAND: {{brand_name}} (small logo/wordmark area)
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
# 구조(히어로/성분·인증/사용법/브랜드 클로징)를 쓴다. 다른 프롬프트들과 동일하게, 실제 문자는
# AI가 이미지 안에 그리지 않고 프론트엔드가 오버레이하므로, 타이포그래피/문구 관련 지시는 전부
# "이 자리를 이만큼 비중 있게 비워둬라"는 구도 지시로 다시 썼다.
CLEAN_EDITORIAL_CARD_NEWS_PROMPT = """ROLE
You are a senior commercial art director and editorial product photographer specializing in premium e-commerce campaigns, beauty advertising, lifestyle products, and clean editorial design.
Create ONE square page (the requested PAGE_NUMBER) from a cohesive 4-page square product card-news campaign, based on the product data and reference assets provided below.
The campaign concept is CLEAN & EDITORIAL. The four pages must feel like one professionally art-directed advertising campaign while each page serves a different communication purpose.

IMPORTANT SYSTEM RULE
Gemini renders the actual typography directly into the image — the headline, product name, tagline,
description excerpt, and price are real rendered text, not reserved empty space.
Render every supplied field's ACTUAL value exactly as given — do not paraphrase, translate, or invent
wording. Do not invent headlines, slogans, prices, product descriptions, promotional messages, ingredient
claims, certification claims, CTA text, website addresses, social media handles, or decorative pseudo-text.
If a field is empty, omit that element (no placeholder, no blank box) rather than leaving a broken gap.
Keep every line of rendered text crisp, correctly spelled, and fully legible — never render smudged,
warped, doubled, or half-formed letterforms.

INPUT DATA
The application may provide:
Company name: {{company_name}}
Company logo: {{company_logo}}
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
Purpose: immediately introduce the product and establish the brand. Render directly in the image: company
name/logo ({{company_name}}), product name ({{product_name}}), tagline ({{company_slogan}}), regular price
({{regular_price}}), promotional price ({{promotion_price}}). Visual priority: 1) product, 2) product
presentation, 3) rendered typography, 4) supporting environment. The actual product image should be the
hero visual, occupying approximately 40-60% of the visual attention. Use a premium editorial still-life
composition: warm neutral studio, stone pedestal, marble slab, soft linen, subtle botanical accent, soft
natural shadows. Do not overcrowd the scene. Render the product name, tagline, price, and promotional
price in approximately 30-40% of the composition, plus a small clean area for the company logo/name. Omit
any field that is empty rather than showing a placeholder.

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
the tagline ({{company_slogan}}), the company name/logo ({{company_name}}), and optionally a restrained
product image. This should be the most minimal page in the campaign. Create maximum breathing room: subtle
brand colors, soft lighting, simple background, minimal product presence, refined composition. Render the
tagline as a large uninterrupted editorial headline and the company name/logo in a separate clean area.
The product may appear subtly but should not dominate as strongly as Page 01. Omit the tagline entirely if
{{company_slogan}} is empty — never invent one. Do not add a CTA, URL, social handle, promotional badge,
or any other rendered text beyond the tagline and company name.

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


def _card_news_copy_prompt(product_name: str, description: str) -> str:
    return f"""당신은 이커머스 카드뉴스 카피라이터입니다.
상품명: {product_name}
상품 설명: {description or '(설명 없음)'}

상품명이 영어 등 다른 언어로 적혀 있어도 문구는 반드시 한국어로 작성하세요. 언어 변경은 화면의
"이미지 언어 설정하기" 버튼으로 사용자가 직접 선택할 때만 이뤄집니다.

features: 상품 설명에서 도출한 핵심 특징 2~4개, 각 8~14자 내외 짧은 한글 문구 (설명에 근거하여, 지어내지 마세요).
promoLine: 마지막 장 CTA용 15자 내외 짧고 임팩트 있는 홍보 문구."""


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
invent wording. If a field is empty, per rule 32 simply omit that element (no placeholder, no blank
box) rather than leaving broken negative space.
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
│ BENEFIT        DESCRIPTION    │
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

13. RIGHT LABEL — PRODUCT DESCRIPTION
Position:
X = approximately 70–95%
Y = approximately 38–52%
Render a small heading "PRODUCT DESCRIPTION" followed by:
{{product_description}}
Typeface: clean modern sans-serif (see 14), small, understated. Maximum 3–4 short lines — condense
the supplied description if it is longer, preserving factual meaning. If empty, omit this entire
element.

13B. BOTTOM BLOCK — TAGLINE / PRODUCT NAME / PRICE / CTA
Reserve the bottom ~20–28% of the canvas as a grounded surface (matches the reflective-surface zone
in section 24) and render this stacked block, left-aligned, on top of it:
1. A one-line marketing tagline in small tracked uppercase (may reuse {{tagline}} again or a short
   restatement of {{product_benefit}}/{{product_description}} if {{tagline}} was already used in
   zone 08 — keep it brief).
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
Used for: the "PRODUCT BENEFITS" / "PRODUCT DESCRIPTION" labels and their content (12, 13), the
small tracked tagline inside the bottom block (13B), and the CTA (13B).
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
CENTER RIGHT → product description label (13)
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
CENTER RIGHT
→ description
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
product benefit, product description, product name, price, CTA) or the fixed labels "PRODUCT
BENEFITS" / "PRODUCT DESCRIPTION". Do NOT add fake English descriptions, decorative sentences,
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
● right description label
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
and
RIGHT "PRODUCT DESCRIPTION" LABEL (13)
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


def _apply_prompt_template(template: str, values: dict[str, str]) -> str:
    """{{token}} 형태의 자리표시자를 실제 값으로 치환한다. 값이 없는 항목은 빈 문자열로 남겨서,
    프롬프트 자체가 갖고 있는 "데이터 없으면 지어내지 말고 비워두라"는 규칙이 그대로 작동하게 한다."""
    result = template
    for key, value in values.items():
        result = result.replace("{{" + key + "}}", value or "")
    return result


def _luxury_premium_poster_prompt(
    product_name: str, description: str, tagline: str, price: str, brand_name: str, aspect_ratio: str
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
    }
    return _apply_prompt_template(LUXURY_PREMIUM_POSTER_PROMPT, values)


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
    aspect_ratio=DEFAULT_POSTER_ASPECT_RATIO, model_note="",
):
    if aspect_ratio not in POSTER_ASPECT_RATIOS:
        aspect_ratio = DEFAULT_POSTER_ASPECT_RATIO
    if template_id == "tpl-poster-luxury":
        prompt = _luxury_premium_poster_prompt(product_name, description, tagline, price, brand_name, aspect_ratio)
    else:
        prompt = _poster_prompt(description, must_have_photo, style_hint, aspect_ratio)
    prompt = _with_notes(prompt, logo_note, model_note)
    image_bytes, mime = _generate_image(prompt, reference_images, aspect_ratio)
    return {"images": [_upload_generated_image(user_id, gen_id, "poster", image_bytes, mime)]}


def _generate_card_news(
    user_id, gen_id, reference_images, product_name, description, must_have_photo, style_hint="",
    logo_note="", tagline="", price="", brand_name="", target_language="ko", template_id="",
):
    # 카드 장수는 4장으로 고정한다 — 레이아웃마다 다른 건 카드 수가 아니라 프롬프트에 얹는 스타일 톤이다.
    copy = _generate_copy_json(_card_news_copy_prompt(product_name, description), CARD_NEWS_COPY_SCHEMA)
    features = copy.get("features") or []
    promo_line = copy.get("promoLine") or ""
    benefit_slots = (features + ["", "", ""])[:3]

    if template_id == "tpl-cardnews-minimal":
        # "클린 & 에디토리얼"만 예외로, 전용 4페이지 캠페인 프롬프트(CLEAN_EDITORIAL_CARD_NEWS_PROMPT)를 쓴다.
        clean_values = {
            "company_name": brand_name,
            "company_logo": "(첨부된 참고 이미지 중 로고 이미지를 참고하세요)" if logo_note else "",
            "company_slogan": tagline,
            "product_name": product_name,
            "product_description": description,
            "product_category": "",
            "regular_price": "",
            "promotion_price": price,
            "product_images": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        }
        slot_prompts = [
            ("card-1", _clean_editorial_card_prompt("PAGE_01_PRODUCT_HERO", clean_values, style_hint)),
            ("card-2", _clean_editorial_card_prompt("PAGE_02_PRODUCT_EXPERIENCE", clean_values, style_hint)),
            ("card-3", _clean_editorial_card_prompt("PAGE_03_PRODUCT_DETAIL", clean_values, style_hint)),
            ("card-4", _clean_editorial_card_prompt("PAGE_04_BRAND_CLOSING", clean_values, style_hint)),
        ]
        images = []
        for slot, prompt in slot_prompts:
            image_bytes, mime = _generate_image(prompt, reference_images, "1:1")
            images.append(_upload_generated_image(user_id, gen_id, slot, image_bytes, mime))
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
        "target_language": target_language,
        "product_image": "(첨부된 참고 이미지 속 실제 상품 사진을 그대로 사용하세요)",
        "detail_image": "",
        "brand_logo": "(첨부된 참고 이미지 중 로고 이미지를 참고하세요)" if logo_note else "",
    }

    must_have_note = (
        f"MUST-HAVE SCENE (from the user, take priority over the generic usage-context fallback above): "
        f"{must_have_photo.strip()}"
        if must_have_photo.strip()
        else ""
    )
    slot_prompts = [
        ("card-1", _shopee_card_prompt("CARD_01_HERO_PRICE", values, style_hint)),
        ("card-2", _shopee_card_prompt("CARD_02_BENEFITS", values, style_hint)),
        ("card-3", _shopee_card_prompt("CARD_03_USAGE", values, style_hint, must_have_note)),
        ("card-4", _shopee_card_prompt("CARD_04_PROMOTION", values, style_hint)),
    ]

    images = []
    for slot, prompt in slot_prompts:
        image_bytes, mime = _generate_image(prompt, reference_images, "1:1")
        images.append(_upload_generated_image(user_id, gen_id, slot, image_bytes, mime))

    return {"images": images, "copy": {"features": features, "promoLine": promo_line}}


def _generate_detail(
    user_id, gen_id, reference_images, product_name, description, style_hint="", logo_note="", model_note="",
):
    captions_result = _generate_copy_json(_detail_captions_prompt(product_name, description), DETAIL_CAPTIONS_SCHEMA)
    captions = (captions_result.get("captions") or [])[:3]
    while len(captions) < 3:
        captions.append({"eyebrow": "", "heading": "", "description": ""})

    images = []

    hero_prompt = _with_notes(_detail_hero_prompt(description, style_hint), logo_note, model_note)
    hero_bytes, hero_mime = _generate_image(hero_prompt, reference_images, "16:9")
    images.append(_upload_generated_image(user_id, gen_id, "hero", hero_bytes, hero_mime))

    for i, caption in enumerate(captions, start=1):
        feature_prompt = _with_notes(_detail_feature_prompt(caption, style_hint), logo_note, model_note)
        f_bytes, f_mime = _generate_image(feature_prompt, reference_images, "1:1")
        images.append(_upload_generated_image(user_id, gen_id, f"feature-{i}", f_bytes, f_mime))

    angle_slots = [
        ("angle-front", "정면에서 본 모습"),
        ("angle-back", "후면에서 본 모습"),
        ("angle-top", "위에서 내려다본 모습"),
    ]
    for slot, label in angle_slots:
        angle_prompt = _with_notes(_detail_angle_prompt(label, style_hint), logo_note, model_note)
        a_bytes, a_mime = _generate_image(angle_prompt, reference_images, "1:1")
        images.append(_upload_generated_image(user_id, gen_id, slot, a_bytes, a_mime))

    return {"images": images, "copy": {"captions": captions}}


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
    aspect_ratio: str = Form(DEFAULT_POSTER_ASPECT_RATIO),
    use_ai_model: bool = Form(False),
    product_images: list[UploadFile] = File(...),
    logo: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    """상품 정보 + 상품 사진(여러 장 가능) + 기업 로고(선택)를 바탕으로 AI 마케팅 이미지를 생성한다
    (포스터 1장 / 카드뉴스 4장 / 상세설명 7장). template_id가 "tpl-poster-luxury"인 경우를 제외하면
    이미지에는 문구를 렌더링하지 않고 실제 문구는 프론트엔드가 오버레이한다 — 럭셔리&프리미엄
    포스터만 예외로, Gemini가 태그라인·히어로 워드·상품명(Bebas Neue)·가격·CTA를 이미지 안에 직접
    렌더링한다(LUXURY_PREMIUM_POSTER_PROMPT 참고). style_hint는 프롬프트에 얹는 스타일 톤이고,
    template_id가 "tpl-poster-luxury"이면 전용 데이터 기반 광고 프롬프트(LUXURY_PREMIUM_POSTER_PROMPT)를 대신 쓴다."""
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
        brand_name = ""
        if (layout == "poster" and template_id == "tpl-poster-luxury") or layout == "card-news":
            profile = (
                supabase.table("profiles").select("company").eq("id", user_id).maybe_single().execute().data
            ) or {}
            brand_name = profile.get("company") or ""

        if layout == "poster":
            result = _generate_poster(
                user_id, gen_id, reference_images, product_name, description, must_have_photo,
                style_hint, template_id, tagline, price, brand_name, logo_note, aspect_ratio, model_note,
            )
        elif layout == "card-news":
            result = _generate_card_news(
                user_id, gen_id, reference_images, product_name, description, must_have_photo,
                style_hint, logo_note, tagline, price, brand_name, "ko", template_id,
            )
        else:
            result = _generate_detail(
                user_id, gen_id, reference_images, product_name, description, style_hint, logo_note, model_note
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
            existing_bytes = supabase.storage.from_(GENERATED_BUCKET).download(img.path)
            existing_mime = "image/png" if img.path.lower().endswith(".png") else "image/jpeg"
            aspect_ratio = SLOT_ASPECT_RATIO.get(img.slot, "1:1")
            image_bytes, mime = _generate_image(edit_prompt, [(existing_bytes, existing_mime)], aspect_ratio)
            edited_images.append(_upload_generated_image(user_id, gen_id, img.slot, image_bytes, mime))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"이미지 수정에 실패했습니다: {friendly_ai_error(e)}")

    return {"layout": payload.layout, "images": edited_images}
