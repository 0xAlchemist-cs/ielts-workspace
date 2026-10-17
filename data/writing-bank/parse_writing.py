# -*- coding: utf-8 -*-
"""Extract writing Task 2 questions from converted Chinese-source mds.

2020 真题: date-prefixed wrapped lines -> one question per date.
2025 预测: numbered English lines containing task markers (skip essay material).

Output: data/writing-bank/writing.json
  { past2020: [{date, prompt}], predict2025: [prompt] }
"""
import json, re, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CH = Path(r"D:\雅思\ielts-workspace\data\md-corpus\chinese")
OUT = Path(r"D:\雅思\ielts-workspace\data\writing-bank\writing.json")

# ── 2020 past papers ─────────────────────────────────────────────────────────
t = (CH / "2020年全年雅思作文真题.md").read_text(encoding="utf-8")
past = []
cur_date, cur_text = None, ""
DATE = re.compile(r"^(20\d{2}\.\d{1,2}\.\d{1,2})\s*(.*)$")
for ln in t.splitlines():
    s = ln.strip()
    if not s or s.startswith("<u>"): continue
    m = DATE.match(s)
    if m:
        if cur_date and cur_text:
            past.append({"date": cur_date, "prompt": re.sub(r"\s+", " ", cur_text).strip()})
        cur_date, cur_text = m.group(1), m.group(2)
    elif cur_date:
        cur_text += " " + s
if cur_date and cur_text:
    past.append({"date": cur_date, "prompt": re.sub(r"\s+", " ", cur_text).strip()})
print(f"2020 past papers: {len(past)}")

# ── 2025 predictions ─────────────────────────────────────────────────────────
t = (CH / "雅思作文（大）2025.1-4月雅思写作大作文预测.md").read_text(encoding="utf-8")
lines = t.splitlines()
NUM = re.compile(r"^(\d{1,2})[.、]\s*(.*)$")
MARK = re.compile(r"(To what extent|Discuss both|Do you agree or disagree|Do the advantages|advantages outweigh|positive or negative|negative or positive|What problems|What are the (causes|reasons|benefits)|advantages or disadvantages|Why is (this|it)|Is it a)")
BAD = re.compile(r"^(In conclusion|Firstly|Secondly|Thirdly|Moreover|Furthermore|However|While |It is |This |Admittedly|On the other|Overall|To conclude|In summary)")
CJK = re.compile(r"[\u4e00-\u9fff]")

pred = []
seen = set()
i = 0
while i < len(lines):
    s = lines[i].strip().strip("*").strip()
    m = NUM.match(s)
    if not (m and MARK.search(s) and not BAD.match(s)):
        i += 1
        continue
    # accumulate the numbered line + wrapped continuation lines (until blank / next number / CJK-heavy line)
    buf = m.group(2)
    j = i + 1
    while j < len(lines):
        nxt = lines[j].strip()
        if not nxt or NUM.match(nxt.strip("*").strip()) or CJK.search(nxt[:12]):
            break
        buf += " " + nxt
        j += 1
    cjk = CJK.search(buf)
    if cjk:
        buf = buf[: cjk.start()]
    buf = re.sub(r"\*+", "", buf)
    buf = re.sub(r"\s+", " ", buf).strip()
    cut = buf.rfind("?")
    if cut == -1:
        i = j if j > i else i + 1
        continue  # no question mark in the English part → material, not a prompt
    buf = buf[: cut + 1].strip()
    if 80 <= len(buf) <= 500 and MARK.search(buf) and buf not in seen:
        seen.add(buf)
        pred.append(buf)
    i = j if j > i else i + 1
print(f"2025 predicted questions: {len(pred)}")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"past2020": past, "predict2025": pred}, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
for p in past[:3]: print("  2020:", p["date"], p["prompt"][:110])
for p in pred[:3]: print("  2025:", p[:110])
