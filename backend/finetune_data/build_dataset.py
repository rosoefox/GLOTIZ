"""
빈칸 후보 -> 필드 메타데이터 판단(call_gemini_blank_candidates) 파인튜닝용 데이터셋 생성기.

main.py의 build_blank_candidate_prompt()와 완전히 동일한 프롬프트 포맷을 그대로
복제해서 사용한다 (main.py를 직접 import하면 모듈 로드 시점에 Cloud SQL 연결을
시도해서 지금처럼 DB가 막혀있으면 import 자체가 실패하기 때문에, 여기서는 독립
실행되도록 프롬프트 생성 로직만 복제했다).

각 "document"는 실제 서비스에서 한 번의 AI 호출에 해당하는 후보 묶음이고,
JSONL 한 줄 = 학습 예시 하나(user 턴 = 프롬프트, model 턴 = 정답 JSON).
"""

import json
import random

random.seed(42)


def build_prompt(business_name, template_name, candidates):
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


# 표준 한국 정부/지자체 소상공인 수출지원사업 서식에 반복적으로 나오는 필드들.
# 각 항목: (컨텍스트 문자열 변형들, 정답 필드 메타)
STANDARD_FIELDS = [
    (["기업명", "상호명", "회사명 [[빈칸]]", "업체명 > [[빈칸]]"],
     dict(field_key="company_name", field_label="기업명", field_type="text")),
    (["대표자명", "대표자 > [[빈칸]]", "성명(대표자) [[빈칸]]"],
     dict(field_key="ceo_name", field_label="대표자명", field_type="text")),
    (["사업자등록번호", "사업자등록번호 : [[빈칸]]", "사업자등록번호 > [[빈칸]]"],
     dict(field_key="business_reg_number", field_label="사업자등록번호", field_type="text")),
    (["설립일", "개업연월일 [[빈칸]]", "설립일자 > [[빈칸]]"],
     dict(field_key="founded_date", field_label="설립일", field_type="date")),
    (["연락처", "전화번호 [[빈칸]]", "휴대전화 > [[빈칸]]"],
     dict(field_key="phone_number", field_label="연락처", field_type="text")),
    (["이메일", "e-mail [[빈칸]]", "전자우편 > [[빈칸]]"],
     dict(field_key="email", field_label="이메일", field_type="text")),
    (["소재지", "사업장 주소 [[빈칸]]", "주소 > [[빈칸]]"],
     dict(field_key="company_address", field_label="소재지", field_type="text")),
    (["홈페이지", "홈페이지 주소 [[빈칸]]", "웹사이트 > [[빈칸]]"],
     dict(field_key="website", field_label="홈페이지", field_type="text")),
    (["주요제품", "주요 취급품목 [[빈칸]]", "주력제품 > [[빈칸]]"],
     dict(field_key="main_product", field_label="주요제품", field_type="text")),
    (["종업원수", "상시근로자수 [[빈칸]]", "직원수 > [[빈칸]]"],
     dict(field_key="employee_count", field_label="종업원수", field_type="number")),
    (["전년도 매출액", "매출액(전년도) : [[빈칸]] 백만원", "연매출 > [[빈칸]]"],
     dict(field_key="annual_revenue", field_label="전년도 매출액", field_type="number")),
    (["수출실적", "전년도 수출실적 [[빈칸]] 달러", "수출액 > [[빈칸]]"],
     dict(field_key="export_performance", field_label="수출실적", field_type="number")),
    (["은행명", "거래은행 [[빈칸]]", "입금은행 > [[빈칸]]"],
     dict(field_key="bank_name", field_label="은행명", field_type="text")),
    (["계좌번호", "계좌번호 [[빈칸]]", "입금계좌 > [[빈칸]]"],
     dict(field_key="account_number", field_label="계좌번호", field_type="text")),
    (["예금주", "예금주명 [[빈칸]]", "계좌명의 > [[빈칸]]"],
     dict(field_key="account_holder", field_label="예금주", field_type="text")),
    (["팩스번호", "FAX [[빈칸]]", "팩스 > [[빈칸]]"],
     dict(field_key="fax_number", field_label="팩스번호", field_type="text")),
    (["신청일자", "신청일 [[빈칸]]", "작성일자 > [[빈칸]]"],
     dict(field_key="application_date", field_label="신청일자", field_type="date")),
    (["담당자명", "실무담당자 [[빈칸]]", "담당자 > [[빈칸]]"],
     dict(field_key="contact_person", field_label="담당자명", field_type="text")),
    (["부서명", "소속부서 [[빈칸]]", "담당부서 > [[빈칸]]"],
     dict(field_key="department", field_label="부서명", field_type="text")),
    (["희망 참가국가", "참가 희망국 [[빈칸]]", "수출 희망국가 > [[빈칸]]"],
     dict(field_key="target_country", field_label="희망 참가국가", field_type="text")),
    (["업종 □ 제조업 □ 도소매업 □ 서비스업"],
     dict(field_key="business_category", field_label="업종", field_type="checkbox",
          options=["제조업", "도소매업", "서비스업"])),
    (["구분 □ 법인 □ 개인사업자"],
     dict(field_key="entity_type", field_label="사업자 구분", field_type="checkbox",
          options=["법인", "개인사업자"])),
    (["회사 소개 및 사업 계획 [[빈칸]]", "사업 개요 > [[빈칸]]"],
     dict(field_key="company_intro", field_label="회사 소개", field_type="long_text")),
]

# 장식용/레이아웃용이라 skip=true 여야 하는 케이스들 (실제로 헷갈리기 쉬운 부분)
DECORATIVE = [
    "- 1 -",
    "신청서 작성 안내 [[빈칸]]",
    "※ 아래 내용을 참고하시기 바랍니다 [[빈칸]]",
    "(서명 또는 인)",
    "붙임 > [[빈칸]]",
    "※ [[빈칸]]",
    "구분 > [[빈칸]]",  # 표 헤더 셀 자체가 빈칸으로 오탐된 경우
]

BUSINESS_NAMES = [
    "2026년 전북 소상공인 해외수출 지원사업",
    "경기도 중소기업 수출바우처 지원사업",
    "서울시 소상공인 온라인 판로개척 지원사업",
]
TEMPLATE_NAMES = [
    "참가신청서", "사업 신청서", "신청서(소상공인용)", "수출지원 신청서",
]


def make_document(field_pool, n_real, n_decorative, rng):
    chosen_real = rng.sample(field_pool, n_real)
    chosen_deco = rng.sample(DECORATIVE, min(n_decorative, len(DECORATIVE)))

    candidates = []
    answers = []
    items = []
    for variants, meta in chosen_real:
        items.append(("real", rng.choice(variants), meta))
    for deco_text in chosen_deco:
        items.append(("deco", deco_text, None))
    rng.shuffle(items)

    for idx, (kind, text, meta) in enumerate(items):
        candidates.append({"context": text})
        if kind == "real":
            ans = {"index": idx, "skip": False, **meta}
            ans.setdefault("options", [])
        else:
            ans = {"index": idx, "skip": True}
        answers.append(ans)

    business_name = rng.choice(BUSINESS_NAMES)
    template_name = rng.choice(TEMPLATE_NAMES)
    prompt = build_prompt(business_name, template_name, candidates)
    response_text = json.dumps(answers, ensure_ascii=False)
    return prompt, response_text, items


def build_examples(n_docs, field_pool, rng):
    examples = []
    meta_rows = []
    for _ in range(n_docs):
        n_real = rng.randint(4, 7)
        n_deco = rng.randint(1, 3)
        prompt, response_text, items = make_document(field_pool, n_real, n_deco, rng)
        examples.append({
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]},
                {"role": "model", "parts": [{"text": response_text}]},
            ]
        })
        meta_rows.append(items)
    return examples, meta_rows


def main():
    rng = random.Random(42)

    # 학습셋: 20개 문서 (~110개 개별 판단), 검증셋: 5개 문서(학습에 안 쓴 새 조합)
    train_examples, train_meta = build_examples(20, STANDARD_FIELDS, rng)
    eval_examples, eval_meta = build_examples(5, STANDARD_FIELDS, rng)

    with open("blank_candidates_train.jsonl", "w", encoding="utf-8") as f:
        for ex in train_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    with open("blank_candidates_eval.jsonl", "w", encoding="utf-8") as f:
        for ex in eval_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    # 사람이 훑어보기 쉬운 요약 (애매한/장식용 케이스 위주로 검토 포인트 남김)
    with open("dataset_review.md", "w", encoding="utf-8") as f:
        f.write("# 파인튜닝 데이터셋 검토용 요약\n\n")
        f.write(f"학습 문서 {len(train_examples)}개, 검증 문서 {len(eval_examples)}개.\n\n")
        f.write("## 표준 필드 목록 (객관적, 검토 거의 불필요)\n")
        for variants, meta in STANDARD_FIELDS:
            f.write(f"- {meta['field_key']} ({meta['field_label']}, {meta['field_type']})\n")
        f.write("\n## 장식용/skip 처리 케이스 (실제로 애매할 수 있는 부분 - 확인 부탁)\n")
        for d in DECORATIVE:
            f.write(f"- \"{d}\" -> skip=true 로 처리함. 실제 서식에서 이게 진짜 빈칸이 아닌지 확인 필요.\n")
        f.write("\n## 참고\n")
        f.write("실제 업로드된 서식(전북소상공인 해외수출지원사업 신청서 등)의 진짜 필드는 아직 "
                "포함 안 됨 - 파일을 프로젝트 폴더 안으로 옮겨주시거나 내용을 붙여넣어주시면 "
                "이 표준 패턴 위에 실제 서식 기반 예시를 추가할 수 있음.\n")

    print(f"train examples: {len(train_examples)}")
    print(f"eval examples: {len(eval_examples)}")


if __name__ == "__main__":
    main()
