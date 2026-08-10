import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
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
