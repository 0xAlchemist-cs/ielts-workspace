# -*- coding: utf-8 -*-
"""Merge 2026 May-Aug season speaking banks (HRU 122 topics + tutuhua 55 cue cards)
into one import-ready JSON.

Output: data/speaking-bank/season-2026.json
  { part1: [{topic, questions[]}], part2: [{cue, hints[]}], part3: [{topic, questions[]}] }
Part 2 deduped by normalized cue text across the two sources.
"""
import json, re, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HRU = Path(r"D:\雅思\ielts-repos\HRU-IELTS-QuestionBank\data\questions.json")
TUTU = Path(r"D:\雅思\ielts-repos\IELTS-Speaking-Lab\ielts-speaking\index.html")
OUT = Path(r"D:\雅思\ielts-workspace\data\speaking-bank\season-2026.json")

part1, part2, part3 = [], [], []
seen_cues = set()

def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())

# ── HRU ──────────────────────────────────────────────────────────────────────
d = json.loads(HRU.read_text(encoding="utf-8"))
for t in d["topics"]:
    if t["kind"] == "part1":
        qs = [q.strip() for q in t.get("questions", []) if q.strip().endswith("?") and len(q) > 12]
        if t.get("title") and qs:
            part1.append({"topic": t["title"], "questions": qs})
    elif t["kind"] == "part23":
        p2 = t.get("part2") or {}
        cue = (p2.get("prompt") or "").strip()
        points = [p.strip() for p in (p2.get("points") or []) if len(p.strip()) > 3]
        key = norm(cue)
        if cue and key not in seen_cues and re.match(r"^Describe\b", cue, re.I):
            seen_cues.add(key)
            part2.append({"cue": cue, "hints": points[:4]})
        qs = [q.strip() for q in (t.get("part3") or []) if q.strip().endswith("?") and len(q.strip()) > 15 and "[小问待补充]" not in q]
        if t.get("title") and qs:
            part3.append({"topic": t["title"], "questions": qs[:6]})
print(f"HRU: part1 {len(part1)}, part2 {len(part2)}, part3 {len(part3)}")

# ── tutuhua cueCards ─────────────────────────────────────────────────────────
h = TUTU.read_text(encoding="utf-8")
seg = h[h.find("const cueCards"):]
seg = seg[: seg.find("];")]
cards = re.findall(r'\{\s*id:"[^"]*"[^}]*?topic_en:"([^"]+)"[^}]*?bullets:\s*\[([^\]]+)\]', seg, re.S)
added = 0
for cue, bullets in cards:
    cue = cue.replace("\\'", "'").strip()
    key = norm(cue)
    if key in seen_cues:
        continue
    seen_cues.add(key)
    hints = [re.sub(r'["\\]', "", b).strip() for b in bullets.split(",") if len(b.strip()) > 3]
    part2.append({"cue": cue, "hints": hints[:4]})
    added += 1
print(f"tutuhua cards: {len(cards)}, new after dedupe: {added}, part2 total: {len(part2)}")

OUT.write_text(json.dumps({"part1": part1, "part2": part2, "part3": part3}, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
for p in part1[:2]: print("P1:", p["topic"], "->", p["questions"][:2])
for p in part2[:2]: print("P2:", p["cue"][:80], "| hints:", p["hints"][:2])
for p in part3[:2]: print("P3:", p["topic"], "->", p["questions"][:2])
