# -*- coding: utf-8 -*-
"""Parse 2022 1-4月 大作文真题范文 into (a) question bank JSON, (b) per-essay md files.

Structure per section:
  # 2022.01.08 (教育类，讨论类)
  题目：
  <English question, possibly wrapped>
  <Chinese translation...>
  范文：
  <English essay with **bold** vocabulary highlights>

Output:
  data/writing-bank/past2022.json  [{date, categoryZh, prompt}]
  data/md-corpus/zeeklog/essay-2022-MMDD.md  (English essay only)
"""
import json, re, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SRC = Path(r"D:\雅思\ielts-workspace\data\md-corpus\zeeklog\2022年1-4月大作文真题范文.md")
OUT_JSON = Path(r"D:\雅思\ielts-workspace\data\writing-bank\past2022.json")
ESSAY_DIR = Path(r"D:\雅思\ielts-workspace\data\md-corpus\zeeklog")
CJK = re.compile(r"[\u4e00-\u9fff]")

t = SRC.read_text(encoding="utf-8")
lines = t.splitlines()
sections = []  # (date, categoryZh, body_lines)
cur = None
for ln in lines:
    s = ln.strip()
    h = re.match(r"^#\s*(20\d{2}\.\d{1,2}\.\d{1,2})\s*[（(]([^）)]+)[）)]", s)
    if h:
        cur = {"date": h.group(1), "categoryZh": h.group(2).strip(), "lines": []}
        sections.append(cur)
    elif cur is not None and s:
        cur["lines"].append(s)

records, essays = [], []
for sec in sections:
    text = "\n".join(sec["lines"])
    m = re.search(r"题目：\s*\n(.*?)\n范文：", text, re.S)
    if not m:
        continue
    qblock = m.group(1)
    # English question = lines before the first CJK-containing line
    q_lines = []
    for ln in qblock.splitlines():
        if CJK.search(ln):
            break
        q_lines.append(ln.strip())
    prompt = re.sub(r"\s+", " ", " ".join(q_lines)).strip()
    if len(prompt) < 60:
        continue
    records.append({"date": sec["date"], "categoryZh": sec["categoryZh"], "prompt": prompt})

    e = re.search(r"范文：\s*\n(.*)$", text, re.S)
    if e:
        essay = e.group(1)
        essay = re.sub(r"\*\*", "", essay)  # strip bold highlights
        # drop Chinese translation paragraphs interleaved? keep only CJK-free lines
        keep = [ln.strip() for ln in essay.splitlines() if ln.strip() and not CJK.search(ln)]
        essay_text = re.sub(r"\s+", " ", " ".join(keep)).strip()
        if len(essay_text) > 400:
            essays.append((sec["date"], sec["categoryZh"], essay_text))

print(f"2022 questions: {len(records)}, essays kept: {len(essays)}")
OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
CAT_EN = {"教育": "education", "社会": "society", "文化": "culture", "政府": "government",
          "交通": "transport", "科技": "technology", "环境": "environment", "媒体": "media",
          "全球化": "globalisation", "抽象": "abstract"}
for date, cat, essay in essays:
    d = date.replace(".", "-")
    cat_en = next((v for k, v in CAT_EN.items() if k in cat), "general")
    title = f"2022 Task 2 Model Essay — {d} ({cat_en})"
    md = (f"# {title}\n\n> 来源: 2022年1-4月大作文真题范文 · 真题: {date} ({cat})\n\n"
          f"**Question.** {next(r['prompt'] for r in records if r['date'] == date)}\n\n"
          f"## Model Essay\n\n{essay}\n")
    (ESSAY_DIR / f"essay-{d}.md").write_text(md, encoding="utf-8")
print("wrote", OUT_JSON, f"and {len(essays)} essay md files")
for r in records[:3]:
    print("  ", r["date"], r["categoryZh"], "->", r["prompt"][:90])
