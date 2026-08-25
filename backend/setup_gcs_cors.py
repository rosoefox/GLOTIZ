"""생성된 마케팅 이미지가 담긴 GCS 버킷에 CORS를 열어주는 1회성 설정 스크립트.

"이미지 저장" 버튼(html-to-image의 toPng)은 미리보기 화면을 캔버스에 그려서 PNG로 내보내는데,
그 안에 들어있는 상품 이미지가 화면과 다른 오리진(storage.googleapis.com)에서 오는 경우 그
버킷에 CORS 허용이 없으면 브라우저가 캔버스를 "오염"된 것으로 취급해 저장이 조용히 실패한다.
이 스크립트를 한 번 실행하면 그 뒤로는 새로고침 없이 바로 저장이 된다(버킷 설정은 GCS 쪽에
영구히 남으므로 매번 실행할 필요는 없다).

사용법 (backend 폴더에서):
    python setup_gcs_cors.py
"""

import os

from dotenv import load_dotenv
from google.cloud import storage

load_dotenv()

BUCKET_NAME = os.environ.get("GCS_GENERATED_BUCKET")

if not BUCKET_NAME:
    raise SystemExit("GCS_GENERATED_BUCKET 환경변수가 설정되어 있지 않습니다 (.env를 확인하세요).")

client = storage.Client()
bucket = client.bucket(BUCKET_NAME)
# 서명된 URL(신뢰 여부가 URL 자체의 서명에 달려있고 쿠키/인증정보를 쓰지 않음)로만 접근하므로
# 오리진을 넓게 허용해도 안전하다 — 로컬 개발 포트(5173, 5174...)를 매번 추가할 필요도 없다.
bucket.cors = [
    {
        "origin": ["*"],
        "method": ["GET", "HEAD"],
        "responseHeader": ["Content-Type"],
        "maxAgeSeconds": 3600,
    }
]
bucket.patch()

print(f"'{BUCKET_NAME}' 버킷에 CORS를 설정했습니다. 이제 '이미지 저장' 버튼이 정상 동작해야 합니다.")
