
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

import re

from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")
CHECKBOX_OPTION_RE = re.compile(r"□\s*([^\s□☑]+(?:\s[^\s□☑]+)*)")
# 빈칸 표시로 흔히 쓰이는 패턴들: 공백/전각공백/줄바꿈없는공백 2칸+, 밑줄 3개+, 탭,
# 마침표/가운뎃점 점선(．…‥ 등) 3개+, 빈 괄호. 원래는 공백/밑줄만 잡아서 표 라벨이
# 아래쪽 셀에 있거나 점선으로 빈칸을 표시하는 서식은 후보 자체가 안 생겼었다.
BLANK_RUN_RE = re.compile(r"[  　\t]{4,}|_{3,}|[.．…‥·]{3,}|\(\s*\)")
MAX_LABEL_LEN = 20
INLINE_BLANK_MIN_WIDTH = 4


def _iter_textbox_paragraphs(doc):
    """텍스트박스(도형) 안의 문단을 찾아 순회한다.

    python-docx의 기본 .paragraphs/.tables 순회는 텍스트박스(w:txbxContent) 안쪽을
    그림/도형의 일부로 취급해서 아예 보지 않는다. 한글(HWP)에서 변환했거나 칸을
    정밀하게 배치한 서식은 라벨/빈칸을 텍스트박스 안에 넣는 경우가 흔해서, 이걸
    빼먹으면 필드가 후보로 뽑히지도 않는다 (레거시 VML v:textbox, DrawingML wps:txbx
    둘 다 내부 구조는 w:txbxContent로 동일해서 태그 하나로 같이 잡힌다).
    """
    for txbx in doc.element.body.iter(qn("w:txbxContent")):
        for p in txbx.findall(qn("w:p")):
            yield Paragraph(p, doc)


def _iter_all_paragraphs(doc):
    """본문 + 모든 표(중첩 표 포함) + 텍스트박스 안의 문단을 전부 순회"""
    for p in doc.paragraphs:
        yield p
    for table in doc.tables:
        yield from _iter_table_paragraphs(table)
    yield from _iter_textbox_paragraphs(doc)


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


def extract_docx_fields(doc) -> tuple[list[str], list[str]]:
    """문서 안의 {{field_key}} 플레이스홀더와 '□ 옵션텍스트' 체크박스 후보를 스캔한다.
    ({{}} 은 field_key가 이미 정해져 있어 그대로 뽑히지만, □ 옵션은 어떤 필드로
    묶여야 할지 문서만 봐선 알 수 없어서 원문 텍스트 목록만 반환한다 — 그룹핑은
    호출하는 쪽에서 AI로 판단한다.)"""
    field_keys = []
    seen = set()
    checkbox_options = []
    seen_checkbox = set()

    for p in _iter_all_paragraphs(doc):
        text = p.text
        if "{{" in text:
            for m in PLACEHOLDER_RE.finditer(text):
                key = m.group(1)
                if key not in seen:
                    seen.add(key)
                    field_keys.append(key)
        if "□" in text:
            for m in CHECKBOX_OPTION_RE.finditer(text):
                option = m.group(1).strip()
                if option and option not in seen_checkbox:
                    seen_checkbox.add(option)
                    checkbox_options.append(option)

    return field_keys, checkbox_options


def _row_cells_deduped(row):
    """가로 병합된 셀은 python-docx가 같은 셀 객체를 반복 반환하므로,
    tc 엘리먼트 동일성 기준으로 중복을 제거한 셀 목록을 돌려준다."""
    cells = []
    prev_tc = None
    for cell in row.cells:
        if cell._tc is prev_tc:
            continue
        prev_tc = cell._tc
        cells.append(cell)
    return cells


def _cell_text(cell):
    return re.sub(r"\s+", " ", cell.text).strip()


def _context_from_table_grid(rows, r, c):
    """표의 빈 데이터 셀에 대해 왼쪽 행 라벨 + 위쪽 열 헤더를 조합한다."""
    row_labels = []
    for left in range(c):
        text = _cell_text(rows[r][left])
        if text and len(text) <= MAX_LABEL_LEN and text not in row_labels:
            row_labels.append(text)

    col_labels = []
    for up in range(r - 1, -1, -1):
        if c >= len(rows[up]):
            continue
        text = _cell_text(rows[up][c])
        if text and len(text) <= MAX_LABEL_LEN and text not in col_labels:
            col_labels.insert(0, text)

    labels = row_labels + col_labels
    if len(labels) < 2:
        return None
    return " > ".join(labels)


def _is_probable_inline_blank(text, match_text, start, end):
    """문장 서식용 공백을 입력칸으로 오탐하지 않도록 inline 후보를 좁힌다."""
    stripped = text.strip()
    if not stripped:
        return False

    is_visible_blank = bool(re.fullmatch(r"_{3,}|[.．…‥·]{3,}|\(\s*\)", match_text))
    if is_visible_blank:
        return True

    if len(match_text) < INLINE_BLANK_MIN_WIDTH:
        return False

    before = text[:start].strip()
    after = text[end:].strip()
    if not before:
        return False

    # 안내문/설명문처럼 이미 긴 문장이 있는 줄의 자간, 들여쓰기, 불릿 뒤 공백은 빈칸이 아니다.
    if before.startswith(("○", "o", "-", "*", "※")) or stripped.startswith(("○", "o", "-", "*", "※")):
        return False
    if len(before) > MAX_LABEL_LEN and not re.search(r"[:：]$", before):
        return False
    if after and len(after) > MAX_LABEL_LEN and not re.match(r"^(원|백만원|천원|USD|달러|%|명|개|건|년|월|일)\b", after):
        return False

    return True


SECTION_HEADER_RE = re.compile(r"^\s*\d+\s*[.\)]\s*(\S.*)$")


def _build_section_map(doc):
    """본문을 순서대로 훑으면서 'N. 제목' 형태의 문단을 만날 때마다, 그 뒤에 나오는
    모든 문단/표를 그 섹션 소속으로 표시한다. 필드가 원본 문서의 몇 번 항목에
    속하는지(예: "인증 제품의 현황...") 알아내기 위한 것 - 문서에 이런 번호
    헤더가 없으면 전부 None이 된다. 화면에 보여줄 땐 STEP 번호와 헷갈리니 앞의
    'N.' 자체는 잘라내고 제목만 남긴다."""
    section_map = {}
    current_section = None
    for child in doc.element.body:
        tag = child.tag.split("}")[-1]
        if tag == "p":
            text = "".join(n.text or "" for n in child.iter(qn("w:t"))).strip()
            m = SECTION_HEADER_RE.match(text)
            if m:
                current_section = m.group(1).strip()[:80]
            section_map[id(child)] = current_section
        elif tag == "tbl":
            section_map[id(child)] = current_section
    return section_map


def _section_for_element(elem, section_map):
    cur = elem
    while cur is not None:
        if id(cur) in section_map:
            return section_map[id(cur)]
        cur = cur.getparent()
    return None


def detect_blank_candidates(doc):
    """{{}} 자리표시자가 전혀 없는 원본 서식에서, 채워야 할 빈칸으로 보이는 후보를 찾는다.

    세 가지 패턴을 본다:
      1) 표에서 라벨 텍스트 셀 오른쪽에 오는 빈 셀 (예: '기업명' | (빈칸)) - 가로형 라벨
      2) 표에서 라벨 텍스트 셀 바로 아래 행, 같은 열에 오는 빈 셀 - 세로형 라벨(라벨이
         위 칸, 값이 아래 칸인 서식 - 한국 정부 서식에 흔한데 원래는 못 찾았다)
      3) 문단 텍스트 안의 공백/밑줄/점선/빈괄호 (예: '총 매출액 :        백만원',
         '성명 ‥‥‥‥‥‥')

    같은 셀이 1)과 2) 양쪽에서 중복으로 후보가 되지 않도록 이미 쓴 셀은 건너뛴다.
    각 후보는 실제 문서 객체(cell 또는 paragraph)에 대한 참조를 담고 있어서,
    나중에 채택된 후보만 apply_blank_field()로 실제 {{field_key}} 치환이 가능하다.
    """
    candidates = []
    used_cell_ids = set()
    section_map = _build_section_map(doc)

    for table in doc.tables:
        grid_rows = [list(row.cells) for row in table.rows]

        # 0) 교차표형: 행 라벨과 열 헤더가 만나는 빈 데이터 셀.
        # 예: '수출대상국가수 > 업체전체 > 인증 획득 전(2025년)'.
        for r, cells in enumerate(grid_rows):
            for c, blank_cell in enumerate(cells):
                if blank_cell.text.strip() or id(blank_cell._tc) in used_cell_ids:
                    continue
                context = _context_from_table_grid(grid_rows, r, c)
                if not context:
                    continue
                used_cell_ids.add(id(blank_cell._tc))
                section = _section_for_element(blank_cell._tc, section_map)
                candidates.append({"kind": "cell", "context": context, "cell": blank_cell, "section": section})

        rows = [_row_cells_deduped(row) for row in table.rows]

        # 1) 가로형: 라벨 셀 바로 오른쪽 셀이 빈칸.
        for cells in rows:
            for i in range(len(cells) - 1):
                label = cells[i].text.strip()
                blank_cell = cells[i + 1]
                if not label or len(label) > MAX_LABEL_LEN or blank_cell.text.strip():
                    continue
                if id(blank_cell._tc) in used_cell_ids:
                    continue
                used_cell_ids.add(id(blank_cell._tc))
                row_context = " > ".join(
                    c.text.strip() for c in cells[: i + 1] if c.text.strip()
                )
                section = _section_for_element(blank_cell._tc, section_map)
                candidates.append({"kind": "cell", "context": row_context, "cell": blank_cell, "section": section})

        # 2) 세로형: 라벨 셀 바로 아래 행의 같은 열 셀이 빈칸.
        for r in range(len(rows) - 1):
            for c in range(min(len(rows[r]), len(rows[r + 1]))):
                label_cell = rows[r][c]
                blank_cell = rows[r + 1][c]
                label = label_cell.text.strip()
                if (
                    not label
                    or len(label) > MAX_LABEL_LEN
                    or blank_cell.text.strip()
                    or blank_cell._tc is label_cell._tc  # 세로 병합된 같은 셀
                    or id(blank_cell._tc) in used_cell_ids
                ):
                    continue
                used_cell_ids.add(id(blank_cell._tc))
                section = _section_for_element(blank_cell._tc, section_map)
                candidates.append({"kind": "cell", "context": label, "cell": blank_cell, "section": section})

    paragraphs = list(_iter_all_paragraphs(doc))
    for i, p in enumerate(paragraphs):
        text = p.text
        for m in BLANK_RUN_RE.finditer(text):
            if not _is_probable_inline_blank(text, m.group(0), m.start(), m.end()):
                continue
            anchor_before = text[max(0, m.start() - 15):m.start()]
            anchor_after = text[m.end():m.end() + 15]
            context_label = anchor_before.strip()
            if not context_label and not anchor_after.strip():
                # 문단 전체가 빈칸뿐인 경우(제목 문단 아래 통째로 비어있는 서술형
                # 답란 - "N. 제목" 다음 줄에 답을 쓰게 한 서식에 흔함) 같은 문단
                # 안에는 문맥이 전혀 없다. 바로 위, 가장 가까운 비어있지 않은
                # 문단(보통 그 섹션 제목)을 문맥으로 끌어온다.
                for j in range(i - 1, -1, -1):
                    prev_text = paragraphs[j].text.strip()
                    if prev_text:
                        context_label = prev_text[:80]
                        break
            candidates.append({
                "kind": "inline",
                "context": f"{context_label} [[빈칸]] {anchor_after.strip()}".strip(),
                "paragraph": p,
                "anchor_before": anchor_before,
                "match_text": m.group(0),
                "anchor_after": anchor_after,
                "section": _section_for_element(p._p, section_map),
            })

    return candidates


def apply_blank_field(candidate, field_key):
    """detect_blank_candidates가 찾은 후보 하나를 실제로 {{field_key}}로 치환한다."""
    token = "{{" + field_key + "}}"

    if candidate["kind"] == "cell":
        cell = candidate["cell"]
        p = cell.paragraphs[0] if cell.paragraphs else cell.add_paragraph()
        full_text = token
    else:
        p = candidate["paragraph"]
        search = candidate["anchor_before"] + candidate["match_text"] + candidate["anchor_after"]
        replacement = candidate["anchor_before"] + token + candidate["anchor_after"]
        full_text = p.text.replace(search, replacement, 1)
        if full_text == p.text:
            # 같은 문단의 다른 빈칸을 먼저 채워 앵커가 어긋난 경우, match_text만으로 재시도
            full_text = p.text.replace(candidate["match_text"], token, 1)

    if p.runs:
        p.runs[0].text = full_text
        for run in p.runs[1:]:
            run.text = ""
    else:
        p.add_run(full_text)


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
