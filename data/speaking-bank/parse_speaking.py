# -*- coding: utf-8 -*-
"""Extract speaking questions from the 2025 1-4月 题库 md into task-ready JSON.

Input : data/md-corpus/chinese/雅思口语2025年1-4月雅思口语题库.md
Output: data/speaking-bank/speaking.json
  { part1: [{topic, questions[]}], part2: [{titleZh, cue, hints[]}], part3: [{titleZh, questions[]}] }
"""
import json, re, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SRC = Path(r"D:\雅思\ielts-workspace\data\md-corpus\chinese\雅思口语2025年1-4月雅思口语题库.md")
OUT = Path(r"D:\雅思\ielts-workspace\data\speaking-bank\speaking.json")

lines = SRC.read_text(encoding="utf-8").splitlines()

# locate section boundaries
def find(pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i].strip()):
            return i
    return -1

i_new = find(lambda s: s.startswith("# 2025年1-4月 新题题库"))
i_kept = find(lambda s: s.startswith("# 2025年1-4月保留题库"))
i_p1_new = find(lambda s: s.startswith("## Part1"), i_new)
i_p23_new = find(lambda s: s.startswith("## Part2&3"), i_new)
i_p1_kept = find(lambda s: s.startswith("## Part1"), i_kept)
i_p23_kept = find(lambda s: s.startswith("## Part2&3"), i_kept)
print("sections:", i_new, i_p1_new, i_p23_new, i_kept, i_p1_kept, i_p23_kept)

QNUM = re.compile(r"^(\d{1,2})[.、．]\s*(.*)$")

def question_from(text: str) -> str | None:
    """English question = up to the first '?', plus a short trailing tag like 'Why?' if present."""
    if not text or not re.match(r"^[A-Za-z]", text):
        return None
    cut = text.find("?")
    if cut == -1:
        return None
    q = text[: cut + 1].strip()
    rest = text[cut + 1 :].strip()
    m = re.match(r"^([A-Z][a-zA-Z ,]{0,14}\?)\s", rest + " ")
    if m and len(m.group(1)) <= 14:
        q = q + " " + m.group(1)
    q = re.sub(r"\s+", " ", q)
    return q if 12 <= len(q) <= 220 else None

# ── Part 1 topics (new + kept) ───────────────────────────────────────────────
part1 = []
def parse_part1(seg_lines):
    topic = None
    qs: list = []
    for ln in seg_lines:
        s = ln.strip()
        h = re.match(r"^#{2,3}\s*\d*[.\s]*([A-Za-z][^#]*?)\s*$", s)
        if h and "&" not in s and "Part" not in s:
            if topic and qs:
                part1.append({"topic": topic, "questions": qs})
            topic = re.sub(r"\s+", " ", h.group(1)).strip()
            qs = []
            continue
        m = QNUM.match(s)
        if m and topic:
            q = question_from(m.group(2))
            if q:
                qs.append(q)
    if topic and qs:
        part1.append({"topic": topic, "questions": qs})

parse_part1(lines[i_p1_new + 1 : i_p23_new])
parse_part1(lines[i_p1_kept + 1 : i_p23_kept])
print(f"part1 topics: {len(part1)}, questions: {sum(len(p['questions']) for p in part1)}")

# ── Part 2&3 (new: structured blocks; kept: inline ***N.*** paragraphs) ─────
part2, part3 = [], []

def cue_from(block: str):
    """Extract 'Describe …' cue + hint fragments from a text block (kept-style inline)."""
    block = re.split(r"参考回答|参考答案", block)[0]
    m = re.search(r"Describe (.*)", block, re.S)
    if not m:
        return None, []
    parts = re.split(r"\s+(?=When\s|What\s|Who\s|Where\s|Why\s|How\s|And explain\s)", "Describe " + m.group(1))
    cue = re.sub(r"\s+", " ", parts[0]).strip()
    hints = [re.sub(r"\s+", " ", h).strip() for h in parts[1:] if len(h.strip()) > 4][:4]
    return cue, hints

HINT_LINE = re.compile(r"^(When|What|Who|Where|Why|How|And explain)\b")

# new-style blocks: ## N. 标题 … ### Part 3 …
seg = lines[i_p23_new + 1 : i_kept]
cur2 = None
cur3qs: list = []
def flush23():
    global cur2, cur3qs
    if cur2:
        part2.append(cur2)
        part3.append({"titleZh": cur2["titleZh"], "questions": cur3qs})
    cur2, cur3qs = None, []

for ln in seg:
    s = ln.strip()
    h = re.match(r"^##\s*\d+[.\s]*([^#]+)$", s)
    if h and "Part" not in s:
        flush23()
        cur2 = {"titleZh": h.group(1).strip(), "cue": "", "hints": []}
        cur3qs = []
        continue
    if cur2 is None:
        continue
    if s.startswith("### Part"):
        continue
    if s.lower().startswith("describe"):
        cue, hints = cue_from(s)
        if cue:
            cur2["cue"] = cur2["cue"] or cue
            cur2["hints"] = cur2["hints"] or hints
        continue
    if HINT_LINE.match(s) and cur2["cue"] and not cur2["hints"]:
        cur2["hints"] = [re.sub(r"\s+", " ", h).strip() for h in re.split(r"\s+(?=When\s|What\s|Who\s|Where\s|Why\s|How\s|And explain\s)", s) if len(h.strip()) > 4][:4]
        continue
    if cur3qs is not None:
        m = QNUM.match(s)
        if m:
            q = question_from(m.group(2))
            if q:
                cur3qs.append(q)
flush23()

# kept-style: ***N.*** 标题 Describe … 参考回答 … inline; then ### Part 3 numbered Qs
seg = lines[i_p23_kept + 1 :]
cur2 = None
cur3qs = []
for ln in seg:
    s = ln.strip()
    h = re.match(r"^\*\*\*(\d+)[.]*\*\*\*\s*(.+)$", s)
    if h:
        flush23()
        rest = h.group(2).strip()
        zh = rest.split("Describe", 1)[0].strip()
        cur2 = {"titleZh": zh or "未命名", "cue": "", "hints": []}
        cur3qs = []
        cue, hints = cue_from(rest)
        if cue:
            cur2["cue"] = cue
            cur2["hints"] = hints
        continue
    if cur2 is None:
        continue
    if s.startswith("### Part"):
        continue
    if s.lower().startswith("describe") or "参考回答" in s:
        cue, hints = cue_from(s)
        if cue:
            cur2["cue"] = cur2["cue"] or cue
            cur2["hints"] = cur2["hints"] or hints
        continue
    m = QNUM.match(s)
    if m:
        q = question_from(m.group(2))
        if q:
            cur3qs.append(q)
flush23()

part2 = [p for p in part2 if p["cue"]]
part3 = [p for p in part3 if p["questions"]]
print(f"part2 cue cards: {len(part2)}, part3 topics: {len(part3)}, part3 questions: {sum(len(p['questions']) for p in part3)}")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"part1": part1, "part2": part2, "part3": part3}, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
for p in part1[:2]: print("P1:", p["topic"], "->", p["questions"][:2])
for p in part2[:2]: print("P2:", p["titleZh"], "->", p["cue"][:80], "| hints:", len(p["hints"]))
for p in part3[:2]: print("P3:", p["titleZh"], "->", p["questions"][:2])
