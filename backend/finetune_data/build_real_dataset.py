"""matched_fields.json(skip=false 확정 필드) + confirmed_skip.json(skip=true 확정 장식/설명문)을
문서 단위로 묶어서 실제 운영 프롬프트/응답 포맷(call_gemini_blank_candidates)과 동일한 학습
예시로 변환한다. 합성 데이터는 전혀 섞지 않는다 - 전부 real_forms/real_forms_bizinfo에서
실제로 다운받은 문서에서 나온 라벨만 사용. skip=true 예시도 실제로 확인한 것만 섞어서,
데이터가 "쉬운 필드만" 쪽으로 편향되지 않게 한다.

문서(파일) 단위로 학습/검증을 분리한다 (같은 문서의 필드가 학습과 검증에 동시에 섞이지
않게 - 진짜 held-out 평가가 되도록).
"""

import json
import os
import random
from collections import defaultdict

HERE = os.path.dirname(__file__)
random.seed(7)


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


def main():
    with open(os.path.join(HERE, "matched_fields.json"), encoding="utf-8") as f:
        matched = json.load(f)
    with open(os.path.join(HERE, "confirmed_skip.json"), encoding="utf-8") as f:
        skips = json.load(f)

    by_source = defaultdict(list)
    for m in matched:
        by_source[m["source"]].append({"label": m["label"], "field_key": m["field_key"], "field_type": m["field_type"], "skip": False})
    for s in skips:
        by_source[s["source"]].append({"label": s["label"], "skip": True})

    for src in by_source:
        random.shuffle(by_source[src])  # skip=true/false가 배치 안에서 섞이도록

    sources = sorted(by_source.keys())
    random.shuffle(sources)

    n_eval_docs = max(3, int(len(sources) * 0.15))
    eval_sources = set(sources[:n_eval_docs])
    train_sources = sources[n_eval_docs:]

    def make_examples(source_list, batch_size=6):
        examples = []
        for src in source_list:
            fields = by_source[src]
            seen_keys = {}
            for f in fields:
                if f["skip"]:
                    continue
                k = f["field_key"]
                seen_keys[k] = seen_keys.get(k, 0) + 1
                if seen_keys[k] > 1:
                    f["field_key"] = f"{k}_{seen_keys[k]}"

            for i in range(0, len(fields), batch_size):
                chunk = fields[i : i + batch_size]
                candidates = [{"context": c["label"]} for c in chunk]
                answers = []
                for idx, c in enumerate(chunk):
                    if c["skip"]:
                        answers.append({"index": idx, "skip": True})
                    else:
                        answers.append(
                            {
                                "index": idx,
                                "skip": False,
                                "field_key": c["field_key"],
                                "field_label": c["label"].strip(),
                                "field_type": c["field_type"],
                                "options": [],
                            }
                        )
                prompt = build_prompt("전북/전국 수출지원사업 (실제 공고 기반)", src[:60], candidates)
                response_text = json.dumps(answers, ensure_ascii=False)
                examples.append(
                    {
                        "contents": [
                            {"role": "user", "parts": [{"text": prompt}]},
                            {"role": "model", "parts": [{"text": response_text}]},
                        ]
                    }
                )
        return examples

    train_examples = make_examples(train_sources)
    eval_examples = make_examples(list(eval_sources))

    with open(os.path.join(HERE, "real_blank_candidates_train.jsonl"), "w", encoding="utf-8") as f:
        for ex in train_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    with open(os.path.join(HERE, "real_blank_candidates_eval.jsonl"), "w", encoding="utf-8") as f:
        for ex in eval_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    total_fields = sum(len(v) for v in by_source.values())
    total_skip = sum(1 for v in by_source.values() for x in v if x["skip"])
    print(f"실제 문서 수: {len(sources)} (학습 {len(train_sources)} / 검증 {len(eval_sources)})")
    print(f"실제 후보 총 개수: {total_fields} (skip=false {total_fields - total_skip} / skip=true {total_skip})")
    print(f"학습 예시(배치 단위): {len(train_examples)}개")
    print(f"검증 예시(배치 단위): {len(eval_examples)}개")


if __name__ == "__main__":
    main()
