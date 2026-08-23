"""hwpx는 zip 컨테이너이고 안에 Preview/PrvText.txt로 이미 평문 미리보기가 들어있어서
그걸 그대로 꺼내 쓴다 (hwp의 OLE PrvText 스트림과 같은 역할)."""

import glob
import os
import zipfile

SRC_DIRS = [
    os.path.join(os.path.dirname(__file__), "real_forms"),
    os.path.join(os.path.dirname(__file__), "real_forms_bizinfo"),
]
OUT_DIR = os.path.join(os.path.dirname(__file__), "real_forms_text")
os.makedirs(OUT_DIR, exist_ok=True)

all_paths = []
for SRC_DIR in SRC_DIRS:
    all_paths.extend(glob.glob(os.path.join(SRC_DIR, "**", "*.hwpx"), recursive=True))

for path in all_paths:
    name = os.path.basename(path)
    out_path = os.path.join(OUT_DIR, name + ".txt")
    try:
        with zipfile.ZipFile(path) as z:
            data = z.read("Preview/PrvText.txt")
        text = data.decode("utf-8", errors="replace")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
        print("OK:", name, f"({len(text)} chars)")
    except Exception as e:
        print("FAIL:", name, e)
