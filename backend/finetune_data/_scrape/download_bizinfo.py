import json
import os
import re

import requests

with open("bizinfo_manifest.json", encoding="utf-8") as f:
    items = json.load(f)

OUT_DIR = os.path.join("..", "real_forms_bizinfo")
os.makedirs(OUT_DIR, exist_ok=True)

ok, fail = 0, 0
for it in items:
    safe_name = re.sub(r'[\\/:*?"<>|]', "_", f"{it['pblancId']}__{it['fileName']}")
    out_path = os.path.join(OUT_DIR, safe_name)
    if os.path.exists(out_path):
        ok += 1
        continue
    try:
        resp = requests.get(it["url"], headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        resp.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(resp.content)
        ok += 1
    except Exception as e:
        print("FAIL:", it["fileName"], e)
        fail += 1

print(f"done. ok={ok} fail={fail}")
