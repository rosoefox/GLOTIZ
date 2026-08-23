"""real_forms_text/*.txt (HWP/HWPX PrvText, <라벨><값> 괄호쌍 구조)를 파싱해서
실제 문서에서 나온 (라벨 -> 빈칸) 후보를 뽑고, 알려진 표준 어휘 사전과 매칭되는 것만
자동으로 field_key/type을 확정한다. 매칭 안 되는 낯선 라벨은 절대 추측해서 채우지 않고
review_needed 목록으로 따로 뺀다 (실제로 읽어서 확인한 것만 학습 데이터로 씀).
"""

import glob
import json
import os
import re

TEXT_DIR = os.path.join(os.path.dirname(__file__), "real_forms_text")

BRACKET_RE = re.compile(r"<([^<>]*)>")

# 지금까지 실제로 읽은 문서들(통상마스터Youth, 해외파트너사, MTA HANOI, 중간평가보고서 등)에서
# 확인한 표준 라벨 -> (field_key, field_type). normalize()로 공백/괄호 제거 후 매칭.
KNOWN_FIELDS = {
    "기업명": ("company_name", "text"),
    "회사명": ("company_name", "text"),
    "업체명": ("company_name", "text"),
    "상호명": ("company_name", "text"),
    "신청기업": ("company_name", "text"),
    "대표자": ("ceo_name", "text"),
    "대표자명": ("ceo_name", "text"),
    "성명대표자": ("ceo_name", "text"),
    "사업자등록번호": ("business_reg_number", "text"),
    "사업자번호": ("business_reg_number", "text"),
    "사업자등록일": ("business_reg_date", "date"),
    "설립일": ("founded_date", "date"),
    "설립일자": ("founded_date", "date"),
    "연락처": ("phone_number", "text"),
    "전화번호": ("phone_number", "text"),
    "유선전화": ("phone_number", "text"),
    "HP": ("mobile_phone", "text"),
    "휴대전화": ("mobile_phone", "text"),
    "휴대전화번호": ("mobile_phone", "text"),
    "팩스": ("fax_number", "text"),
    "FAX": ("fax_number", "text"),
    "이메일": ("email", "text"),
    "Email": ("email", "text"),
    "email": ("email", "text"),
    "주소": ("company_address", "text"),
    "소재지": ("company_address", "text"),
    "사업장주소": ("company_address", "text"),
    "홈페이지": ("website", "text"),
    "홈페이지주소": ("website", "text"),
    "웹사이트": ("website", "text"),
    "상시종업원수": ("employee_count", "number"),
    "상시근로자수": ("employee_count", "number"),
    "직원수": ("employee_count", "number"),
    "종업원수": ("employee_count", "number"),
    "수출실적": ("export_performance", "number"),
    "직전년도수출실적": ("export_performance", "number"),
    "매출액": ("annual_revenue", "number"),
    "주요생산품목": ("main_product", "text"),
    "주요취급품목": ("main_product", "text"),
    "주력제품": ("main_product", "text"),
    "주요제품": ("main_product", "text"),
    "취급품목": ("main_product", "text"),
    "주요수출국": ("main_export_country", "text"),
    "담당자": ("contact_person", "text"),
    "담당자성명": ("contact_person", "text"),
    "성명담당자": ("contact_person", "text"),
    "부서직위": ("department_position", "text"),
    "부서명": ("department", "text"),
    "직위": ("position", "text"),
    "신청일": ("application_date", "date"),
    "신청일자": ("application_date", "date"),
    "작성일자": ("application_date", "date"),
    "은행명": ("bank_name", "text"),
    "거래은행": ("bank_name", "text"),
    "계좌번호": ("account_number", "text"),
    "예금주": ("account_holder", "text"),
    "생년월일": ("birth_date", "date"),
    "대표자생년월일": ("ceo_birth_date", "date"),
    "Email": ("email", "text"),
    "Emil": ("email", "text"),
    "전자우편": ("email", "text"),
    "법인등록번호": ("corporate_reg_number", "text"),
    "담당자명": ("contact_person", "text"),
    "휴대폰번호": ("mobile_phone", "text"),
    "팩스번호": ("fax_number", "text"),
    "사무실전화번호": ("office_phone", "text"),
    "회사전화": ("office_phone", "text"),
    "설립년도": ("founded_year", "number"),
    "소속": ("department", "text"),
    "소속부서": ("department", "text"),
    "소속명": ("department", "text"),
    "고용인원": ("employee_count", "number"),
    "업태": ("business_type", "text"),
    "업종": ("business_category", "text"),
    "업태업종": ("business_type", "text"),
    # 2차 리뷰 - 실제 문서(전시회 참가신청서, 통상마스터 시리즈, 해외파트너사 등) 재확인 후 추가
    "성명": ("applicant_name", "text"),
    "주요생산품": ("main_product", "text"),
    "주요품목": ("main_product", "text"),
    "주생산품": ("main_product", "text"),
    "전시제품": ("exhibit_product", "text"),
    "출품품목": ("exhibit_product", "text"),
    "취급제품및HSCODE": ("main_product_hs_code", "text"),
    "전시회명": ("exhibition_name", "text"),
    "개최기간": ("event_period", "text"),
    "기간": ("event_period", "text"),
    "국가및도시": ("event_country_city", "text"),
    "개최국가도시": ("event_country_city", "text"),
    "전시장": ("event_venue", "text"),
    "초청강사": ("guest_lecturer", "text"),
    "직책": ("position", "text"),
    "직통번호": ("direct_phone_number", "text"),
    "직통전화번호": ("direct_phone_number", "text"),
    "희망분야": ("desired_consulting_area", "checkbox"),
    "제품특성": ("product_characteristics", "long_text"),
    "제품경쟁력": ("product_competitiveness", "long_text"),
    "기술경쟁력": ("technical_competitiveness", "long_text"),
    "수출제품용도및특성": ("product_usage_and_characteristics", "long_text"),
    "수출제품의기술경쟁력": ("technical_competitiveness", "long_text"),
    "주민등록번호": ("resident_reg_number", "text"),
    "주민등록번호앞6자리": ("resident_reg_number_partial", "text"),
    "전화": ("phone_number", "text"),
    "부서": ("department", "text"),
    "회사소개": ("company_intro", "long_text"),
    "2025년수출액": ("export_performance", "number"),
    "수출국가": ("main_export_country", "text"),
    "수출품목": ("main_product", "text"),
    "매출액작년기준": ("annual_revenue", "number"),
    "2025년매출액참고용": ("annual_revenue", "number"),
    "수출액": ("export_performance", "number"),
    "금액": ("amount", "number"),
    "참가신청기업명": ("company_name", "text"),
    "휴대폰": ("mobile_phone", "text"),
    "회사주소소재지": ("company_address", "text"),
    "수출회사명바이어사": ("buyer_company_name", "text"),
    "제조공장소재지": ("factory_address", "text"),
    "설립년월일": ("founded_date", "date"),
    "Mobile": ("mobile_phone", "text"),
    "Website": ("website", "text"),
    "Websit": ("website", "text"),
    "CompanyName회사명": ("company_name", "text"),
    "Usage품목용도": ("product_usage", "text"),
    "업체주소": ("company_address", "text"),
    "MOQEA": ("moq", "number"),
    "판매희망수량EA": ("desired_sales_quantity", "number"),
    "창업제품서비스명": ("product_service_name", "text"),
    "특기사항": ("special_notes", "long_text"),
}

# (국문)/(영문) 접미사 붙은 라벨을 위한 언어별 접미 처리: 베이스 라벨이 KNOWN_FIELDS에
# 있으면 field_key에 _kr/_en 만 붙여서 파생시킨다 (사전 새로 안 늘려도 됨).
# 문자열 어디에 있어도 잡히게(끝고정 X) - "업태(국문) (사업자등록증상)"같은 경우도 처리.
LANG_SUFFIX_RE = re.compile(r"[\(（]\s*(국문|영문)\s*[\)）]")
LANG_SUFFIX_MAP = {"국문": "kr", "영문": "en"}

# 진짜 필드가 아니라 장식/레이아웃/문서구조인데 형태만 <라벨><빈칸>처럼 보이는 것들
SKIP_LABELS = {"", "-", "구분", "비고", "번호", "국문", "영문", "목차", "붙임", "한글", "영어"}
JUNK_RE = re.compile(r"^[\d,.\s년월일]+$")  # 순수 숫자/날짜조각/연도만 있는 건 라벨이 아님

# 실제로 읽어서 "진짜 빈칸이 아니다"라고 확인한 패턴들 - skip=true 학습 신호로 그대로 사용.
# (체크박스 옵션 설명문, 첨부번호/서식번호 같은 구조 마커, 순수 안내문구)
CONFIRMED_SKIP_RE = re.compile(
    r"(등$|안내$|참조$|참고용$|첨부$|해당|기재\)?$|증빙|서식\s*\d+$|붙임\s*\d+$|"
    r"추가\s*가능|작성\s*[XO×]|사업신청일\s*기준|한국어\s*또는\s*외국어|KTNET|"
    r"동의서$|절차\s*등$|수행\s*등$|교육\s*등$|지원\s*등\)?$)"
)


def normalize(label: str) -> str:
    return re.sub(r"[\s()/.·,:：\-]", "", label)


_KNOWN_FIELDS_CI = {k.lower(): v for k, v in KNOWN_FIELDS.items()}


def looks_like_label(s: str) -> bool:
    s = s.strip()
    if not s or len(s) > 20:
        return False
    if JUNK_RE.match(s):
        return False
    if re.search(r"[.!?][^)]*$", s) and len(s) > 12:
        # 문장형(설명문)은 라벨이 아닐 확률이 높음
        return False
    return True


def resolve_field(label: str):
    """라벨 문자열 -> (field_key, field_type) 또는 None. (국문)/(영문) 접미사 처리 포함,
    영문 라벨은 대소문자 구분 없이 매칭."""
    key = normalize(label)
    if key in KNOWN_FIELDS:
        return KNOWN_FIELDS[key]
    if key.lower() in _KNOWN_FIELDS_CI:
        return _KNOWN_FIELDS_CI[key.lower()]

    m = LANG_SUFFIX_RE.search(label.strip())
    if m:
        base = label[: m.start()].strip()
        base_key = normalize(base)
        resolved_base = KNOWN_FIELDS.get(base_key) or _KNOWN_FIELDS_CI.get(base_key.lower())
        if resolved_base:
            field_key, field_type = resolved_base
            suffix = LANG_SUFFIX_MAP[m.group(1)]
            return (f"{field_key}_{suffix}", field_type)
    return None


def is_confirmed_skip(label: str) -> bool:
    return bool(CONFIRMED_SKIP_RE.search(label.strip()))


def parse_file(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()

    candidates = []
    for line in text.splitlines():
        tokens = BRACKET_RE.findall(line)
        i = 0
        while i < len(tokens) - 1:
            label, value = tokens[i], tokens[i + 1]
            label_norm = normalize(label)
            if (
                looks_like_label(label)
                and label_norm not in SKIP_LABELS
                and value.strip() == ""
            ):
                candidates.append(label.strip())
                i += 2
                continue
            i += 1
    return candidates


def main():
    matched = []  # (source_file, label, field_key, field_type)
    confirmed_skip = []  # (source_file, label) - 실제로 확인한 장식/설명문, skip=true 학습용
    review_needed = []  # (source_file, label)
    per_file_counts = {}

    for path in sorted(glob.glob(os.path.join(TEXT_DIR, "*.txt"))):
        name = os.path.basename(path)
        cands = parse_file(path)
        per_file_counts[name] = len(cands)
        seen_in_file = set()
        for label in cands:
            key = normalize(label)
            if key in seen_in_file:
                continue
            seen_in_file.add(key)
            resolved = resolve_field(label)
            if resolved:
                field_key, field_type = resolved
                matched.append({"source": name, "label": label, "field_key": field_key, "field_type": field_type})
            elif is_confirmed_skip(label):
                confirmed_skip.append({"source": name, "label": label})
            else:
                review_needed.append({"source": name, "label": label})

    print("총 후보(중복 포함):", sum(per_file_counts.values()))
    print("자동 확정(matched, skip=false):", len(matched))
    print("확정 skip(skip=true):", len(confirmed_skip))
    print("검토 필요(review_needed):", len(review_needed))

    with open("matched_fields.json", "w", encoding="utf-8") as f:
        json.dump(matched, f, ensure_ascii=False, indent=2)
    with open("confirmed_skip.json", "w", encoding="utf-8") as f:
        json.dump(confirmed_skip, f, ensure_ascii=False, indent=2)
    with open("review_needed.json", "w", encoding="utf-8") as f:
        json.dump(review_needed, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
