"""real_blank_candidates_eval.jsonl(held-out, 학습에 안 쓴 8개 실제 문서)로 모델을 채점한다.
base(튜닝 전 gemini-2.5-flash) 또는 tuned(튜닝된 모델 endpoint)를 인자로 받아서 실행.

채점 기준:
- skip 판단 정확도 (실제로 채워야 할 필드인지 장식인지)
- field_type 정확도 (skip=false인 것들 중)
- field_key 정확일치율 (skip=false인 것들 중, 엄격한 기준)
"""

import argparse
import json
import os
import sys

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

HERE = os.path.dirname(__file__)

RESPONSE_SCHEMA = {
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
}


def load_eval_examples():
    examples = []
    with open(os.path.join(HERE, "real_blank_candidates_eval.jsonl"), encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line)
            prompt = ex["contents"][0]["parts"][0]["text"]
            ground_truth = json.loads(ex["contents"][1]["parts"][0]["text"])
            examples.append({"prompt": prompt, "ground_truth": ground_truth})
    return examples


def score(predicted, ground_truth):
    gt_by_idx = {g["index"]: g for g in ground_truth}
    pred_by_idx = {p["index"]: p for p in predicted}

    n = len(ground_truth)
    skip_correct = 0
    type_correct = 0
    type_total = 0
    key_exact = 0
    key_total = 0
    mismatches = []

    for idx, gt in gt_by_idx.items():
        pred = pred_by_idx.get(idx)
        if pred is None:
            mismatches.append({"index": idx, "reason": "모델이 이 index를 안 냄", "gt": gt})
            continue
        if pred.get("skip") == gt.get("skip"):
            skip_correct += 1
        else:
            mismatches.append({"index": idx, "reason": "skip 판단 틀림", "gt": gt, "pred": pred})
            continue  # skip 자체가 틀리면 아래 세부 비교는 의미 없음

        if not gt.get("skip"):
            type_total += 1
            if pred.get("field_type") == gt.get("field_type"):
                type_correct += 1
            key_total += 1
            if pred.get("field_key") == gt.get("field_key"):
                key_exact += 1
            else:
                mismatches.append(
                    {
                        "index": idx,
                        "reason": "field_key 불일치 (의미는 맞을 수도 있음)",
                        "gt_key": gt.get("field_key"),
                        "pred_key": pred.get("field_key"),
                        "label": gt.get("field_label"),
                    }
                )

    return {
        "n": n,
        "skip_accuracy": skip_correct / n if n else 0,
        "type_accuracy": type_correct / type_total if type_total else None,
        "key_exact_match_rate": key_exact / key_total if key_total else None,
        "mismatches": mismatches,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gemini-2.5-flash", help="모델 ID (base 또는 튜닝된 엔드포인트)")
    parser.add_argument("--label", default="base", help="결과 파일 이름에 붙일 라벨 (base/tuned)")
    args = parser.parse_args()

    client = genai.Client(
        vertexai=True,
        project=os.environ["VERTEX_AI_PROJECT_ID"],
        location="us-central1",
    )

    examples = load_eval_examples()
    print(f"검증 예시 {len(examples)}개, 모델: {args.model}", file=sys.stderr)

    all_results = []
    agg = {"n": 0, "skip_correct": 0, "type_correct": 0, "type_total": 0, "key_exact": 0, "key_total": 0}

    for i, ex in enumerate(examples):
        try:
            resp = client.models.generate_content(
                model=args.model,
                contents=ex["prompt"],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=RESPONSE_SCHEMA,
                ),
            )
            predicted = json.loads(resp.text)
        except Exception as e:
            print(f"[{i}] 호출 실패: {e}", file=sys.stderr)
            predicted = []

        s = score(predicted, ex["ground_truth"])
        all_results.append(s)
        agg["n"] += s["n"]
        agg["skip_correct"] += s["skip_accuracy"] * s["n"]
        if s["type_accuracy"] is not None:
            agg["type_total"] += 1
            agg["type_correct"] += s["type_accuracy"]
        if s["key_exact_match_rate"] is not None:
            agg["key_total"] += 1
            agg["key_exact"] += s["key_exact_match_rate"]
        print(f"[{i+1}/{len(examples)}] skip_acc={s['skip_accuracy']:.2f} type_acc={s['type_accuracy']} key_exact={s['key_exact_match_rate']}", file=sys.stderr)

    summary = {
        "model": args.model,
        "overall_skip_accuracy": agg["skip_correct"] / agg["n"] if agg["n"] else None,
        "overall_type_accuracy_avg_per_batch": agg["type_correct"] / agg["type_total"] if agg["type_total"] else None,
        "overall_key_exact_match_avg_per_batch": agg["key_exact"] / agg["key_total"] if agg["key_total"] else None,
    }

    out_path = os.path.join(HERE, f"eval_result_{args.label}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "details": all_results}, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
