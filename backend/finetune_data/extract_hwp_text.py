"""real_forms/ 안의 모든 .hwp 파일에서 PrvText(미리보기 텍스트) 스트림을 뽑아
real_forms_text/ 밑에 같은 이름의 .txt로 저장한다. hwp5txt 본문 추출이 이 파일들에서는
빈 결과를 내서(구조상 이유 불명), 대안으로 PrvText 스트림을 쓴다 - 실제로 읽어보니
라벨/예시값이 온전히 들어있어서 필드 정리에 충분하다."""

import glob
import os

import olefile

SRC_DIRS = [
    os.path.join(os.path.dirname(__file__), "real_forms"),
    os.path.join(os.path.dirname(__file__), "real_forms_bizinfo"),
]
OUT_DIR = os.path.join(os.path.dirname(__file__), "real_forms_text")
os.makedirs(OUT_DIR, exist_ok=True)

all_paths = []
for SRC_DIR in SRC_DIRS:
    all_paths.extend(glob.glob(os.path.join(SRC_DIR, "**", "*.hwp"), recursive=True))

for path in all_paths:
    name = os.path.basename(path)
    out_path = os.path.join(OUT_DIR, name + ".txt")
    try:
        ole = olefile.OleFileIO(path)
        if not ole.exists("PrvText"):
            print("NO_PRVTEXT:", name)
            continue
        data = ole.openstream("PrvText").read()
        text = data.decode("utf-16le", errors="replace")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
        print("OK:", name, f"({len(text)} chars)")
    except Exception as e:
        print("FAIL:", name, e)
