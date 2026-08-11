import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types 
from pydantic import BaseModel
from supabase import Client, create_client

from fill_docx import fill_document

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

TEMPLATES_BUCKET = "templates"
GENERATED_BUCKET = "generated"
AI_FIELD_TYPES = {"long_text", "checkbox"}
VALID_FIELD_TYPES = {"text", "number", "date", "select", "checkbox", "textarea", "long_text"}

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

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


@app.delete("/account")
def delete_account(authorization: str | None = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")

    token = authorization.split(" ", 1)[1]
    user_res = supabase.auth.get_user(token)
    if not user_res or not user_res.user:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

    # profiles 행은 auth.users FK에 on delete cascade 로 걸려 있어 함께 삭제된다.
    supabase.auth.admin.delete_user(user_res.user.id)
    return {"deleted": True}


def require_admin(authorization: str | None) -> str:
    """bearer 토큰을 검증하고 profiles.account_type == 'admin'인지 확인한다.
    성공 시 user_id를 반환하고, 실패 시 HTTPException을 던진다."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")

    token = authorization.split(" ", 1)[1]
    user_res = supabase.auth.get_user(token)
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
    object_path = f"{business_id}/{uuid.uuid4().hex}_{file.filename}"

    supabase.storage.from_(TEMPLATES_BUCKET).upload(
        object_path,
        file_bytes,
        {
            "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "upsert": "false",
        },
    )

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
    subprocess.run(
        [find_soffice(), "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(docx_path)],
        check=True,
        timeout=120,
    )
    return out_dir / (docx_path.stem + ".pdf")


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

    return {
        "submission_id": submission_id,
        "review_status": updated["review_status"],
        "review_note": updated["review_note"],
    }
