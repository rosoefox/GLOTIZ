"""
fill_docx.py
서류 자동생성 파이프라인의 핵심 함수 모음.

사용 흐름:
  1. Storage에서 template의 원본 DOCX를 내려받는다
  2. submission_values를 기반으로 values 딕셔너리를 만든다 (field_key -> value)
  3. fill_document()를 호출해 placeholder 치환 + 체크박스 표시 + 노란 하이라이트까지 한 번에 처리
  4. 결과 DOCX를 PDF로 변환 (LibreOffice headless) 후 Storage 'generated' 버킷에 업로드

설치: pip install python-docx
"""

from docx import Document
from docx.enum.text import WD_COLOR_INDEX


def _iter_all_paragraphs(doc):
    """본문 + 모든 표(중첩 표 포함) 안의 문단을 전부 순회"""
    for p in doc.paragraphs:
        yield p
    for table in doc.tables:
        yield from _iter_table_paragraphs(table)


def _iter_table_paragraphs(table):
    for row in table.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                yield p
            for nested in cell.tables:
                yield from _iter_table_paragraphs(nested)


def replace_placeholders(doc, values: dict, review_fields: set = None):
    """
    본문/표 안의 {{field_key}} 를 실제 값으로 치환한다.
    review_fields에 포함된 field_key는 치환된 텍스트에 노란 하이라이트를 입힌다
    (= AI가 확신이 낮아 사용자가 검수해야 하는 값).

    values: {"company_name_kr": "테크노파크", "founded_date": "2020.01.01", ...}
    review_fields: {"company_intro_kr", ...}  # needs_review=true인 field_key 모음
    """
    review_fields = review_fields or set()

    for p in _iter_all_paragraphs(doc):
        full_text = p.text
        if '{{' not in full_text:
            continue

        # 이 문단에 들어있는 모든 {{field_key}} 를 찾아 치환
        for field_key, value in values.items():
            token = '{{' + field_key + '}}'
            if token not in full_text:
                continue
            full_text = full_text.replace(token, str(value) if value is not None else '')

        # 기존 run들을 지우고 하나의 run으로 다시 씀 (서식은 첫 run 기준 유지)
        needs_highlight = any(
            '{{' + fk + '}}' in p.text and fk in review_fields
            for fk in values
        )
        if p.runs:
            first_run = p.runs[0]
            for run in p.runs[1:]:
                run.text = ''
            first_run.text = full_text
            if needs_highlight:
                first_run.font.highlight_color = WD_COLOR_INDEX.YELLOW
        else:
            p.add_run(full_text)


def mark_checkboxes(doc, checkbox_selections: dict):
    """
    '□ 옵션텍스트' 형태의 체크박스를 선택값에 따라 '☑ 옵션텍스트' 로 바꾼다.
    옵션 텍스트가 문서 전체에서 고유하다는 전제 (예: '법인', 'K-AI&테크' 등).

    checkbox_selections: {"company_type": "법인", "business_field": "K-뷰티", ...}
      값이 list인 경우(복수 선택) 여러 개를 동시에 체크 처리한다.
    """
    # 선택된 옵션 텍스트 집합으로 평탄화
    selected_options = set()
    for field_key, value in checkbox_selections.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            selected_options.update(value)
        else:
            selected_options.add(value)

    if not selected_options:
        return

    for p in _iter_all_paragraphs(doc):
        if '□' not in p.text:
            continue
        for option in selected_options:
            target = f'□ {option}'
            if target in p.text:
                new_text = p.text.replace(target, f'☑ {option}')
                if p.runs:
                    p.runs[0].text = new_text
                    for run in p.runs[1:]:
                        run.text = ''
                else:
                    p.add_run(new_text)


def fill_document(template_path: str, output_path: str, values: dict,
                   checkbox_selections: dict = None, review_fields: set = None):
    """
    전체 파이프라인 한 번에 실행: 원본 template 열기 -> 치환/체크 -> 저장
    """
    doc = Document(template_path)
    replace_placeholders(doc, values, review_fields)
    if checkbox_selections:
        mark_checkboxes(doc, checkbox_selections)
    doc.save(output_path)
    return output_path


# ---------------- 사용 예시 ----------------
if __name__ == '__main__':
    values = {
        'company_name_kr': '(주)테크노파크',
        'founded_date': '2020.03.15',
        'ceo_name': '홍길동',
        'business_reg_number': '123-45-67890',
        'main_product': '스킨케어 화장품',
        'phone_number': '063-000-0000',
        'website': 'https://example.com',
        'company_address': '전북 전주시 ...',
        'company_intro_kr': 'AI가 생성한 국문 소개 문구...',
        # ... 나머지 필드도 동일하게 채움
    }

    checkbox_selections = {
        'company_type': '법인',
        'product_category': '소비재',
        'business_field': 'K-뷰티',
    }

    # needs_review=true 로 표시된 필드 (예: AI가 생성한 소개문, 확신 낮은 값)
    review_fields = {'company_intro_kr', 'company_intro_en'}

    fill_document(
        template_path='form1_application_placeholder.docx',
        output_path='generated_form1.docx',
        values=values,
        checkbox_selections=checkbox_selections,
        review_fields=review_fields,
    )
    print('완성된 문서 생성됨: generated_form1.docx')
