# -*- coding: utf-8 -*-
"""Convert the dumped 2025 Sep-Dec season data into the standard season JSON.
Output: data/speaking-bank/season-2025.json
  { part1: [{topic, questions[]}], part2: [{cue, hints[]}], part3: [{topic, questions[]}] }
"""
import json, re, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

raw = json.loads(Path(r"D:\雅思\ielts-workspace\data\speaking-bank\season-2025-raw.json").read_text(encoding="utf-8"))
part1, part2, part3 = [], [], []
for c in raw["part1"]:
    qs = [q.strip() for q in c.get("questions", []) if q.strip().endswith("?") and len(q) > 12]
    if c.get("topic") and qs:
        part1.append({"topic": c["topic"], "questions": qs})
for c in raw["part2"]:
    cue = (c.get("part2Title") or "").strip()
    if re.match(r"^Describe\b", cue, re.I):
        part2.append({"cue": cue, "hints": [p.strip() for p in c.get("part2Prompts", []) if len(p.strip()) > 3][:4]})
    qs = [q.strip() for q in c.get("questions", []) if q.strip().endswith("?") and len(q) > 15]
    if c.get("title") and qs:
        part3.append({"topic": c["title"], "questions": qs[:6]})
print(f"part1: {len(part1)}, part2: {len(part2)}, part3: {len(part3)}")
Path(r"D:\雅思\ielts-workspace\data\speaking-bank\season-2025.json").write_text(
    json.dumps({"part1": part1, "part2": part2, "part3": part3}, ensure_ascii=False, indent=1), encoding="utf-8")
